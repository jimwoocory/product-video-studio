import type {
  ArtifactRecord,
  CommandAttemptRecord,
  CompiledPrompt,
  CreativeBatch,
  GenerationAttempt,
  GenerationRequest,
  PreflightReport,
  Project,
  ReviewDecision,
  UserApproval,
  WorkflowBlocker
} from "../domain/schemas.js";
import type { ProjectWorkspace } from "../application/services/product-flow.js";
import type { ProductInputSnapshot } from "../application/ports/product-input-store.js";
import type { ProviderProbeResult } from "../application/ports/video-provider.js";
import type { DouyinPublishProbe } from "../application/ports/douyin-publish-provider.js";
import type {
  FinalAssembly,
  PublishAttempt
} from "../application/ports/final-output-repository.js";

type PageKind = "product" | "truth" | "creative" | "script" | "director" | "generate" | "final";

const statusLabel: Record<Project["status"], string> = {
  DRAFT: "草稿",
  PRODUCT_TRUTH_REVIEW: "产品事实确认",
  CREATIVE_REVIEW: "创意选择",
  SCRIPT_REVIEW: "脚本确认",
  DIRECTOR_REVIEW: "导演计划确认",
  READY_TO_GENERATE: "待生成",
  GENERATING: "生成中",
  GENERATION_REVIEW: "生成结果确认",
  READY_TO_ASSEMBLE: "待生成成片",
  FINAL_REVIEW: "成片确认",
  READY_TO_PUBLISH: "待发布抖音",
  PUBLISHING: "发布中",
  PUBLISHED: "已发布",
  COMPLETED: "已完成",
  FAILED: "不可恢复失败"
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function refText(ref?: { version: number; hash: string }): string {
  return ref ? `v${ref.version} · ${ref.hash.slice(0, 12)}…` : "尚无版本";
}

function resumePath(project: Project): string {
  if (project.status === "DRAFT") return `/projects/${project.id}/product`;
  if (project.status === "PRODUCT_TRUTH_REVIEW") return `/projects/${project.id}/truth`;
  if (project.status === "CREATIVE_REVIEW") return `/projects/${project.id}/creative`;
  if (project.status === "SCRIPT_REVIEW") return `/projects/${project.id}/script`;
  if (project.status === "DIRECTOR_REVIEW") return `/projects/${project.id}/director`;
  if (
    project.status === "READY_TO_ASSEMBLE" ||
    project.status === "FINAL_REVIEW" ||
    project.status === "READY_TO_PUBLISH" ||
    project.status === "PUBLISHING" ||
    project.status === "PUBLISHED" ||
    project.status === "COMPLETED"
  ) {
    return `/projects/${project.id}/final`;
  }
  return `/projects/${project.id}/generate`;
}

function staleImpact(project?: Project): string {
  if (!project) return "";
  if (project.status === "DRAFT" || project.status === "PRODUCT_TRUTH_REVIEW") {
    return "修改产品输入或 Product Truth 会使 Creative、Script、Production Plan、Prompt 与提交链失效。";
  }
  if (project.status === "CREATIVE_REVIEW") {
    return "更换 CreativeBatch 或创意选择会使 Script、Production Plan、Prompt 与提交链失效。";
  }
  if (project.status === "SCRIPT_REVIEW") {
    return "修改 Script 会使 Production Plan、Prompt 与提交链失效。";
  }
  if (project.status === "DIRECTOR_REVIEW" || project.status === "READY_TO_GENERATE") {
    return "修改 Production Plan / Clip / Segment 会使 CompiledPrompt、Request、Preflight 与 Approval 失效。";
  }
  return "修改任何上游当前版本都会使绑定的下游生成证据进入 STALE；历史记录保留只读。";
}

function layout(title: string, body: string, project?: Project, blockers: WorkflowBlocker[] = []): string {
  const blockerHtml = blockers.length
    ? `<section class="blocker"><strong>WAITING_FOR_USER</strong><div>${blockers
        .map(
          (item) =>
            `<p><code>${esc(item.reasonCode)}</code> · ${esc(item.message)}<br><span>需要你：${esc(item.requiredUserAction)}</span></p>`
        )
        .join("")}</div></section>`
    : "";
  const nav = project
    ? `<nav class="steps">
        <a href="/projects/${project.id}/product">1 产品输入</a>
        <a href="/projects/${project.id}/truth">2 Product Truth</a>
        <a href="/projects/${project.id}/creative">3 创意</a>
        <a href="/projects/${project.id}/script">4 脚本</a>
        <a href="/projects/${project.id}/director">5 导演</a>
        <a href="/projects/${project.id}/generate">6 生成/审片</a>
        <a href="/projects/${project.id}/final">7 成片/发布</a>
      </nav>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Product Video Studio</title>
<style>
:root{font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;color:#171717;background:#f5f5f3}
*{box-sizing:border-box}body{margin:0}a{color:inherit}.top{background:#fff;border-bottom:1px solid #ddd;padding:14px 24px;display:flex;gap:20px;align-items:center}.top b{font-size:17px}.wrap{max-width:1180px;margin:0 auto;padding:24px}.steps{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.steps a{background:#fff;border:1px solid #ddd;padding:8px 11px;border-radius:8px;text-decoration:none}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.status{font-size:13px;background:#eee;padding:5px 8px;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}.card{background:#fff;border:1px solid #deded8;border-radius:12px;padding:16px;margin:12px 0}.card h3{margin-top:0}.muted{color:#707070;font-size:13px}.blocker{background:#fff3cd;border:1px solid #e7ca66;border-radius:10px;padding:14px;margin:14px 0}.blocker code{font-weight:700}.primary{background:#171717;color:#fff;border:0;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer}.primary:disabled{opacity:.35;cursor:not-allowed}.secondary{background:#fff;border:1px solid #bbb;border-radius:9px;padding:9px 13px}.facts{padding-left:18px}.hash{font-family:ui-monospace,Consolas,monospace;font-size:12px}.row{display:flex;gap:12px;flex-wrap:wrap}.field{display:flex;flex-direction:column;gap:5px;min-width:220px;flex:1}input,textarea,select{border:1px solid #bbb;border-radius:8px;padding:10px;font:inherit;background:#fff}textarea{min-height:90px}pre{white-space:pre-wrap;word-break:break-word;background:#f6f6f3;padding:12px;border-radius:8px;overflow:auto}.scene{border-left:3px solid #aaa;padding-left:14px}.clip{background:#fafaf8;border:1px solid #e1e1db;border-radius:8px;padding:12px;margin:8px 0}.segment{font-size:13px;border-top:1px dashed #ccc;padding:8px 0}.danger{color:#8a1f11}.ok{color:#176b2c}
</style>
</head>
<body>
<header class="top"><b>Product Video Studio · P0</b><a href="/projects">项目</a><span class="muted">V0.2</span></header>
<main class="wrap">
${nav}
${project ? `<section class="card"><b>失效影响</b><p class="muted">${esc(staleImpact(project))}</p><p class="muted">恢复入口：重新打开当前项目会从 SQLite 权威状态和 Artifact 记录恢复。</p></section>` : ""}
${blockerHtml}
${body}
</main>
</body></html>`;
}

export function renderProjectsPage(
  projects: Project[],
  blockerCounts: Map<string, number>
): string {
  const cards = projects.length
    ? projects
        .map(
          (project) => `<article class="card">
            <div class="head"><div><h3>${esc(project.name)}</h3><div class="muted">${esc(project.id)}</div></div><span class="status">${esc(statusLabel[project.status])}</span></div>
            <p>当前结果：Truth ${esc(refText(project.currentProductTruthRef))} · Script ${esc(refText(project.currentScriptRef))}</p>
            <p class="muted">未解决阻塞：${blockerCounts.get(project.id) ?? 0} · 更新：${esc(project.updatedAt)}</p>
            <a class="primary" href="${resumePath(project)}">继续项目</a>
          </article>`
        )
        .join("")
    : `<div class="card"><p>还没有项目。</p></div>`;
  return layout(
    "Projects",
    `<div class="head"><div><h1>项目</h1><p class="muted">从真实产品资料开始，不生成演示数据。</p></div></div>
     <section class="card">
       <h3>新建项目</h3>
       <form id="create-project"><div class="row">
         <label class="field">项目名称<input name="name" required placeholder="例如：SU-7 产品视频"></label>
         <label class="field">目标时长<select name="duration"><option value="60000">60 秒</option><option value="90000">90 秒</option><option value="120000">120 秒</option></select></label>
       </div><p><button class="primary">开始填写产品资料</button></p></form>
       <div id="create-error" class="danger"></div>
     </section>
     <section class="grid">${cards}</section>
<script>
document.querySelector('#create-project').addEventListener('submit',async(e)=>{
 e.preventDefault(); const f=new FormData(e.currentTarget);
 const r=await fetch('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),targetDurationMs:Number(f.get('duration'))})});
 const j=await r.json(); if(!r.ok){document.querySelector('#create-error').textContent=j.message||j.error;return;}
 location.href='/projects/'+j.project.id+'/product';
});
</script>`
  );
}

function projectHeader(workspace: ProjectWorkspace, title: string): string {
  return `<div class="head"><div><h1>${esc(title)}</h1><p class="muted">${esc(workspace.project.name)} · ${esc(workspace.project.id)}</p></div><span class="status">${esc(statusLabel[workspace.project.status])}</span></div>`;
}

function renderProduct(
  workspace: ProjectWorkspace,
  productInput?: ProductInputSnapshot
): string {
  const saved = productInput
    ? `<section class="card"><h3>已保存 Product Input v${productInput.version}</h3>
       <p><b>${esc(productInput.productName)}</b> · ${esc(productInput.brand ?? "无品牌")} · ${esc(productInput.category ?? "未分类")}</p>
       <p>${esc(productInput.featureDescription)}</p>
       <p class="muted">素材：${productInput.assets.length} 个 · hash: <span class="hash">${esc(productInput.contentHash)}</span></p>
       <button class="secondary" id="retry-truth">使用已保存资料重新生成 Product Truth</button>
       <span id="retry-error" class="danger"></span>
       </section>`
    : "";

  return `${projectHeader(workspace, "产品输入")}
  <section class="card"><h3>当前结果</h3><p>Product Truth：${esc(refText(workspace.project.currentProductTruthRef))}</p>
  <p class="muted">产品原始字节、输入快照和 hash 都会落入项目目录；生成失败可从已保存输入恢复。</p></section>
  ${saved}
  <section class="card"><h3>产品资料</h3>
  <form id="product-form">
    <div class="row">
      <label class="field">产品名称*<input name="productName" required value="${esc(productInput?.productName ?? "")}"></label>
      <label class="field">品牌<input name="brand" value="${esc(productInput?.brand ?? "")}"></label>
      <label class="field">类别<input name="category" value="${esc(productInput?.category ?? "")}"></label>
    </div>
    <label class="field">产品功能介绍*<textarea name="featureDescription" required>${esc(productInput?.featureDescription ?? "")}</textarea></label>
    <div class="row">
      <label class="field">产品图片*（至少1张，单张≤10MB）<input name="images" type="file" accept="image/*" multiple required></label>
      <label class="field">Logo（可选）<input name="logo" type="file" accept="image/*"></label>
    </div>
    <h3>禁改项（可选）</h3>
    <div class="row">
      <label class="field">字段<select name="forbiddenField">
        <option value="logo">Logo</option><option value="color">颜色</option><option value="shape">形状</option>
        <option value="packaging">包装</option><option value="text">文字</option><option value="model">型号</option>
        <option value="proportion">比例</option><option value="other">其他</option>
      </select></label>
      <label class="field">严重级别<select name="forbiddenSeverity"><option value="HARD">HARD</option><option value="SOFT">SOFT</option></select></label>
      <label class="field">说明<input name="forbiddenDescription" placeholder="例如：不得改变 Logo 形状"></label>
    </div>
    <p><button class="primary" id="generate-truth">保存资料并生成 Product Truth</button></p>
    <p id="product-progress" class="muted"></p>
    <div id="product-error" class="danger"></div>
  </form></section>
<script>
async function pvsFilePayload(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve({name:file.name,mimeType:file.type||'application/octet-stream',base64:String(reader.result)});
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}
document.querySelector('#product-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const form=e.currentTarget, f=new FormData(form);
  const button=document.querySelector('#generate-truth');
  const progress=document.querySelector('#product-progress');
  const error=document.querySelector('#product-error');
  error.textContent=''; button.disabled=true; progress.textContent='正在保存素材并生成 Product Truth…';
  try{
    const imageFiles=[...form.elements.images.files];
    const images=await Promise.all(imageFiles.map(pvsFilePayload));
    const logoFile=form.elements.logo.files[0];
    const description=String(f.get('forbiddenDescription')||'').trim();
    const forbiddenChanges=description?[{field:f.get('forbiddenField'),severity:f.get('forbiddenSeverity'),description}]:[];
    const payload={
      productName:f.get('productName'),
      featureDescription:f.get('featureDescription'),
      brand:f.get('brand'),
      category:f.get('category'),
      images,
      logo:logoFile?await pvsFilePayload(logoFile):undefined,
      forbiddenChanges
    };
    const r=await fetch('/api/projects/${workspace.project.id}/product-input/generate-truth',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const j=await r.json();
    if(!r.ok) throw new Error(j.message||j.error||'生成失败');
    location.href='/projects/${workspace.project.id}/truth';
  }catch(err){error.textContent=err.message||String(err);progress.textContent='';button.disabled=false;}
});
const retry=document.querySelector('#retry-truth');
if(retry) retry.addEventListener('click',async()=>{
  retry.disabled=true; document.querySelector('#retry-error').textContent=''; retry.textContent='正在重新生成…';
  try{
    const r=await fetch('/api/projects/${workspace.project.id}/truth/generate-from-input',{method:'POST'});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.href='/projects/${workspace.project.id}/truth';
  }catch(err){document.querySelector('#retry-error').textContent=err.message||String(err);retry.disabled=false;retry.textContent='使用已保存资料重新生成 Product Truth';}
});
</script>`;
}

function renderTruth(
  workspace: ProjectWorkspace,
  productInput?: ProductInputSnapshot,
  artifacts: ArtifactRecord[] = []
): string {
  const truth = workspace.productTruth;
  if (!truth) {
    return `${projectHeader(workspace, "Product Truth Review")}<section class="card"><h3>尚未生成 Product Truth</h3><p>当前没有可审核版本。</p><a class="secondary" href="/projects/${workspace.project.id}/product">返回产品输入</a></section>`;
  }
  const canonicalAsset = productInput?.assets.find(
    (item) => item.id === truth.canonicalImageId
  );
  const canonicalArtifact = canonicalAsset
    ? artifacts.find((item) => item.id === canonicalAsset.artifactId)
    : undefined;
  const claimRows = truth.uncertainClaims.length
    ? truth.uncertainClaims.map(c=>`<li><b>${esc(c.status)}</b> · ${esc(c.statement)}<br><span class="muted">${esc(c.reason)}</span>${truth.status==="DRAFT"?`<div><select class="claim-disposition" data-claim-id="${esc(c.id)}"><option value="KEEP_UNVERIFIED">保留为未验证</option><option value="REJECT">拒绝</option><option value="PROMOTE">提升为事实（用户明确确认）</option></select></div>`:""}</li>`).join("")
    : "<li>无不确定信息</li>";
  const action = truth.status === "DRAFT"
    ? `<button class="primary" id="confirm-truth">确认此 Product Truth 并生成创意</button><span id="truth-progress" class="muted"></span><div id="truth-error" class="danger"></div>
<script>
document.querySelector('#confirm-truth').addEventListener('click',async()=>{
  const button=document.querySelector('#confirm-truth'), progress=document.querySelector('#truth-progress'), error=document.querySelector('#truth-error');
  button.disabled=true; error.textContent=''; progress.textContent=' 正在确认并生成 4–6 个创意…';
  try{
    const dispositions={};
    document.querySelectorAll('.claim-disposition').forEach(el=>{dispositions[el.dataset.claimId]=el.value;});
    const r=await fetch('/api/projects/${workspace.project.id}/truth/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'${workspace.project.id}',dispositions})});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.href='/projects/${workspace.project.id}/creative';
  }catch(err){error.textContent=err.message||String(err);progress.textContent='';button.disabled=false;}
});
</script>`
    : `<a class="primary" href="/projects/${workspace.project.id}/creative">继续查看创意</a>`;
  return `${projectHeader(workspace, "Product Truth Review")}
  <section class="card"><h3>当前结果 · ${esc(truth.status)}</h3><p>v${truth.version} · <span class="hash">${esc(truth.contentHash)}</span></p>
  <p><b>${esc(truth.productName)}</b> · ${esc(truth.brand ?? "无品牌")} · ${esc(truth.category ?? "未分类")}</p></section>
  <section class="card"><h3>产品身份基准</h3>
    <p>Canonical image：<code>${esc(truth.canonicalImageId)}</code></p>
    <p>原文件：${esc(canonicalAsset?.originalFilename ?? "未解析")} · 完整性：<b class="${canonicalArtifact?.integrityStatus==="READY"?"ok":"danger"}">${esc(canonicalArtifact?.integrityStatus ?? "UNKNOWN")}</b></p>
    <p class="hash">artifact=${esc(canonicalAsset?.artifactId ?? "UNKNOWN")} · sha256=${esc(canonicalAsset?.sha256 ?? "UNKNOWN")}</p>
    <p>标准颜色：${truth.standardColors.length ? esc(truth.standardColors.join(" / ")) : "未确认"}</p>
  </section>
  <div class="grid"><section class="card"><h3>ProductFact</h3><ul class="facts">${[...truth.confirmedFeatures,...truth.sellingPoints].map(f=>`<li><code>${esc(f.id)}</code> ${esc(f.statement)}</li>`).join("")||"<li>无</li>"}</ul></section>
  <section class="card"><h3>ForbiddenChange</h3><ul class="facts">${truth.forbiddenChanges.map(f=>`<li><b>${esc(f.severity)}</b> · ${esc(f.field)} · ${esc(f.description)}</li>`).join("")||"<li>无</li>"}</ul></section>
  <section class="card"><h3>UncertainClaim</h3><p class="muted">UNVERIFIED 不会进入 Creative / Script / Director / Prompt 事实链。</p><ul class="facts">${claimRows}</ul></section></div>
  <section class="card"><h3>唯一下一步</h3>${action}</section>`;
}

function renderCreative(workspace: ProjectWorkspace): string {
  const batch = workspace.creativeBatch;
  if (!batch) {
    const canGenerate = workspace.productTruth?.status === "CONFIRMED";
    return `${projectHeader(workspace, "Creative Selection")}<section class="card"><h3>尚未生成 CreativeBatch</h3><p>必须先有当前已确认 Product Truth。</p><button class="primary" id="generate-creative" ${canGenerate?"":"disabled"}>生成 4–6 个创意</button><span id="creative-generate-progress" class="muted"></span><div id="creative-generate-error" class="danger"></div></section>
<script>
const cg=document.querySelector('#generate-creative');
if(cg) cg.addEventListener('click',async()=>{
 cg.disabled=true; document.querySelector('#creative-generate-progress').textContent=' 正在生成创意…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/creative/generate',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.reload();}
 catch(err){document.querySelector('#creative-generate-error').textContent=err.message||String(err);document.querySelector('#creative-generate-progress').textContent='';cg.disabled=false;}
});
</script>`;
  }
  return `${projectHeader(workspace, "Creative Selection")}
  <section class="card"><h3>CreativeBatch v${batch.version}</h3><p class="hash">${esc(batch.contentHash)}</p><p class="muted">绑定 Truth：v${batch.productTruthRef.version} · ${esc(batch.productTruthRef.hash.slice(0,12))}…</p>
  <button class="secondary" id="regenerate-creative">重新生成全部创意</button><span id="regenerate-creative-progress" class="muted"></span><div id="regenerate-creative-error" class="danger"></div></section>
  <form id="creative-form"><div class="grid">${batch.concepts.map(c=>`<label class="card"><div><input type="radio" name="creative" value="${esc(c.id)}" ${workspace.project.selectedCreativeId===c.id?"checked":""}> <b>${esc(c.title)}</b></div><p>${esc(c.hook)}</p><p>${esc(c.coreSellingPoint)}</p><p class="muted">人群：${esc(c.targetAudience)} · 风险：${esc(c.generationRisk)} · ${c.expectedDurationMs/1000}s</p><p class="hash">facts: ${esc(c.requiredFactIds.join(","))}</p></label>`).join("")}</div>
  <button class="primary">确认所选创意并生成脚本</button><span id="creative-error" class="danger"></span></form>
<script>
document.querySelector('#regenerate-creative').addEventListener('click',async()=>{
 const b=document.querySelector('#regenerate-creative'),p=document.querySelector('#regenerate-creative-progress'),e=document.querySelector('#regenerate-creative-error');
 b.disabled=true;e.textContent='';p.textContent=' 正在生成新的 CreativeBatch…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/creative/generate',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.reload();}
 catch(err){e.textContent=err.message||String(err);p.textContent='';b.disabled=false;}
});
document.querySelector('#creative-form').addEventListener('submit',async(e)=>{
 e.preventDefault(); const f=new FormData(e.currentTarget); const id=f.get('creative');
 if(!id){document.querySelector('#creative-error').textContent='请选择一个创意';return;}
 const r=await fetch('/api/projects/${workspace.project.id}/creative/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({creativeId:id})});
 const j=await r.json(); if(!r.ok){document.querySelector('#creative-error').textContent=j.message||j.error;return;}
 location.href='/projects/${workspace.project.id}/script';
});
</script>`;
}

function renderScript(workspace: ProjectWorkspace): string {
  const script = workspace.script;
  if (!script) {
    const canGenerate = Boolean(
      workspace.project.selectedCreativeId &&
      workspace.productTruth?.status === "CONFIRMED" &&
      workspace.creativeBatch
    );
    return `${projectHeader(workspace, "Script Review")}<section class="card"><h3>尚未生成 Script</h3><p>当前选择：${esc(workspace.project.selectedCreativeId ?? "未选择创意")}</p><button class="primary" id="generate-script" ${canGenerate?"":"disabled"}>生成脚本草稿</button><span id="script-generate-progress" class="muted"></span><div id="script-generate-error" class="danger"></div></section>
<script>
const sg=document.querySelector('#generate-script');
if(sg) sg.addEventListener('click',async()=>{
 sg.disabled=true; document.querySelector('#script-generate-progress').textContent=' 正在生成脚本…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/script/generate',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.reload();}
 catch(err){document.querySelector('#script-generate-error').textContent=err.message||String(err);document.querySelector('#script-generate-progress').textContent='';sg.disabled=false;}
});
</script>`;
  }
  const beatPurposes = [
    "HOOK",
    "PAIN",
    "PRODUCT",
    "FEATURE",
    "PROOF",
    "RESULT",
    "CTA",
    "OTHER"
  ] as const;
  const revisionEditor = `<section class="card"><h3>结构化编辑 Script</h3>
    <p class="muted">保存会创建新的 DRAFT Script 版本，并使当前 Production Plan / Prompt / Preflight / Approval 进入 STALE；不会覆盖历史版本。</p>
    <form id="script-revise-form">
      ${script.beats
        .map(
          (beat) => `<div class="clip beat-editor" data-beat-id="${esc(beat.id)}">
            <div class="row">
              <label class="field">Purpose<select class="beat-purpose">${beatPurposes
                .map(
                  (purpose) =>
                    `<option value="${purpose}" ${purpose === beat.purpose ? "selected" : ""}>${purpose}</option>`
                )
                .join("")}</select></label>
              <label class="field">预计时长(ms)<input class="beat-duration" type="number" min="1" step="1" value="${beat.estimatedDurationMs}"></label>
            </div>
            <label class="field">Beat 文本<textarea class="beat-text">${esc(beat.text)}</textarea></label>
            <label class="field">ProductFact IDs（逗号分隔）<input class="beat-facts" value="${esc(beat.requiredFactIds.join(","))}"></label>
          </div>`
        )
        .join("")}
      <button class="secondary" type="submit">保存结构化修改为新版本</button>
      <span id="script-revise-progress" class="muted"></span>
      <div id="script-revise-error" class="danger"></div>
    </form>
  </section>
<script>
document.querySelector('#script-revise-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const button=e.currentTarget.querySelector('button[type="submit"]');
  const progress=document.querySelector('#script-revise-progress');
  const error=document.querySelector('#script-revise-error');
  button.disabled=true;error.textContent='';progress.textContent=' 正在验证并保存新 Script 版本…';
  try{
    const beats=[...document.querySelectorAll('.beat-editor')].map((row)=>({
      id:row.dataset.beatId,
      purpose:row.querySelector('.beat-purpose').value,
      text:row.querySelector('.beat-text').value,
      estimatedDurationMs:Number(row.querySelector('.beat-duration').value),
      requiredFactIds:row.querySelector('.beat-facts').value.split(',').map(v=>v.trim()).filter(Boolean)
    }));
    const r=await fetch('/api/projects/${workspace.project.id}/script/revise',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({beats})
    });
    const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);progress.textContent='';button.disabled=false;}
});
</script>`;
  const action = script.status === "DRAFT"
    ? `<button class="primary" id="confirm-script">确认此脚本并生成 Production Plan</button><span id="script-progress" class="muted"></span><div id="script-error" class="danger"></div>
<script>
document.querySelector('#confirm-script').addEventListener('click',async()=>{
 const b=document.querySelector('#confirm-script'),p=document.querySelector('#script-progress'),e=document.querySelector('#script-error');
 b.disabled=true;e.textContent='';p.textContent=' 正在确认脚本并生成导演计划…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/script/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'${workspace.project.id}',confirmCurrent:true})});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.href='/projects/${workspace.project.id}/director';}
 catch(err){e.textContent=err.message||String(err);p.textContent='';b.disabled=false;}
});
</script>`
    : `<a class="primary" href="/projects/${workspace.project.id}/director">继续 Director</a>`;
  return `${projectHeader(workspace, "Script Review")}<section class="card"><h3>Script v${script.version} · ${esc(script.status)}</h3><p class="hash">${esc(script.contentHash)}</p><p>预计：${script.targetDurationMs/1000}s</p></section>
  <section class="card"><h3>Beat</h3>${script.beats.map(b=>`<div class="segment"><b>#${b.order} ${esc(b.purpose)}</b><p>${esc(b.text)}</p><span class="muted">${b.estimatedDurationMs/1000}s · facts: ${esc(b.requiredFactIds.join(","))}</span></div>`).join("")}</section>
  ${revisionEditor}
  <section class="card"><h3>唯一下一步</h3>${action}</section>`;
}

function renderDirector(
  workspace: ProjectWorkspace,
  compiledPrompts: CompiledPrompt[]
): string {
  const plan = workspace.productionPlan;
  if (!plan) {
    const canGenerate = workspace.script?.status === "CONFIRMED";
    return `${projectHeader(workspace, "Director / Clip Planner")}<section class="card"><h3>尚未生成 Production Plan</h3><p>当前脚本必须先确认；生成后由本页审核 Scene → Clip → Segment。</p><button class="primary" id="generate-plan" ${canGenerate?"":"disabled"}>生成 Production Plan</button><span id="plan-generate-progress" class="muted"></span><div id="plan-generate-error" class="danger"></div></section>
<script>
const pg=document.querySelector('#generate-plan');
if(pg) pg.addEventListener('click',async()=>{
 pg.disabled=true;document.querySelector('#plan-generate-progress').textContent=' 正在生成导演计划…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/production-plan/generate',{method:'POST'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.reload();}
 catch(err){document.querySelector('#plan-generate-error').textContent=err.message||String(err);document.querySelector('#plan-generate-progress').textContent='';pg.disabled=false;}
});
</script>`;
  }
  const currentPrompts = compiledPrompts.filter(
    (prompt) =>
      prompt.status === "CURRENT" &&
      prompt.productionPlanRef.entityId === plan.id &&
      prompt.productionPlanRef.version === plan.version &&
      prompt.productionPlanRef.hash === plan.contentHash
  );
  const promptInspector = currentPrompts.length
    ? currentPrompts
        .map(
          (prompt) => `<details class="clip"><summary><b>Clip ${esc(prompt.clipId)}</b> · template=${esc(prompt.compilerTemplateVersion)}</summary>
            <p class="hash">compiledPromptHash=${esc(prompt.compiledPromptHash)}<br>
            truth=${esc(prompt.productTruthRef.hash)}<br>
            script=${esc(prompt.scriptRef.hash)}<br>
            plan=${esc(prompt.productionPlanRef.hash)}</p>
            <h4>Prompt（只读）</h4><pre>${esc(prompt.promptText)}</pre>
            <h4>factMapping</h4><pre>${esc(JSON.stringify(prompt.factMapping, null, 2))}</pre>
            <h4>segmentMapping</h4><pre>${esc(JSON.stringify(prompt.segmentMapping, null, 2))}</pre>
            <h4>constraintMapping</h4><pre>${esc(JSON.stringify(prompt.constraintMapping, null, 2))}</pre>
          </details>`
        )
        .join("")
    : `<p class="muted">尚未编译 CompiledPrompt。进入 Generate 并运行 Preflight 后，这里会显示当前 Plan 对应的只读 Prompt 与映射。</p>`;

  const revisionEditor = `<section class="card"><h3>结构化编辑 Production Plan</h3>
    <p class="muted">保存会创建新的 DRAFT ProductionPlan 版本，并使 CompiledPrompt / Request / Preflight / Approval 进入 STALE；历史版本保留。</p>
    <form id="plan-revise-form">
      <div class="row">
        <label class="field">视觉方向<textarea id="plan-visual-direction">${esc(plan.visualDirection)}</textarea></label>
        <label class="field">声音方向<textarea id="plan-sound-direction">${esc(plan.soundDirection)}</textarea></label>
      </div>
      <label class="field">产品展示规则（每行一条）<textarea id="plan-showcase-rules">${esc(plan.productShowcaseRules.join("\n"))}</textarea></label>
      ${plan.scenes
        .flatMap((scene) =>
          scene.clips.flatMap((clip) =>
            clip.segments.map((segment) => {
              const audio = segment.dialogueOrNarration;
              const ambient = segment.ambientSound;
              return `<details class="clip segment-editor" data-segment-id="${esc(segment.id)}">
                <summary><b>Scene ${scene.order} / Clip ${clip.order} / Segment ${segment.order}</b> · ${segment.startMs}-${segment.endMs}ms</summary>
                <div class="row">
                  <label class="field">startMs<input class="seg-start" type="number" step="1" value="${segment.startMs}"></label>
                  <label class="field">endMs<input class="seg-end" type="number" step="1" value="${segment.endMs}"></label>
                  <label class="field">景别<input class="seg-shot-size" value="${esc(segment.shotSize)}"></label>
                  <label class="field">机位<input class="seg-camera-position" value="${esc(segment.cameraPosition)}"></label>
                  <label class="field">角度<input class="seg-camera-angle" value="${esc(segment.cameraAngle)}"></label>
                  <label class="field">运镜<input class="seg-camera-movement" value="${esc(segment.cameraMovement)}"></label>
                </div>
                <label class="field">构图<input class="seg-composition" value="${esc(segment.composition)}"></label>
                <label class="field">主体动作<textarea class="seg-subject-action">${esc(segment.subjectAction)}</textarea></label>
                <label class="field">产品状态<textarea class="seg-product-state">${esc(segment.productState)}</textarea></label>
                <label class="field">灯光<input class="seg-lighting" value="${esc(segment.lighting)}"></label>
                <div class="row">
                  <label class="field">对白/旁白类型<select class="seg-audio-kind">
                    ${["NONE","DIALOGUE","NARRATION"].map(kind=>`<option value="${kind}" ${audio.kind===kind?"selected":""}>${kind}</option>`).join("")}
                  </select></label>
                  <label class="field">对白/旁白文本<input class="seg-audio-text" value="${esc(audio.kind==="NONE"?"":audio.text)}"></label>
                  <label class="field">语音估时(ms)<input class="seg-audio-duration" type="number" min="1" step="1" value="${audio.kind==="NONE"?"":audio.estimatedDurationMs}" data-estimator="${esc(audio.kind==="NONE"?"p0-ui-v1":audio.estimatorVersion)}"></label>
                  <label class="field">环境音类型<select class="seg-ambient-kind">
                    <option value="NONE" ${ambient.kind==="NONE"?"selected":""}>NONE</option>
                    <option value="AMBIENT" ${ambient.kind==="AMBIENT"?"selected":""}>AMBIENT</option>
                  </select></label>
                  <label class="field">环境音描述<input class="seg-ambient-description" value="${esc(ambient.kind==="NONE"?"":ambient.description)}"></label>
                </div>
                <h4>Continuity In</h4>
                <div class="row">
                  <label class="field">描述<input class="seg-ci-description" value="${esc(segment.continuityIn.description)}"></label>
                  <label class="field">产品状态<input class="seg-ci-product" value="${esc(segment.continuityIn.productState)}"></label>
                  <label class="field">环境状态<input class="seg-ci-environment" value="${esc(segment.continuityIn.environmentState)}"></label>
                </div>
                <h4>Continuity Out</h4>
                <div class="row">
                  <label class="field">描述<input class="seg-co-description" value="${esc(segment.continuityOut.description)}"></label>
                  <label class="field">产品状态<input class="seg-co-product" value="${esc(segment.continuityOut.productState)}"></label>
                  <label class="field">环境状态<input class="seg-co-environment" value="${esc(segment.continuityOut.environmentState)}"></label>
                </div>
              </details>`;
            })
          )
        )
        .join("")}
      <button class="secondary" type="submit">保存结构化修改为新版本</button>
      <span id="plan-revise-progress" class="muted"></span>
      <div id="plan-revise-error" class="danger"></div>
    </form>
  </section>
<script>
document.querySelector('#plan-revise-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const button=e.currentTarget.querySelector('button[type="submit"]');
  const progress=document.querySelector('#plan-revise-progress');
  const error=document.querySelector('#plan-revise-error');
  button.disabled=true;error.textContent='';progress.textContent=' 正在验证并保存新 Production Plan 版本…';
  try{
    const segments=[...document.querySelectorAll('.segment-editor')].map((row)=>{
      const audioKind=row.querySelector('.seg-audio-kind').value;
      const ambientKind=row.querySelector('.seg-ambient-kind').value;
      return {
        id:row.dataset.segmentId,
        startMs:Number(row.querySelector('.seg-start').value),
        endMs:Number(row.querySelector('.seg-end').value),
        shotSize:row.querySelector('.seg-shot-size').value,
        cameraPosition:row.querySelector('.seg-camera-position').value,
        cameraAngle:row.querySelector('.seg-camera-angle').value,
        cameraMovement:row.querySelector('.seg-camera-movement').value,
        composition:row.querySelector('.seg-composition').value,
        subjectAction:row.querySelector('.seg-subject-action').value,
        productState:row.querySelector('.seg-product-state').value,
        lighting:row.querySelector('.seg-lighting').value,
        dialogueOrNarration:audioKind==='NONE'
          ? {kind:'NONE'}
          : {
              kind:audioKind,
              text:row.querySelector('.seg-audio-text').value,
              estimatedDurationMs:Number(row.querySelector('.seg-audio-duration').value),
              estimatorVersion:row.querySelector('.seg-audio-duration').dataset.estimator||'p0-ui-v1'
            },
        ambientSound:ambientKind==='NONE'
          ? {kind:'NONE'}
          : {kind:'AMBIENT',description:row.querySelector('.seg-ambient-description').value},
        continuityIn:{
          description:row.querySelector('.seg-ci-description').value,
          productState:row.querySelector('.seg-ci-product').value,
          environmentState:row.querySelector('.seg-ci-environment').value
        },
        continuityOut:{
          description:row.querySelector('.seg-co-description').value,
          productState:row.querySelector('.seg-co-product').value,
          environmentState:row.querySelector('.seg-co-environment').value
        }
      };
    });
    const payload={
      visualDirection:document.querySelector('#plan-visual-direction').value,
      soundDirection:document.querySelector('#plan-sound-direction').value,
      productShowcaseRules:document.querySelector('#plan-showcase-rules').value.split('\n').map(v=>v.trim()).filter(Boolean),
      segments
    };
    const r=await fetch('/api/projects/${workspace.project.id}/production-plan/revise',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);progress.textContent='';button.disabled=false;}
});
</script>`;

  const action = plan.status === "DRAFT"
    ? `<button class="primary" id="confirm-plan">确认 Production Plan 并进入 Preflight</button><span id="plan-progress" class="muted"></span><div id="plan-error" class="danger"></div>
<script>
document.querySelector('#confirm-plan').addEventListener('click',async()=>{
 const b=document.querySelector('#confirm-plan'),p=document.querySelector('#plan-progress'),e=document.querySelector('#plan-error');
 b.disabled=true;e.textContent='';p.textContent=' 正在确认计划…';
 try{const r=await fetch('/api/projects/${workspace.project.id}/production-plan/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'${workspace.project.id}',confirmCurrent:true})});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error);location.href='/projects/${workspace.project.id}/generate';}
 catch(err){e.textContent=err.message||String(err);p.textContent='';b.disabled=false;}
});
</script>`
    : `<a class="primary" href="/projects/${workspace.project.id}/generate">进入 Preflight / Generate</a>`;
  return `${projectHeader(workspace, "Director / Clip Planner")}<section class="card"><h3>Production Plan v${plan.version} · ${esc(plan.status)}</h3><p class="hash">${esc(plan.contentHash)}</p><p>${esc(plan.visualDirection)}</p><p class="muted">声音方向：${esc(plan.soundDirection)}</p></section>
  ${plan.scenes.map(scene=>`<section class="card scene"><h3>Scene ${scene.order} · ${esc(scene.purpose)}</h3><p class="muted">Beat: ${esc(scene.sourceBeatIds.join(","))} · Facts: ${esc(scene.requiredFactIds.join(","))}</p>${scene.clips.map(clip=>`<div class="clip"><b>Clip ${esc(clip.id)} · ${clip.durationMs/1000}s · ${esc(clip.aggregateStatus)}</b><p>产品：${esc(clip.productVisibility)} · strictIdentity=${clip.strictProductIdentity}</p><p class="muted">风险：${esc(clip.riskAssessment.level)} · Segments: ${clip.segments.length}</p>${clip.segments.map(s=>`<div class="segment">${s.startMs/1000}–${s.endMs/1000}s · ${esc(s.shotSize)} · ${esc(s.cameraPosition)} · ${esc(s.cameraMovement)}<br>${esc(s.subjectAction)}<br><span class="muted">audio=${esc(s.dialogueOrNarration.kind)} · ambient=${esc(s.ambientSound.kind)} · facts=${esc(s.requiredFactIds.join(","))}</span></div>`).join("")}</div>`).join("")}</section>`).join("")}
  ${revisionEditor}
  <section class="card"><h3>Prompt Inspector（只读）</h3><p class="muted">CompiledPrompt 不允许直接编辑；需要修改时回到结构化 Production Plan，再确定性重编译。</p>${promptInspector}</section>
  <section class="card"><h3>唯一下一步</h3>${action}</section>`;
}

function renderGenerate(
  workspace: ProjectWorkspace,
  blockers: WorkflowBlocker[],
  attempts: GenerationAttempt[],
  generationRequests: GenerationRequest[],
  preflights: PreflightReport[],
  approvals: UserApproval[],
  artifacts: ArtifactRecord[],
  reviewDecisions: ReviewDecision[],
  commandAttempts: Array<
    CommandAttemptRecord & {
      generationAttemptId?: string;
      argvRedacted?: string[];
    }
  >,
  probe: ProviderProbeResult
): string {
  const activeReports = preflights.filter((item) => item.status !== "STALE");
  const hasUnknownSubmission = attempts.some(
    (item) =>
      item.status === "SUBMISSION_OUTCOME_UNKNOWN" ||
      item.status === "RECONCILING"
  );
  const requestById = new Map(generationRequests.map((item) => [item.id, item]));
  const blockedCount = activeReports.filter((item) => item.status === "BLOCKED").length;
  const passCount = activeReports.filter((item) => item.status === "PASS").length;
  const preflightCards = activeReports.length
    ? activeReports.map((report) => {
        const request = requestById.get(report.generationRequestId);
        return `<div class="clip"><b>${esc(report.status)} · Clip ${esc(request?.clipId ?? "unknown")}</b>
          <p class="hash">request=${esc(report.requestHash)}<br>preflight=${esc(report.reportHash)}</p>
          <p>时长：${report.totalGeneratedMs/1000}s · 成本：${esc(report.costEstimate.status)}</p>
          ${report.blockers.length?`<p class="danger">blockers: ${esc(report.blockers.join(", "))}</p>`:"<p class=\"ok\">无阻塞</p>"}
          ${report.warnings.length?`<p class="muted">warnings: ${esc(report.warnings.join(", "))}</p>`:""}
        </div>`;
      }).join("")
    : "<p>尚未运行 Preflight。</p>";
  const actionLabel = activeReports.length ? "重新运行 Preflight" : "运行 Preflight";
  const activeApprovals = approvals.filter((item) => item.status === "ACTIVE");
  const allPass =
    activeReports.length > 0 &&
    passCount === activeReports.length &&
    blockedCount === 0;
  const approvalSummary = allPass
    ? `<div class="card"><p class="ok">Preflight 全部 PASS。当前 ACTIVE Approval：${activeApprovals.length}。</p>
       ${activeApprovals.length
         ? "<p class=\"muted\">审批已创建；每个 Approval 只授权对应的一次 GenerationAttempt。</p>"
         : `<label><input type="checkbox" id="accept-unknown-cost"> 我理解成本/积分可能 UNKNOWN，仍授权本次请求</label>
            ${hasUnknownSubmission
              ? `<p class="danger"><b>重复扣费风险：</b>仍有提交结果未知/调和中的 Attempt。创建新 Attempt 可能导致重复生成或重复扣费。</p>
                 <label><input type="checkbox" id="accept-duplicate-approval-risk"> 我明确接受可能重复扣费，并授权创建全新的 Approval / Attempt</label>`
              : ""}
            <p><button class="primary" id="create-approval">确认本次请求并创建 GenerationAttempt</button></p>
            <div id="approval-error" class="danger"></div>`}
       </div>`
    : "";

  const artifactById = new Map(artifacts.map((item) => [item.id, item]));
  const currentClips = (workspace.productionPlan?.scenes ?? []).flatMap(
    (scene) => scene.clips
  );
  const clipHashById = new Map(
    currentClips.map((clip) => [clip.id, clip.contentHash] as const)
  );
  const latestUsageDecisionByClip = new Map<string, ReviewDecision>();
  for (const clip of currentClips) {
    const latest = reviewDecisions
      .filter(
        (decision) =>
          decision.clipId === clip.id &&
          decision.clipHash === clip.contentHash &&
          (decision.decision === "SKIP" || decision.decision === "USE")
      )
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
    if (latest) latestUsageDecisionByClip.set(clip.id, latest);
  }
  const latestSuccessfulAttemptByClip = new Map<string, GenerationAttempt>();
  for (const attempt of attempts) {
    if (
      attempt.status !== "SUCCEEDED" &&
      attempt.status !== "RECONCILED_SUCCEEDED"
    ) {
      continue;
    }
    const existing = latestSuccessfulAttemptByClip.get(attempt.clipId);
    if (!existing || attempt.attemptNumber > existing.attemptNumber) {
      latestSuccessfulAttemptByClip.set(attempt.clipId, attempt);
    }
  }
  const acceptedClipIds = new Set<string>();
  const skippedClipIds = new Set<string>();
  for (const clip of currentClips) {
    if (latestUsageDecisionByClip.get(clip.id)?.decision === "SKIP") {
      skippedClipIds.add(clip.id);
      continue;
    }
    const attempt = latestSuccessfulAttemptByClip.get(clip.id);
    const output = attempt?.outputArtifactId
      ? artifactById.get(attempt.outputArtifactId)
      : undefined;
    if (!attempt || !output?.sha256 || output.integrityStatus !== "READY") {
      continue;
    }
    const latestReview = reviewDecisions
      .filter(
        (decision) =>
          decision.clipId === clip.id &&
          decision.clipHash === clip.contentHash &&
          decision.generationAttemptId === attempt.id &&
          decision.outputArtifactId === output.id &&
          decision.outputArtifactHash === output.sha256 &&
          (decision.decision === "ACCEPT" || decision.decision === "REDO")
      )
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
    if (latestReview?.decision === "ACCEPT") acceptedClipIds.add(clip.id);
  }
  const pendingClipCount = Math.max(
    0,
    currentClips.length - acceptedClipIds.size - skippedClipIds.size
  );
  const clipSelectionHtml = currentClips.length
    ? currentClips
        .map((clip, index) => {
          const skipped = skippedClipIds.has(clip.id);
          const accepted = acceptedClipIds.has(clip.id);
          const latestAttempt = attempts
            .filter((attempt) => attempt.clipId === clip.id)
            .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
          const state = skipped
            ? "已跳过"
            : accepted
              ? "已接受"
              : latestAttempt?.status ?? "未生成";
          const action = skipped
            ? `<button class="secondary clip-usage-action" data-clip="${esc(clip.id)}" data-decision="USE">恢复此 Clip</button>`
            : `<button class="secondary clip-usage-action" data-clip="${esc(clip.id)}" data-decision="SKIP">跳过此 Clip</button>`;
          return `<div class="clip"><b>Clip ${index + 1} · ${esc(state)}</b>
            <p class="hash">${esc(clip.id)} · ${(clip.durationMs / 1000).toFixed(1)}s</p>
            <p>${accepted ? '<span class="ok">已纳入当前成片</span>' : skipped ? '<span class="muted">不纳入当前成片，也不要求生成</span>' : '<span class="muted">尚未决定是否采用</span>'} ${action}</p>
          </div>`;
        })
        .join("")
    : "<p>当前计划没有 Clip。</p>";
  const commandsByAttempt = new Map<string, typeof commandAttempts>();
  for (const command of commandAttempts) {
    if (!command.generationAttemptId) continue;
    const list = commandsByAttempt.get(command.generationAttemptId) ?? [];
    list.push(command);
    commandsByAttempt.set(command.generationAttemptId, list);
  }
  const clipOrderById = new Map(
    currentClips.map((clip, index) => [clip.id, index] as const)
  );
  const currentPlanAttempts = attempts
    .filter((attempt) => clipOrderById.has(attempt.clipId))
    .sort((a, b) => {
      const clipDelta =
        clipOrderById.get(a.clipId)! - clipOrderById.get(b.clipId)!;
      return clipDelta || b.attemptNumber - a.attemptNumber;
    });
  const historicalAttempts = attempts
    .filter((attempt) => !clipOrderById.has(attempt.clipId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const renderAttemptCard = (
    attempt: GenerationAttempt,
    historical = false
  ): string => {
    const clipIndex = clipOrderById.get(attempt.clipId);
    const isSkipped = skippedClipIds.has(attempt.clipId);
    const output = attempt.outputArtifactId
      ? artifactById.get(attempt.outputArtifactId)
      : undefined;
    const currentClipHash = clipHashById.get(attempt.clipId);
    const matchingReviews = reviewDecisions
      .filter(
        (decision) =>
          decision.generationAttemptId === attempt.id &&
          decision.clipId === attempt.clipId &&
          decision.clipHash === currentClipHash &&
          decision.outputArtifactId === output?.id &&
          decision.outputArtifactHash === output?.sha256
      )
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
    const latestReview = matchingReviews[0];
    const actions: string[] = [];
    if (!historical && !isSkipped && attempt.status === "CREATED") {
      actions.push(`<button class="primary attempt-action" data-attempt="${esc(attempt.id)}" data-action="submit">提交此 Clip</button>`);
    }
    if (
      !historical &&
      !isSkipped &&
      (attempt.status === "SUBMITTED" || attempt.status === "PROCESSING")
    ) {
      actions.push(`<button class="secondary attempt-action" data-attempt="${esc(attempt.id)}" data-action="poll">刷新状态</button>`);
    }
    if (
      !historical &&
      !isSkipped &&
      (attempt.status === "SUCCEEDED" ||
        attempt.status === "RECONCILED_SUCCEEDED") &&
      !output
    ) {
      actions.push(`<button class="primary attempt-action" data-attempt="${esc(attempt.id)}" data-action="download">下载结果</button>`);
    }
    if (
      !historical &&
      !isSkipped &&
      (attempt.status === "SUBMISSION_OUTCOME_UNKNOWN" ||
        attempt.status === "RECONCILING")
    ) {
      actions.push(`<button class="primary attempt-action" data-attempt="${esc(attempt.id)}" data-action="reconcile">调和提交结果</button>`);
    }
    const reviewControls =
      !historical &&
      !isSkipped &&
      output?.integrityStatus === "READY" &&
      output.kind === "GENERATED_VIDEO" &&
      (attempt.status === "SUCCEEDED" ||
        attempt.status === "RECONCILED_SUCCEEDED")
        ? `<div class="card">
            <video controls preload="metadata" style="width:100%;max-height:520px" src="/api/artifacts/${esc(output.id)}/content"></video>
            <p class="hash">video=${esc(output.id)} · sha256=${esc(output.sha256 ?? "UNKNOWN")}</p>
            ${latestReview
              ? `<p>最新审片：<b>${esc(latestReview.decision)}</b> · ${esc(latestReview.decidedAt)}</p>`
              : `<p><button class="primary review-action" data-attempt="${esc(attempt.id)}" data-clip="${esc(attempt.clipId)}" data-decision="ACCEPT">接受此结果</button>
                 <button class="secondary review-action" data-attempt="${esc(attempt.id)}" data-clip="${esc(attempt.clipId)}" data-decision="REDO">重做此 Clip</button></p>`}
          </div>`
        : "";
    const redoControl =
      !historical && !isSkipped && latestReview?.decision === "REDO"
        ? `<p><button class="primary redo-preflight" data-clip="${esc(attempt.clipId)}">为此 Clip 运行新 Preflight</button></p>`
        : "";
    const commands = commandsByAttempt.get(attempt.id) ?? [];
    const commandHtml = commands.length
      ? `<details><summary>命令审计（${commands.length}）</summary>${commands
          .map(
            (command) =>
              `<p class="hash">${esc(command.operation)} #${command.attemptNumber} · exit=${esc(command.exitCode ?? "pending")} · timeout=${command.timedOut}<br>argv=${esc((command.argvRedacted ?? []).join(" "))}<br>parser=${esc(command.parserVersion)} · redaction=${esc(command.redactionRulesVersion)}</p>`
          )
          .join("")}</details>`
      : "";
    const label = historical
      ? `旧计划 · #${attempt.attemptNumber}`
      : `Clip ${(clipIndex ?? 0) + 1} · Attempt #${attempt.attemptNumber}`;
    return `<div class="clip"><b>${label} · ${esc(attempt.status)}</b>
      <p class="hash">clip=${esc(attempt.clipId)}<br>attempt=${esc(attempt.id)}<br>request=${esc(attempt.requestHash)}<br>approval=${esc(attempt.approvalHash)}</p>
      ${attempt.providerHandle?.externalTaskId ? `<p>task=${esc(attempt.providerHandle.externalTaskId)}</p>` : ""}
      ${historical ? `<p class="muted">此记录不属于当前 ProductionPlan，仅保留为历史审计。</p>` : ""}
      ${isSkipped ? `<p class="muted">此 Clip 已标记为跳过，不参与当前成片。${attempt.status === "SUBMITTED" || attempt.status === "PROCESSING" ? " 已提交的远端任务可能仍会继续完成。" : ""}</p>` : ""}
      ${attempt.errorMessage ? `<p class="danger">${esc(attempt.errorCode ?? "ERROR")} · ${esc(attempt.errorMessage)}</p>` : ""}
      <p>${actions.join(" ")}</p>
      ${commandHtml}
      ${reviewControls}
      ${redoControl}
    </div>`;
  };

  const attemptCards = currentPlanAttempts.length
    ? currentPlanAttempts.map((attempt) => renderAttemptCard(attempt)).join("")
    : "<p>当前 ProductionPlan 尚无生成尝试。</p>";
  const historicalAttemptCards = historicalAttempts.length
    ? `<details><summary>历史/旧计划 Attempt（${historicalAttempts.length}）</summary>${historicalAttempts
        .map((attempt) => renderAttemptCard(attempt, true))
        .join("")}</details>`
    : "";

  return `${projectHeader(workspace, "Generate / Task Monitor")}
  <section class="card"><h3>Provider</h3>
    <p>dreamina：<b class="${probe.code==="READY"?"ok":"danger"}">${esc(probe.code)}</b></p>
    <p class="hash">providerIdentityHash: ${esc(probe.providerIdentityHash)}<br>capabilityFingerprint: ${esc(probe.capabilityFingerprint)}</p>
    ${probe.code==="READY"?`<p>版本：${esc(probe.cliVersion)} · models: ${esc(probe.supportedModels.join(", "))} · operations: ${esc(probe.supportedOperations.join(", "))}</p>`:""}
    <p>当前计划：${esc(refText(workspace.project.currentProductionPlanRef))}</p>
  </section>
  <section class="card"><h3>本轮选片</h3>
    <p>已接受 <b class="ok">${acceptedClipIds.size}</b> · 已跳过 <b>${skippedClipIds.size}</b> · 待决定 <b>${pendingClipCount}</b></p>
    <p class="muted">不需要的 Clip 可以直接跳过，无需生成。只要至少保留 1 个已接受 Clip，就可以明确结束本轮并进入下一步。</p>
    <div>${clipSelectionHtml}</div>
    ${acceptedClipIds.size > 0 && pendingClipCount > 0
      ? `<p><button class="primary" id="finalize-selection">使用当前已接受片段进入下一步</button></p>
         <p class="muted">此操作会把其余尚未采用的 Clip 明确标记为“跳过”；不会静默删除历史任务。</p>
         <div id="finalize-selection-error" class="danger"></div>`
      : acceptedClipIds.size > 0 && pendingClipCount === 0
        ? `<p class="ok">当前所有 Clip 已完成“采用或跳过”决策，可以进入下一步。</p>`
        : `<p class="muted">至少先接受 1 个生成结果，才能用部分片段进入下一步。</p>`}
  </section>
  <section class="card"><h3>Preflight</h3>
    <p>当前：PASS ${passCount} · BLOCKED ${blockedCount} · 历史/STALE ${preflights.length-activeReports.length}</p>
    <div>${preflightCards}</div>
    ${hasUnknownSubmission
      ? `<div class="card"><p class="danger"><b>存在未决提交：</b>普通 Preflight 被禁止。只有明确接受可能重复扣费，才能创建一条全新的 Request / Preflight 链；原未知 Attempt 仍保留等待调和。</p>
         <label><input type="checkbox" id="accept-duplicate-preflight-risk"> 我明确接受可能重复扣费，并允许创建新的 Preflight 链</label></div>`
      : ""}
    ${approvalSummary}
    <p><button class="primary" id="run-preflight" ${workspace.productionPlan?.status==="CONFIRMED"?"":"disabled"}>${actionLabel}</button>
    <span id="preflight-progress" class="muted"></span></p>
    <div id="preflight-error" class="danger"></div>
  </section>
  <section class="card"><h3>WorkflowBlocker</h3>${blockers.length?blockers.map(b=>`<p><code>${esc(b.reasonCode)}</code> · ${esc(b.requiredUserAction)} · resume=${esc(b.resumeCheckpoint)}</p>`).join(""):"<p>无未解决阻塞。</p>"}</section>
  <section class="card"><h3>GenerationAttempt</h3>${attemptCards}${historicalAttemptCards}</section>
<script>
const pf=document.querySelector('#run-preflight');
if(pf) pf.addEventListener('click',async()=>{
  pf.disabled=true;
  const progress=document.querySelector('#preflight-progress'), error=document.querySelector('#preflight-error');
  error.textContent=''; progress.textContent=' 正在编译 Prompt、建立 Request 并执行 Preflight…';
  try{
    const acceptedDuplicateSubmissionRisk=Boolean(document.querySelector('#accept-duplicate-preflight-risk')?.checked);
    const r=await fetch('/api/projects/${workspace.project.id}/preflight/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({acceptedDuplicateSubmissionRisk})});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);progress.textContent='';pf.disabled=false;}
});

const approvalButton=document.querySelector('#create-approval');
if(approvalButton) approvalButton.addEventListener('click',async()=>{
  approvalButton.disabled=true;
  const error=document.querySelector('#approval-error');
  error.textContent='';
  try{
    const acceptedUnknownCostRisk=Boolean(document.querySelector('#accept-unknown-cost')?.checked);
    const acceptedDuplicateSubmissionRisk=Boolean(document.querySelector('#accept-duplicate-approval-risk')?.checked);
    const r=await fetch('/api/projects/${workspace.project.id}/approval',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({acceptedUnknownCostRisk,acceptedDuplicateSubmissionRisk})
    });
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);approvalButton.disabled=false;}
});

document.querySelectorAll('.attempt-action').forEach(button=>{
  button.addEventListener('click',async()=>{
    const attemptId=button.dataset.attempt, action=button.dataset.action;
    button.disabled=true;
    try{
      const r=await fetch('/api/projects/${workspace.project.id}/attempts/'+encodeURIComponent(attemptId)+'/'+encodeURIComponent(action),{method:'POST'});
      const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
      location.reload();
    }catch(err){alert(err.message||String(err));button.disabled=false;}
  });
});

document.querySelectorAll('.review-action').forEach(button=>{
  button.addEventListener('click',async()=>{
    const attemptId=button.dataset.attempt, clipId=button.dataset.clip, decision=button.dataset.decision;
    button.disabled=true;
    try{
      const r=await fetch('/api/projects/${workspace.project.id}/clips/'+encodeURIComponent(clipId)+'/review',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({generationAttemptId:attemptId,decision})
      });
      const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
      location.reload();
    }catch(err){alert(err.message||String(err));button.disabled=false;}
  });
});

document.querySelectorAll('.clip-usage-action').forEach(button=>{
  button.addEventListener('click',async()=>{
    const clipId=button.dataset.clip, decision=button.dataset.decision;
    button.disabled=true;
    try{
      const r=await fetch('/api/projects/${workspace.project.id}/clips/'+encodeURIComponent(clipId)+'/review',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({decision})
      });
      const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
      location.reload();
    }catch(err){alert(err.message||String(err));button.disabled=false;}
  });
});

const finalizeSelection=document.querySelector('#finalize-selection');
if(finalizeSelection) finalizeSelection.addEventListener('click',async()=>{
  if(!confirm('确认使用当前已接受片段进入下一步？其余尚未采用的 Clip 将被明确标记为跳过。')) return;
  finalizeSelection.disabled=true;
  const error=document.querySelector('#finalize-selection-error');
  error.textContent='';
  try{
    const r=await fetch('/api/projects/${workspace.project.id}/review/finalize-selection',{method:'POST'});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);finalizeSelection.disabled=false;}
});

document.querySelectorAll('.redo-preflight').forEach(button=>{
  button.addEventListener('click',async()=>{
    const clipId=button.dataset.clip;
    button.disabled=true;
    try{
      const r=await fetch('/api/projects/${workspace.project.id}/preflight/run',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          clipIds:[clipId],
          acceptedDuplicateSubmissionRisk:Boolean(document.querySelector('#accept-duplicate-preflight-risk')?.checked)
        })
      });
      const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
      location.reload();
    }catch(err){alert(err.message||String(err));button.disabled=false;}
  });
});
</script>`;
}

function renderFinal(
  workspace: ProjectWorkspace,
  assembly: FinalAssembly | undefined,
  artifacts: ArtifactRecord[],
  publishAttempts: PublishAttempt[],
  publishProbe: DouyinPublishProbe | undefined
): string {
  const finalArtifact = assembly
    ? artifacts.find((item) => item.id === assembly.outputArtifactId)
    : undefined;
  const canRender =
    workspace.project.status === "READY_TO_ASSEMBLE" ||
    workspace.project.status === "FINAL_REVIEW" ||
    workspace.project.status === "READY_TO_PUBLISH" ||
    workspace.project.status === "PUBLISHING" ||
    workspace.project.status === "PUBLISHED" ||
    workspace.project.status === "COMPLETED";
  const assemblyHtml =
    assembly && assembly.status !== "STALE" && finalArtifact?.integrityStatus === "READY"
      ? `<div class="card">
          <p><b>当前成片：</b>${esc(assembly.status)} · ${assembly.selectedClipIds.length} 个已接受 Clip</p>
          <p class="hash">assembly=${esc(assembly.id)}<br>artifact=${esc(finalArtifact.id)}<br>sha256=${esc(finalArtifact.sha256 ?? "UNKNOWN")}</p>
          <video controls preload="metadata" style="width:100%;max-height:720px;background:#000" src="/api/artifacts/${esc(finalArtifact.id)}/content"></video>
          <p><a class="secondary" href="/api/artifacts/${esc(finalArtifact.id)}/content" download="product-video-${esc(assembly.id)}.mp4">下载成片 MP4</a></p>
          <p class="muted">P0 成片只按 ProductionPlan 顺序直接拼接已接受片段；不做裁剪、转场、字幕、BGM 或 Timeline 编辑。</p>
          ${assembly.status === "READY"
            ? `<p><button class="primary" id="accept-final">接受成片</button></p><div id="accept-final-error" class="danger"></div>`
            : `<p class="ok">成片已确认，可以进入抖音发布。</p>`}
        </div>`
      : `<div class="card">
          <p>尚未生成最终成片。</p>
          <p class="muted">系统会按当前 ProductionPlan 顺序，把已接受且未跳过的 Clip 直接无剪辑拼接为一个 MP4。</p>
          <p><button class="primary" id="render-final" ${canRender ? "" : "disabled"}>生成成片</button></p>
          <div id="render-final-error" class="danger"></div>
        </div>`;

  const publishHistory = publishAttempts.length
    ? `<details><summary>发布记录（${publishAttempts.length}）</summary>${publishAttempts
        .slice()
        .reverse()
        .map(
          (attempt) =>
            `<div class="clip"><b>${esc(attempt.status)} · ${esc(attempt.title)}</b>
              <p class="hash">publish=${esc(attempt.id)}${attempt.externalVideoId ? `<br>video_id=${esc(attempt.externalVideoId)}` : ""}${attempt.externalItemId ? `<br>item_id=${esc(attempt.externalItemId)}` : ""}</p>
              ${attempt.errorMessage ? `<p class="danger">${esc(attempt.errorCode ?? "ERROR")} · ${esc(attempt.errorMessage)}</p>` : ""}
            </div>`
        )
        .join("")}</details>`
    : "";

  let publishControls = `<p class="muted">先确认最终成片后才能发布。</p>`;
  if (assembly?.status === "ACCEPTED") {
    if (!publishProbe) {
      publishControls = `<p class="muted">正在检查抖音发布能力。</p>`;
    } else if (publishProbe.code === "NOT_CONFIGURED") {
      publishControls = `<p class="danger"><b>抖音 OpenAPI 尚未配置。</b></p><p>${esc(publishProbe.reason)}</p>`;
    } else if (publishProbe.code === "AUTH_REQUIRED") {
      publishControls = `<p class="danger"><b>需要抖音账号授权。</b> ${esc(publishProbe.reason)}</p>
        <p><a class="primary" href="/api/projects/${workspace.project.id}/publish/douyin/oauth/start">连接抖音账号</a></p>`;
    } else {
      publishControls = `<div class="row">
          <label class="field">发布标题<input id="douyin-title" maxlength="100" value="${esc(workspace.project.name)}"></label>
        </div>
        <label class="field">描述 / 话题<textarea id="douyin-description" placeholder="可选，例如：产品展示 #产品视频"></textarea></label>
        <p><label><input type="checkbox" id="confirm-douyin-publish"> 我确认现在将该成片发布到已授权的抖音账号</label></p>
        <p><button class="primary" id="publish-douyin">确认发布到抖音</button></p>
        <div id="publish-douyin-error" class="danger"></div>`;
    }
  }

  return `${projectHeader(workspace, "Final Video / Publish")}
  <section class="card"><h3>成片</h3>${assemblyHtml}</section>
  <section class="card"><h3>发布到抖音</h3>
    <p class="muted">使用抖音开放平台官方 OAuth + video.create 发布链路。每次发布都必须由你明确确认，不会自动静默发布。</p>
    ${publishControls}
    ${publishHistory}
  </section>
<script>
const renderFinal=document.querySelector('#render-final');
if(renderFinal) renderFinal.addEventListener('click',async()=>{
  renderFinal.disabled=true;
  const error=document.querySelector('#render-final-error'); error.textContent='';
  try{
    const r=await fetch('/api/projects/${workspace.project.id}/final/render',{method:'POST'});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);renderFinal.disabled=false;}
});

const acceptFinal=document.querySelector('#accept-final');
if(acceptFinal) acceptFinal.addEventListener('click',async()=>{
  acceptFinal.disabled=true;
  const error=document.querySelector('#accept-final-error'); error.textContent='';
  try{
    const r=await fetch('/api/projects/${workspace.project.id}/final/accept',{method:'POST'});
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);acceptFinal.disabled=false;}
});

const publishDouyin=document.querySelector('#publish-douyin');
if(publishDouyin) publishDouyin.addEventListener('click',async()=>{
  const confirmed=Boolean(document.querySelector('#confirm-douyin-publish')?.checked);
  if(!confirmed){alert('请先勾选明确发布确认。');return;}
  if(!confirm('确认现在把最终成片发布到已授权的抖音账号？')) return;
  publishDouyin.disabled=true;
  const error=document.querySelector('#publish-douyin-error'); error.textContent='';
  try{
    const r=await fetch('/api/projects/${workspace.project.id}/publish/douyin',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        title:document.querySelector('#douyin-title')?.value||'',
        description:document.querySelector('#douyin-description')?.value||'',
        confirmed
      })
    });
    const j=await r.json(); if(!r.ok) throw new Error(j.message||j.error);
    location.reload();
  }catch(err){error.textContent=err.message||String(err);publishDouyin.disabled=false;}
});
</script>`;
}

export function renderProjectPage(input: {
  kind: PageKind;
  workspace: ProjectWorkspace;
  productInput?: ProductInputSnapshot;
  blockers: WorkflowBlocker[];
  attempts: GenerationAttempt[];
  generationRequests: GenerationRequest[];
  preflights: PreflightReport[];
  approvals: UserApproval[];
  compiledPrompts: CompiledPrompt[];
  artifacts: ArtifactRecord[];
  reviewDecisions: ReviewDecision[];
  commandAttempts: Array<
    CommandAttemptRecord & {
      generationAttemptId?: string;
      argvRedacted?: string[];
    }
  >;
  probe?: ProviderProbeResult;
  finalAssembly?: FinalAssembly;
  publishAttempts?: PublishAttempt[];
  publishProbe?: DouyinPublishProbe;
}): string {
  const {
    kind,
    workspace,
    blockers,
    attempts,
    generationRequests,
    preflights,
    approvals,
    compiledPrompts,
    artifacts,
    reviewDecisions,
    commandAttempts
  } = input;
  let body = "";
  if (kind === "product") body = renderProduct(workspace, input.productInput);
  if (kind === "truth") {
    body = renderTruth(workspace, input.productInput, artifacts);
  }
  if (kind === "creative") body = renderCreative(workspace);
  if (kind === "script") body = renderScript(workspace);
  if (kind === "director") body = renderDirector(workspace, compiledPrompts);
  if (kind === "generate") {
    if (!input.probe) throw new Error("generate page requires provider probe");
    body = renderGenerate(
      workspace,
      blockers,
      attempts,
      generationRequests,
      preflights,
      approvals,
      artifacts,
      reviewDecisions,
      commandAttempts,
      input.probe
    );
  }
  if (kind === "final") {
    body = renderFinal(
      workspace,
      input.finalAssembly,
      artifacts,
      input.publishAttempts ?? [],
      input.publishProbe
    );
  }
  return layout(kind, body, workspace.project, blockers);
}
