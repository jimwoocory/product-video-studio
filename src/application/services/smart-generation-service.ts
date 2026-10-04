import { randomUUID } from "node:crypto";
import { hashValue } from "../../domain/hashing.js";
import { DomainValidationError } from "../../domain/validation.js";
import {
  smartRunOptionsSchema, smartRunSchema, runnableSmartStatuses, closedSmartStatuses,
  type SmartGenerationRun, type SmartStage
} from "../../domain/smart-generation.js";
import type { SmartRunRepository } from "../ports/smart-run-repository.js";
import { SmartFlowPause, type SmartProduction } from "../ports/smart-production.js";
import { withSerialOperation } from "./serial-operation.js";
import { postProductionSettingsSchema } from "../../domain/auto-edit.js";

export type SmartReviewAction = "SELECT_CREATIVE" | "CONFIRM_SCRIPT" | "CONFIRM_PLAN";

/** Durable orchestrator. Planning/review can never manufacture permission to spend credits. */
export class SmartGenerationService {
  constructor(private readonly repo: SmartRunRepository, private readonly production: SmartProduction) {}

  async create(projectId: string, requestKey: string, rawOptions: unknown): Promise<SmartGenerationRun> {
    const options = smartRunOptionsSchema.parse(rawOptions);
    const initial = await this.production.initial(projectId);
    const now = new Date().toISOString();
    return this.repo.create(smartRunSchema.parse({
      id: randomUUID(), projectId, requestKey, revision: 1,
      inputHash: hashValue({ projectId, options, targetDurationMs: initial.targetDurationMs }),
      status: "PLANNING", stage: "SOURCES", options,
      targetDurationMs: initial.targetDurationMs, expectedWorkspace: initial.binding,
      attemptIds: [], notes: [], createdAt: now, updatedAt: now
    }));
  }

  get(projectId: string, id: string) { return this.repo.get(projectId, id); }
  list(projectId?: string) { return this.repo.list(projectId); }

  private async require(projectId: string, id: string): Promise<SmartGenerationRun> {
    const run = await this.repo.get(projectId, id);
    if (!run) throw new DomainValidationError("找不到当前项目的一键成片任务");
    return run;
  }

  private async exclusive(projectId: string, id: string, operation: (run: SmartGenerationRun, owner: string) => Promise<SmartGenerationRun>): Promise<SmartGenerationRun> {
    return withSerialOperation("smart-run:" + id, async () => {
      const owner = randomUUID();
      if (!await this.repo.acquire(projectId, id, owner, process.pid)) {
        throw new DomainValidationError("任务正在由另一个执行器处理，请等待当前步骤完成");
      }
      try { return await operation(await this.require(projectId, id), owner); }
      finally { await this.repo.release(projectId, id, owner); }
    });
  }

  private save(run: SmartGenerationRun, owner: string, patch: Partial<SmartGenerationRun>, message: string) {
    const stage = patch.stage ?? run.stage;
    return this.repo.save({ ...run, ...patch, notes: [...run.notes, { at: new Date().toISOString(), stage, message }].slice(-200) }, run.revision, owner);
  }

  private runnable(stage: SmartStage): SmartGenerationRun["status"] {
    return stage === "APPROVAL" ? "APPROVING" : stage === "GENERATION" ? "GENERATING"
      : stage === "AUTO_EDIT" ? "AUTO_EDITING" : stage === "RENDER" ? "RENDERING" : "PLANNING";
  }

  /** A single bounded step. The web worker repeatedly calls this; GET endpoints never run work. */
  async advance(projectId: string, id: string): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (!runnableSmartStatuses.includes(run.status)) return run;
      try {
        if (run.pendingInstall) {
          const pending = run.pendingInstall;
          const expectedWorkspace = await this.production.install(run);
          let stage = run.stage;
          let status: SmartGenerationRun["status"] = "PLANNING";
          if (pending === "CREATIVE") status = run.options.reviewMode === "MANUAL" ? "WAITING_FOR_CREATIVE_REVIEW" : "PLANNING";
          if (pending === "SELECT_CREATIVE") stage = "SCRIPT";
          if (pending === "SCRIPT") status = run.options.reviewMode === "MANUAL" ? "WAITING_FOR_SCRIPT_REVIEW" : "PLANNING";
          if (pending === "CONFIRM_SCRIPT") stage = "DIRECTOR";
          if (pending === "DIRECTOR") status = run.options.reviewMode === "MANUAL" ? "WAITING_FOR_PLAN_REVIEW" : "PLANNING";
          if (pending === "CONFIRM_PLAN") stage = "PREFLIGHT";
          return this.save(run, owner, { expectedWorkspace, pendingInstall: undefined, stage, status, blocker: undefined }, "已将本阶段结果接入现有版本链，历史版本保留");
        }
        if (run.stage !== "SOURCES") await this.production.assertCurrent(run);
        switch (run.stage) {
          case "SOURCES":
            return this.save(run, owner, { ...await this.production.sources(run), stage: "CREATIVE", status: "PLANNING", blocker: undefined }, "产品事实及素材来源检查通过，未执行付费生成");
          case "CREATIVE":
            if (!run.creativeBatch) return this.save(run, owner, { creativeBatch: await this.production.creative(run), pendingInstall: "CREATIVE" }, "创意结果已持久化，准备接入版本链");
            if (run.options.reviewMode !== "AUTO") return this.save(run, owner, { status: "WAITING_FOR_CREATIVE_REVIEW" }, "等待选择创意");
            // AUTO is an explicit user option. The deterministic choice is recorded, not represented as a human decision.
            const selected = run.creativeBatch.concepts.find((c) => c.generationRisk === "LOW") ?? run.creativeBatch.concepts[0]!;
            return this.save(run, owner, { selectedCreativeId: selected.id, pendingInstall: "SELECT_CREATIVE" }, "按已启用的自动创作模式选择首个低生成风险方案；不代表效果评分");
          case "SCRIPT":
            if (!run.script) return this.save(run, owner, { script: await this.production.script(run), pendingInstall: "SCRIPT" }, "脚本草稿已持久化");
            if (run.options.reviewMode !== "AUTO") return this.save(run, owner, { status: "WAITING_FOR_SCRIPT_REVIEW" }, "等待确认脚本");
            return this.save(run, owner, { script: await this.production.confirmScript(run), pendingInstall: "CONFIRM_SCRIPT" }, "自动模式：脚本约束检查通过，准备保存确认版本");
          case "DIRECTOR":
            if (!run.productionPlan) return this.save(run, owner, { productionPlan: await this.production.director(run), pendingInstall: "DIRECTOR" }, "模型感知分镜已持久化");
            if (run.options.reviewMode !== "AUTO") return this.save(run, owner, { status: "WAITING_FOR_PLAN_REVIEW" }, "等待确认分镜");
            return this.save(run, owner, { productionPlan: await this.production.confirmPlan(run), pendingInstall: "CONFIRM_PLAN" }, "自动模式：分镜约束检查通过，准备保存确认版本");
          case "PREFLIGHT":
            return this.save(run, owner, { paidScope: await this.production.preparePaidScope(run), consent: undefined, status: "READY_FOR_PAID_CONFIRM", blocker: undefined }, "精确镜头和费用范围已准备；必须明确确认后才能提交");
          case "APPROVAL":
            await this.production.validatePaidScope(run);
            return this.save(run, owner, { attemptIds: await this.production.approve(run), status: "GENERATING", stage: "GENERATION", blocker: undefined }, "按已保存的明确确认创建各镜头独立审批和尝试");
          case "GENERATION": {
            const result = await this.production.generate(run);
            return this.save(run, owner, result.done ? { stage: "CLIP_REVIEW", status: "PLANNING" } : {}, result.done ? "已完成本轮提交、查询与下载，准备选片检查" : "本轮生成推进完成，等待下次查询；不重复提交");
          }
          case "CLIP_REVIEW":
            await this.production.reviewClips(run);
            return this.save(run, owner, { stage: "AUTO_EDIT", status: "AUTO_EDITING", blocker: undefined }, "选片约束通过，进入自动剪辑");
          case "AUTO_EDIT":
            return this.save(run, owner, { ...await this.production.autoEdit(run), stage: "RENDER", status: "RENDERING", blocker: undefined }, "剪辑决策和时间线已保存");
          case "RENDER":
            return this.save(run, owner, { finalOutput: await this.production.render(run), stage: "FINAL_REVIEW", status: "REVIEW_READY", blocker: undefined }, "真实渲染产物已就绪，等待最终确认；不等于已发布");
          default: return run;
        }
      } catch (error) {
        const pause = error instanceof SmartFlowPause ? error : null;
        return this.save(run, owner, { status: pause?.status ?? "FAILED", blocker: {
          code: pause?.code ?? "SMART_STAGE_FAILED", message: error instanceof Error ? error.message : String(error), retryable: pause?.retryable ?? true
        } }, "当前步骤已暂停，未将失败标记为完成");
      }
    });
  }

  async review(projectId: string, id: string, input: { action: SmartReviewAction; expectedRevision: number; creativeId?: string }): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (run.revision !== input.expectedRevision) throw new DomainValidationError("任务版本已更新，请刷新后再审核");
      await this.production.assertCurrent(run);
      if (input.action === "SELECT_CREATIVE" && run.status === "WAITING_FOR_CREATIVE_REVIEW") {
        if (!run.creativeBatch?.concepts.some((c) => c.id === input.creativeId)) throw new DomainValidationError("请选择本轮创意方案");
        return this.save(run, owner, { selectedCreativeId: input.creativeId, pendingInstall: "SELECT_CREATIVE", status: "PLANNING" }, "用户明确选择创意");
      }
      if (input.action === "CONFIRM_SCRIPT" && run.status === "WAITING_FOR_SCRIPT_REVIEW") {
        return this.save(run, owner, { script: await this.production.confirmScript(run), pendingInstall: "CONFIRM_SCRIPT", status: "PLANNING" }, "用户明确确认脚本");
      }
      if (input.action === "CONFIRM_PLAN" && run.status === "WAITING_FOR_PLAN_REVIEW") {
        return this.save(run, owner, { productionPlan: await this.production.confirmPlan(run), pendingInstall: "CONFIRM_PLAN", status: "PLANNING" }, "用户明确确认分镜");
      }
      throw new DomainValidationError("当前任务阶段不接受此审核操作");
    });
  }

  async confirmPaid(projectId: string, id: string, input: { scopeHash: string; confirmPaidGeneration: boolean; acceptedUnknownCostRisk: boolean }): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (input.confirmPaidGeneration !== true || !run.paidScope || input.scopeHash !== run.paidScope.hash) {
        throw new DomainValidationError("必须明确确认当前镜头与费用范围，旧页面或其他任务的确认无效");
      }
      if (run.consent) {
        if (run.consent.scopeHash !== input.scopeHash || run.consent.acceptedUnknownCostRisk !== input.acceptedUnknownCostRisk) throw new DomainValidationError("不能变更已保存的付费确认");
        return run;
      }
      if (run.status !== "READY_FOR_PAID_CONFIRM") throw new DomainValidationError("当前任务尚未准备好付费确认");
      if (run.paidScope.requests.some((r) => r.costStatus === "UNKNOWN") && input.acceptedUnknownCostRisk !== true) {
        throw new DomainValidationError("成本未知，需要明确接受积分风险");
      }
      await this.production.assertCurrent(run);
      await this.production.validatePaidScope(run);
      return this.save(run, owner, { consent: { scopeHash: input.scopeHash, approvedAt: new Date().toISOString(), acceptedUnknownCostRisk: input.acceptedUnknownCostRisk, source: "EXPLICIT_SMART_RUN_PAID_CONFIRMATION" }, stage: "APPROVAL", status: "APPROVING", blocker: undefined }, "已保存用户本次明确付费确认；只覆盖上述请求，不覆盖重做或新镜头");
    });
  }

  async resume(projectId: string, id: string): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (closedSmartStatuses.includes(run.status) || run.status === "REVIEW_READY") return run;
      if (["WAITING_FOR_CREATIVE_REVIEW", "WAITING_FOR_SCRIPT_REVIEW", "WAITING_FOR_PLAN_REVIEW", "READY_FOR_PAID_CONFIRM"].includes(run.status)) return run;
      if (run.blocker?.retryable === false) throw new DomainValidationError(run.blocker.message);
      return this.save(run, owner, { status: this.runnable(run.stage), blocker: undefined }, "用户恢复原检查点，不扩展付费范围或重提未知任务");
    });
  }

  async configurePostProduction(projectId: string, id: string, input: { expectedRevision: number; settings: unknown }): Promise<SmartGenerationRun> {
    const settings = postProductionSettingsSchema.parse(input.settings);
    return this.exclusive(projectId, id, async (run, owner) => {
      if (run.revision !== input.expectedRevision) throw new DomainValidationError("任务已更新，请刷新后修改后期设置");
      if (closedSmartStatuses.includes(run.status) || ["RENDER", "FINAL_REVIEW"].includes(run.stage)) throw new DomainValidationError("本轮后期已提交渲染，请到时间线创建新编辑版本");
      return this.save(run, owner, { postProduction: settings,
        ...(run.stage === "AUTO_EDIT" ? { status: "AUTO_EDITING" as const, blocker: undefined } : {}) },
        "用户更新后期音轨与字幕设置；付费范围、产品事实和视频生成审批均保持不变");
    });
  }

  async adoptTimeline(projectId: string, id: string, input: { expectedRevision: number; timelineId: string; timelineHash: string }): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (run.revision !== input.expectedRevision || !["AUTO_EDIT", "CLIP_REVIEW"].includes(run.stage) || closedSmartStatuses.includes(run.status)) throw new DomainValidationError("当前任务不能采用此时间线版本");
      await this.production.assertCurrent(run);
      await this.production.reviewClips(run);
      if (!this.production.adoptTimeline) throw new DomainValidationError("当前执行器不支持采用手工时间线");
      const chosen = { id: input.timelineId, hash: input.timelineHash };
      await this.production.adoptTimeline(run, chosen);
      return this.save(run, owner, { timelineRef: chosen, stage: "RENDER", status: "RENDERING", blocker: undefined }, "用户明确采用已确认的手工时间线，不覆盖其编辑，准备渲染");
    });
  }

  async cancel(projectId: string, id: string): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (closedSmartStatuses.includes(run.status)) return run;
      await this.production.cancel(run);
      return this.save(run, owner, { status: "CANCELLED", blocker: undefined }, "已停止本地后续编排并撤销未用请求；已提交远端任务不宣称已取消");
    });
  }

  async confirmFinal(projectId: string, id: string): Promise<SmartGenerationRun> {
    return this.exclusive(projectId, id, async (run, owner) => {
      if (run.status === "COMPLETED") return run;
      if (run.status !== "REVIEW_READY" || !await this.production.finalConfirmed(run)) throw new DomainValidationError("请在成片页确认当前视频后再结束任务");
      return this.save(run, owner, { status: "COMPLETED" }, "最终成片已确认；发布仍由独立发布流程处理");
    });
  }

  /** Release only provably dead OS owners. A live/unknown owner is never displaced by a timeout. */
  async recoverAbandoned(): Promise<void> {
    for (const run of await this.repo.list()) {
      const lease = await this.repo.lease(run.projectId, run.id);
      if (!lease) continue;
      let dead = false;
      try { process.kill(lease.pid, 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      if (dead) await this.repo.releaseAbandoned(run.projectId, run.id, lease.owner);
    }
  }
}
