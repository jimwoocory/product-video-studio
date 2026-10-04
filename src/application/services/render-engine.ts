import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ArtifactRepository } from "../ports/artifact-repository.js";
import type {
  FinalAssembly,
  FinalOutputRepository
} from "../ports/final-output-repository.js";
import type { TimelineRepository } from "../ports/timeline-repository.js";
import type { ProductFlowService } from "./product-flow.js";
import type {
  RenderJob,
  Timeline,
  TimelineClipEdit,
  TimelineAudioItem,
  TimelineTextItem
} from "../../domain/schemas.js";
import { sha256Bytes } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import { LocalArtifactStore } from "../../adapters/store/local-artifact-store.js";
import { inspectMedia } from "../../adapters/media/inspect-media.js";
import { audioVolumeFilter, renderableText } from "./render-audio.js";
import { timelineDurationMs, timelineDecisionHash } from "./timeline-service.js";
import { withSerialOperation } from "./serial-operation.js";

function execFileAsync(
  file: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 900_000,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              file +
                " failed: " +
                error.message +
                "\n" +
                String(stderr).slice(-8000)
            )
          );
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeDrawtext(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll(":", "\\:")
    .replaceAll("%", "\\%")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n");
}

function positionExpression(position: "TOP" | "CENTER" | "BOTTOM"): string {
  if (position === "TOP") return "h*0.08";
  if (position === "CENTER") return "(h-text_h)/2";
  return "h-text_h-h*0.08";
}

type VideoInput = {
  clip: TimelineClipEdit;
  absolutePath: string;
  hasAudio: boolean;
};

export class RenderEngine {
  constructor(
    private readonly productFlow: ProductFlowService,
    private readonly artifacts: ArtifactRepository,
    private readonly timelines: TimelineRepository,
    private readonly finalOutput: FinalOutputRepository,
    private readonly projectsRoot: string,
    private readonly ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg",
    private readonly ffprobePath = process.env.FFPROBE_PATH ?? "ffprobe"
  ) {}

  private async hasAudioStream(absolutePath: string): Promise<boolean> {
    try {
      const result = await execFileAsync(
        this.ffprobePath,
        [
          "-v",
          "error",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=index",
          "-of",
          "csv=p=0",
          absolutePath
        ],
        { timeout: 30_000 }
      );
      return Boolean(result.stdout.trim());
    } catch {
      return false;
    }
  }

  private async resolveFontFile(): Promise<string | undefined> {
    const candidates = [
      "C:\\Windows\\Fonts\\msyh.ttc",
      "C:\\Windows\\Fonts\\msyhbd.ttc",
      "C:\\Windows\\Fonts\\simhei.ttf",
      "C:\\Windows\\Fonts\\arial.ttf"
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Continue to the next installed font.
      }
    }
    return undefined;
  }

  private async verifyArtifact(input: {
    projectId: string;
    artifactId: string;
    artifactHash: string;
    expectedVideo?: boolean;
    expectedAudio?: boolean;
    store: LocalArtifactStore;
  }): Promise<{ absolutePath: string; mimeType?: string }> {
    const artifact = await this.artifacts.findById(input.artifactId);
    if (
      !artifact ||
      artifact.projectId !== input.projectId ||
      artifact.integrityStatus !== "READY" ||
      !artifact.sha256 ||
      artifact.sha256 !== input.artifactHash
    ) {
      throw new DomainValidationError(
        "Timeline input Artifact is not READY or hash changed: " +
          input.artifactId
      );
    }
    if (input.expectedVideo && artifact.kind !== "GENERATED_VIDEO") {
      throw new DomainValidationError(
        "Timeline video input must reference GENERATED_VIDEO: " +
          input.artifactId
      );
    }
    if (
      input.expectedAudio &&
      (!artifact.mimeType || !artifact.mimeType.startsWith("audio/"))
    ) {
      throw new DomainValidationError(
        "Timeline BGM input must reference an audio Artifact: " +
          input.artifactId
      );
    }
    const absolutePath = input.store.resolveArtifactPath(artifact.relativePath);
    const bytes = await fs.readFile(absolutePath);
    const actualHash = sha256Bytes(bytes);
    if (actualHash !== input.artifactHash) {
      throw new DomainValidationError(
        "Timeline input Artifact bytes changed: " + input.artifactId
      );
    }
    return {
      absolutePath,
      ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {})
    };
  }

  private assertJobInputs(timeline: Timeline, job: RenderJob): void {
    const expected = new Map<string, string>();
    for (const clip of timeline.clips) {
      if (!clip.deleted) {
        expected.set(clip.sourceArtifactId, clip.sourceArtifactHash);
      }
    }
    for (const item of timeline.audioItems) {
      if (!item.deleted) {
        expected.set(item.sourceArtifactId, item.sourceArtifactHash);
      }
    }
    for (const mask of timeline.repairMasks) {
      if (mask.deleted) continue;
      if (expected.get(mask.sourceArtifactId) !== mask.sourceArtifactHash) {
        throw new DomainValidationError(
          "Repair mask source no longer matches confirmed Timeline video: " +
            mask.sourceArtifactId
        );
      }
    }
    const actual = new Map<string, string>();
    job.inputArtifactIds.forEach((id, index) => {
      actual.set(id, job.inputArtifactHashes[index] ?? "");
    });
    if (actual.size !== expected.size) {
      throw new DomainValidationError(
        "RenderJob input Artifact set no longer matches confirmed Timeline"
      );
    }
    for (const [id, hash] of expected) {
      if (actual.get(id) !== hash) {
        throw new DomainValidationError(
          "RenderJob input Artifact hash mismatch: " + id
        );
      }
    }
  }

  private buildFilterGraph(input: {
    timeline: Timeline;
    job: RenderJob;
    videos: VideoInput[];
    audioInputs: Array<{ item: TimelineAudioItem; index: number }>;
    texts: TimelineTextItem[];
    textFiles: Map<string, string>;
    fontFile?: string;
  }): { filter: string; videoLabel: string; audioLabel: string } {
    const { timeline, job, videos } = input;
    const config = job.renderConfig;
    const filters: string[] = [];
    const durationsMs = videos.map(
      (item) => item.clip.outMs - item.clip.inMs
    );

    videos.forEach((item, index) => {
      const clip = item.clip;
      const inSec = seconds(clip.inMs);
      const outSec = seconds(clip.outMs);
      filters.push(
        "[" +
          index +
          ":v]trim=start=" +
          inSec +
          ":end=" +
          outSec +
          ",setpts=PTS-STARTPTS" +
          ",scale=" +
          config.width +
          ":" +
          config.height +
          ":force_original_aspect_ratio=decrease" +
          ",pad=" +
          config.width +
          ":" +
          config.height +
          ":(ow-iw)/2:(oh-ih)/2:black" +
          ",setsar=1,fps=" +
          config.fps +
          ",format=yuv420p,settb=AVTB[v" +
          index +
          "]"
      );
      const volumeFilter = audioVolumeFilter(clip.audio, durationsMs[index]!, timeline.tracks.find(t => t.id === clip.trackId)?.muted);
      if (item.hasAudio) {
        filters.push(
          "[" +
            index +
            ":a]atrim=start=" +
            inSec +
            ":end=" +
            outSec +
            ",asetpts=PTS-STARTPTS" +
            ",aresample=48000" +
            ",aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo" +
            ",apad,atrim=duration=" + seconds(durationsMs[index]!) + "," + volumeFilter +
            "[a" +
            index +
            "]"
        );
      } else {
        filters.push(
          "anullsrc=channel_layout=stereo:sample_rate=48000" +
            ",atrim=duration=" +
            seconds(durationsMs[index]!) +
            ",asetpts=PTS-STARTPTS[a" +
            index +
            "]"
        );
      }
    });

    let videoLabel = "v0";
    let audioLabel = "a0";
    let accumulatedMs = durationsMs[0] ?? 0;

    for (let index = 1; index < videos.length; index += 1) {
      const previous = videos[index - 1]!.clip;
      const nextVideo = "v" + index;
      const nextAudio = "a" + index;
      const joinedVideo = "vj" + index;
      const joinedAudio = "aj" + index;

      if (previous.transition.type === "CUT") {
        filters.push(
          "[" +
            videoLabel +
            "][" +
            nextVideo +
            "]concat=n=2:v=1:a=0[" +
            joinedVideo +
            "]"
        );
        filters.push(
          "[" +
            audioLabel +
            "][" +
            nextAudio +
            "]concat=n=2:v=0:a=1[" +
            joinedAudio +
            "]"
        );
        accumulatedMs += durationsMs[index]!;
      } else {
        const transitionMs = previous.transition.durationMs;
        const transitionSec = seconds(transitionMs);
        const offsetSec = seconds(accumulatedMs - transitionMs);
        const transitionName =
          previous.transition.type === "FADE" ? "fadeblack" : "fade";
        filters.push(
          "[" +
            videoLabel +
            "][" +
            nextVideo +
            "]xfade=transition=" +
            transitionName +
            ":duration=" +
            transitionSec +
            ":offset=" +
            offsetSec +
            "[" +
            joinedVideo +
            "]"
        );
        filters.push(
          "[" +
            audioLabel +
            "][" +
            nextAudio +
            "]acrossfade=d=" +
            transitionSec +
            ":c1=tri:c2=tri[" +
            joinedAudio +
            "]"
        );
        accumulatedMs += durationsMs[index]! - transitionMs;
      }

      videoLabel = joinedVideo;
      audioLabel = joinedAudio;
    }

    const activeMasks = timeline.repairMasks.filter((item) => !item.deleted);
    activeMasks.forEach((item, index) => {
      const nextLabel = "vm" + index;
      const x = Math.round(config.width * item.xRatio);
      const y = Math.round(config.height * item.yRatio);
      const width = Math.max(1, Math.round(config.width * item.widthRatio));
      const height = Math.max(1, Math.round(config.height * item.heightRatio));
      const color = item.color === "BLACK" ? "black" : "white";
      filters.push(
        "[" + videoLabel + "]drawbox=" +
          "x=" + x + ":y=" + y + ":w=" + width + ":h=" + height +
          ":color=" + color + "@" + item.opacity.toFixed(3) + ":t=fill" +
          ":enable='between(t," + seconds(item.startMs) + "," + seconds(item.endMs) + ")'[" + nextLabel + "]"
      );
      videoLabel = nextLabel;
    });

    const activeText = input.texts;
    activeText.forEach((item, index) => {
      const nextLabel = "vt" + index;
      const baseFontSize = Math.max(
        20,
        Math.round(
          (item.kind === "CTA" ? 58 : 44) *
            item.fontScale *
            (config.height / 1280)
        )
      );
      const widestLine = Math.max(1, ...item.text.split("\n").map(line => Array.from(line).reduce((n,c) => n + (/[\u0020-\u007e]/.test(c) ? 0.6 : 1), 0)));
      const fontSize = Math.max(12, Math.min(baseFontSize, Math.floor(config.width * 0.86 / widestLine)));
      const textFile = input.textFiles.get(item.id);
      if (!textFile) throw new DomainValidationError("字幕临时文件未准备完成");
      const fontOption = input.fontFile
        ? "fontfile='" +
          input.fontFile.replaceAll("\\", "/").replace(":", "\\:") +
          "':"
        : "";
      filters.push(
        "[" +
          videoLabel +
          "]drawtext=" +
          fontOption +
          "textfile='" + textFile + "':expansion=none:fix_bounds=1:fontcolor=white" +
          ":fontsize=" +
          fontSize +
          ":box=1:boxcolor=black@0.48:boxborderw=" +
          Math.max(8, Math.round(fontSize * 0.28)) +
          ":x=(w-text_w)/2:y=" +
          positionExpression(item.position) +
          ":enable='between(t," +
          seconds(item.startMs) +
          "," +
          seconds(item.endMs) +
          ")'[" +
          nextLabel +
          "]"
      );
      videoLabel = nextLabel;
    });

    const totalMs = Math.max(1, accumulatedMs);
    const mixLabels = [audioLabel];
    for (let i = 0; i < input.audioInputs.length; i++) {
      const { item, index } = input.audioInputs[i]!;
      const label = "postaudio" + i;
      const volume = audioVolumeFilter(item.audio, item.outMs - item.inMs, timeline.tracks.find(t => t.id === item.trackId)?.muted);
      filters.push(`[${index}:a]atrim=start=${seconds(item.inMs)}:end=${seconds(item.outMs)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,${volume},adelay=${item.startMs}|${item.startMs},apad,atrim=duration=${seconds(totalMs)}[${label}]`);
      mixLabels.push(label);
    }
    if (mixLabels.length > 1) {
      filters.push(mixLabels.map(label => `[${label}]`).join("") + `amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[postmix]`);
      audioLabel = "postmix";
    }
    // Peak limiting with latency compensation; never normalizes a silent source into fake audio.
    filters.push(`[${audioLabel}]alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=${seconds(totalMs)}[finalaudio]`);
    audioLabel = "finalaudio";

    return {
      filter: filters.join(";"),
      videoLabel,
      audioLabel
    };
  }

  async render(projectId: string): Promise<{
    assembly: FinalAssembly;
    renderJob: RenderJob;
  }> {
    return withSerialOperation("render:" + projectId, () => this.renderExclusive(projectId));
  }

  private async assertCurrentPlan(projectId: string, planHash: string): Promise<void> {
    const workspace = await this.productFlow.getWorkspace(projectId);
    if (!workspace?.productionPlan || workspace.productionPlan.status !== "CONFIRMED" || workspace.productionPlan.contentHash !== planHash ||
        (workspace.project.currentProductionPlanRef && workspace.project.currentProductionPlanRef.hash !== planHash)) {
      throw new DomainValidationError("导演方案已变化，旧时间线不能生成或复用为当前成片");
    }
  }

  private async renderExclusive(projectId: string): Promise<{
    assembly: FinalAssembly;
    renderJob: RenderJob;
  }> {
    const timeline = await this.timelines.latestTimeline(projectId);
    if (!timeline || timeline.status !== "CONFIRMED") {
      throw new DomainValidationError(
        "A confirmed Timeline is required before rendering"
      );
    }
    await this.assertCurrentPlan(projectId, timeline.productionPlanHash);
    const job = await this.timelines.latestRenderJob(projectId);
    if (
      !job ||
      job.timelineId !== timeline.id ||
      job.timelineHash !== timeline.contentHash
    ) {
      throw new DomainValidationError(
        "Current confirmed Timeline has no matching RenderJob"
      );
    }

    if (job.status === "SUCCEEDED") {
      const existing = await this.finalOutput.latestAssembly(projectId);
      if (
        existing &&
        existing.status !== "STALE" &&
        existing.renderJobId === job.id &&
        existing.timelineHash === timeline.contentHash &&
        existing.outputArtifactId === job.outputArtifactId &&
        existing.outputArtifactHash === job.outputArtifactHash
      ) {
        const source = await this.verifyArtifact({ projectId, artifactId: existing.outputArtifactId,
          artifactHash: existing.outputArtifactHash, store: new LocalArtifactStore(path.resolve(this.projectsRoot, projectId), this.artifacts) });
        const measured = await inspectMedia(source.absolutePath, this.ffprobePath);
        if (!measured.hasVideo || !measured.hasAudio || measured.width !== job.renderConfig.width || measured.height !== job.renderConfig.height ||
            Math.abs(measured.durationMs - timelineDurationMs(timeline)) > Math.max(120, 2000 / job.renderConfig.fps)) {
          throw new DomainValidationError("既有成片的实际媒体校验失败，不把旧成功状态当作可用产物");
        }
        return { assembly: existing, renderJob: job };
      }
      throw new DomainValidationError(
        "RenderJob is SUCCEEDED but matching FinalAssembly is missing"
      );
    }
    if (job.status === "RENDERING") {
      throw new DomainValidationError("当前渲染任务正在执行中");
    }

    const activeClips = timeline.clips
      .filter((clip) => !clip.deleted)
      .sort((a, b) => a.order - b.order);
    if (!activeClips.length) {
      throw new DomainValidationError(
        "Confirmed Timeline has no active video clips"
      );
    }
    this.assertJobInputs(timeline, job);
    if (timeline.autoEditOrigin && timelineDecisionHash(timeline) !== timeline.contentHash) {
      throw new DomainValidationError("自动时间线内容校验失败");
    }

    const projectRoot = path.resolve(this.projectsRoot, projectId);
    const store = new LocalArtifactStore(projectRoot, this.artifacts);
    const videoInputs: VideoInput[] = [];
    for (const clip of activeClips) {
      const source = await this.verifyArtifact({
        projectId,
        artifactId: clip.sourceArtifactId,
        artifactHash: clip.sourceArtifactHash,
        expectedVideo: true,
        store
      });
      videoInputs.push({
        clip,
        absolutePath: source.absolutePath,
        hasAudio: await this.hasAudioStream(source.absolutePath)
      });
    }

    const activeAudio = timeline.audioItems.filter(item => !item.deleted).sort((a,b) => a.order-b.order);
    const audioInputs: Array<{ item: TimelineAudioItem; index: number; absolutePath: string }> = [];
    for (const item of activeAudio) {
      const source = await this.verifyArtifact({
        projectId,
        artifactId: item.sourceArtifactId,
        artifactHash: item.sourceArtifactHash,
        expectedAudio: true,
        store
      });
      if (!(await this.hasAudioStream(source.absolutePath))) {
        throw new DomainValidationError("后期音频文件中没有可用音轨");
      }
      audioInputs.push({ item, index: videoInputs.length + audioInputs.length, absolutePath: source.absolutePath });
    }

    const startedAt = new Date().toISOString();
    let currentJob = await this.timelines.updateRenderJob(job.id, {
      status: "RENDERING",
      startedAt,
      errorCode: undefined,
      errorMessage: undefined
    });

    const tempDir = path.join(projectRoot, ".tmp", "render-" + job.id);
    const tempOutput = path.join(tempDir, "final.mp4");
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const args: string[] = ["-hide_banner", "-loglevel", "error"];
      for (const item of videoInputs) {
        args.push("-i", item.absolutePath);
      }
      for (const input of audioInputs) args.push("-i", input.absolutePath);
      const texts = renderableText(timeline);
      const textFiles = new Map<string, string>();
      for (let i = 0; i < texts.length; i++) {
        const file = "caption-" + i + ".txt";
        await fs.writeFile(path.join(tempDir, file), texts[i]!.text, "utf8");
        textFiles.set(texts[i]!.id, file);
      }

      const graph = this.buildFilterGraph({
        timeline,
        job: currentJob,
        videos: videoInputs,
        audioInputs,
        texts,
        textFiles,
        ...(await this.resolveFontFile().then((fontFile) =>
          fontFile ? { fontFile } : {}
        ))
      });
      await fs.writeFile(path.join(tempDir, "filter-graph.txt"), graph.filter, "utf8");
      args.push(
        "-/filter_complex",
        "filter-graph.txt",
        "-map",
        "[" + graph.videoLabel + "]",
        "-map",
        "[" + graph.audioLabel + "]",
        "-c:v",
        currentJob.renderConfig.videoCodec,
        "-preset",
        "medium",
        "-crf",
        "18",
        "-r",
        String(currentJob.renderConfig.fps),
        "-c:a",
        currentJob.renderConfig.audioCodec,
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "-y",
        tempOutput
      );

      if (process.platform === "win32" && args.join(" ").length > 28000) throw new DomainValidationError("音轨数量或路径过长，请合并音轨后再渲染");
      await execFileAsync(this.ffmpegPath, args, {
        cwd: tempDir,
        timeout: 900_000
      });

      const bytes = await fs.readFile(tempOutput);
      if (!bytes.length) {
        throw new Error("RenderEngine produced an empty MP4");
      }
      const measured = await inspectMedia(tempOutput, this.ffprobePath);
      const expectedDurationMs = timelineDurationMs(timeline);
      if (!measured.hasVideo || !measured.hasAudio || measured.width !== currentJob.renderConfig.width || measured.height !== currentJob.renderConfig.height ||
          Math.abs(measured.durationMs - expectedDurationMs) > Math.max(120, 2000 / currentJob.renderConfig.fps)) {
        throw new DomainValidationError("最终视频的实际画幅、音轨或时长不符合本次时间线，未标记成功");
      }
      const latest = await this.timelines.latestTimeline(projectId);
      if (latest?.id !== timeline.id || latest.contentHash !== timeline.contentHash || latest.status !== "CONFIRMED") {
        throw new DomainValidationError("渲染期间时间线发生变化，旧结果不会覆盖当前成片");
      }
      await this.assertCurrentPlan(projectId, timeline.productionPlanHash);
      const output = await store.writeImmutable({
        id: randomUUID(),
        projectId,
        kind: "FINAL_VIDEO",
        relativePath: "final/timeline-" + job.id + ".mp4",
        immutable: true,
        bytes,
        mimeType: "video/mp4"
      });
      if (!output.sha256) {
        throw new Error("Rendered FINAL_VIDEO did not become READY");
      }

      await this.finalOutput.markAssembliesStale(projectId);
      const assembly = await this.finalOutput.createAssembly({
        id: randomUUID(),
        projectId,
        productionPlanHash: timeline.productionPlanHash,
        selectedClipIds: activeClips.map((clip) => clip.sourceClipId),
        inputArtifactIds: currentJob.inputArtifactIds,
        inputArtifactHashes: currentJob.inputArtifactHashes,
        outputArtifactId: output.id,
        outputArtifactHash: output.sha256,
        timelineId: timeline.id,
        timelineHash: timeline.contentHash,
        renderJobId: currentJob.id,
        renderConfig: currentJob.renderConfig,
        status: "READY",
        createdAt: new Date().toISOString()
      });

      currentJob = await this.timelines.updateRenderJob(currentJob.id, {
        status: "SUCCEEDED",
        outputArtifactId: output.id,
        outputArtifactHash: output.sha256,
        completedAt: new Date().toISOString()
      });
      await this.productFlow.setProjectStatus(projectId, "FINAL_REVIEW");
      return { assembly, renderJob: currentJob };
    } catch (error) {
      currentJob = await this.timelines.updateRenderJob(currentJob.id, {
        status: "FAILED",
        errorCode: "RENDER_FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
