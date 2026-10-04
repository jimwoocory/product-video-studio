import type { ProjectWorkspace } from "../application/services/product-flow.js";
import { renderPostProductionControls, postProductionBrowserScript } from "./post-production-ui.js";
import { runnableSmartStatuses, closedSmartStatuses, type SmartGenerationRun, type SmartRunStatus } from "../domain/smart-generation.js";
function esc(value: unknown): string { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const statusLabels: Record<SmartRunStatus, string> = {
  PLANNING: "正在规划", WAITING_FOR_TRUTH_REVIEW: "等待产品事实审核", WAITING_FOR_REFERENCE_REVIEW: "等待创作参考审核",
  WAITING_FOR_CREATIVE_REVIEW: "等待选择创意", WAITING_FOR_SCRIPT_REVIEW: "等待确认脚本", WAITING_FOR_PLAN_REVIEW: "等待确认分镜",
  READY_FOR_PAID_CONFIRM: "等待本次付费确认", APPROVING: "正在建立独立审批", GENERATING: "正在生成与下载",
  WAITING_FOR_CLIP_REVIEW: "等待审片", AUTO_EDITING: "正在准备自动剪辑", WAITING_FOR_AUDIO: "等待音频素材",
  RENDERING: "正在渲染", REVIEW_READY: "成片待确认", COMPLETED: "成片已确认", BLOCKED: "需要处理", FAILED: "执行失败", CANCELLED: "本地编排已取消"
};
export function renderSmartGenerationPage(workspace: ProjectWorkspace, runs: SmartGenerationRun[]): string {
  const id = encodeURIComponent(workspace.project.id);
  const active = runs.some(r => !closedSmartStatuses.includes(r.status));
  const cards = runs.map(run => {
    const pid = `/projects/${id}`;
    let action = "";
    if (run.status === "WAITING_FOR_CREATIVE_REVIEW") action = (run.creativeBatch?.concepts ?? []).map(c => `<div class="item"><b>${esc(c.title)}</b><p>${esc(c.hook)}</p><p>${esc(c.productShowcaseStrategy)}</p><button data-action="SELECT_CREATIVE" data-creative="${esc(c.id)}">选择此方案</button></div>`).join("");
    if (run.status === "WAITING_FOR_SCRIPT_REVIEW") action = `<div>${run.script?.beats.map(b => `<p>${b.estimatedDurationMs / 1000} 秒 · ${esc(b.text)}</p>`).join("")}</div><button data-action="CONFIRM_SCRIPT">确认此脚本</button>`;
    if (run.status === "WAITING_FOR_PLAN_REVIEW") action = `<p>模型：${esc(run.productionPlan?.generationTarget?.requestedModelVersion)} · ${esc(run.productionPlan?.generationTarget?.aspectRatio)}</p>${run.productionPlan?.scenes.flatMap(s => s.clips).map(c => `<p>${c.durationMs / 1000} 秒 · ${esc(c.purpose)}</p>`).join("")}<button data-action="CONFIRM_PLAN">确认此分镜</button>`;
    if (run.status === "READY_FOR_PAID_CONFIRM" && run.paidScope) {
      const scope = run.paidScope;
      const unknown = scope.requests.some(r => r.costStatus === "UNKNOWN");
      action = `<h3>确认本轮 ${scope.requests.length} 个镜头</h3><p>模型：${esc(run.options.generationSettings.requestedModelVersion)} · 画幅 ${esc(run.options.generationSettings.aspectRatio)} · ${esc(run.options.generationSettings.videoResolution)} · 目标 ${run.targetDurationMs / 1000} 秒</p>
      <p>${unknown ? "部分镜头的积分成本无法准确估计。" : "预计积分合计：" + scope.requests.reduce((sum, r) => sum + (r.estimatedCredits ?? 0), 0)}</p>
      ${scope.requests.map((r, i) => `<p>请求 ${i + 1}：${r.costStatus === "UNKNOWN" ? "成本未知" : esc(r.estimatedCredits ?? r.costText ?? "平台估计")}<span class="muted"> ${esc(r.costText ?? "")}</span></p>`).join("")}
      <p><label><input type="checkbox" class="confirm-paid"> 我明确授权本轮上述镜头的付费生成；不包含重做或新增镜头。</label></p>
      ${unknown ? '<p><label><input type="checkbox" class="unknown-cost"> 我接受本轮成本未知的积分风险。</label></p>' : ""}
      <button data-action="paid" data-scope="${esc(scope.hash)}">确认并开始本轮生成</button>`;
    }
    if (["WAITING_FOR_TRUTH_REVIEW", "WAITING_FOR_REFERENCE_REVIEW", "WAITING_FOR_CLIP_REVIEW", "WAITING_FOR_AUDIO", "BLOCKED", "FAILED"].includes(run.status)) {
      action += `<p><a href="${pid}/truth">产品事实</a> · <a href="${pid}/generate">视频生成与审片</a> · <a href="${pid}/timeline">手动剪辑</a></p>`;
      if (run.blocker?.retryable !== false) action += '<button data-action="resume">问题处理后继续原任务</button>';
    }
    if (!closedSmartStatuses.includes(run.status) && !["RENDER", "FINAL_REVIEW"].includes(run.stage)) {
      action += `<details><summary>调整本轮字幕与声音设置</summary>${renderPostProductionControls({ projectId: workspace.project.id,
        settings: run.postProduction ?? run.options.postProduction ?? { bgmArtifactId: run.options.bgmArtifactId, allowSilentOutput: run.options.allowSilentOutput }, plan: run.productionPlan })}
        <button data-action="post-production">保存后期设置${run.stage === "AUTO_EDIT" ? "并继续" : ""}</button></details>`;
    }
    if (["AUTO_EDIT", "CLIP_REVIEW"].includes(run.stage) && !closedSmartStatuses.includes(run.status)) action += `<p><a href="${pid}/auto-edit">独立自动剪辑与音轨设置</a></p><button class="secondary" data-action="adopt-timeline">采用已确认的当前手工时间线</button>`;
    if (run.status === "REVIEW_READY") action += `<p><a href="${pid}/final">查看并确认最终成片</a></p><button data-action="final-confirmed">已在成片页确认，结束编排任务</button>`;
    if (!closedSmartStatuses.includes(run.status)) action += '<button class="secondary" data-action="cancel">停止后续编排</button>';
    return `<section class="card run" data-run="${esc(run.id)}" data-revision="${run.revision}" data-status="${run.status}"><h2>${esc(statusLabels[run.status])}</h2><p>${esc(run.options.requestText)}</p>
      <p class="muted">${esc(run.updatedAt)} · ${run.options.reviewMode === "AUTO" ? "自动创作，付费和事实仍需确认" : "分阶段审核创作"}</p>
      ${run.blocker ? `<p class="error">${esc(run.blocker.message)}</p>` : ""}
      ${action}<p class="error action-error" role="alert"></p>
      <details><summary>执行记录</summary>${run.notes.slice(-12).map(n => `<p class="muted">${esc(n.at)} · ${esc(n.message)}</p>`).join("")}</details></section>`;
  }).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>一键成片 · ${esc(workspace.project.name)}</title>
  <style>body{font:16px/1.65 system-ui,sans-serif;background:#f5f6f7;color:#17212b;margin:0}main{max-width:1050px;margin:32px auto;padding:0 22px}.card{background:white;border:1px solid #d9dfe5;border-radius:12px;padding:24px;margin:20px 0}.row{display:flex;flex-wrap:wrap;gap:16px}label.field{display:flex;flex-direction:column;flex:1;min-width:180px}input,select,textarea,button{font:inherit}select,textarea{padding:10px;border:1px solid #bcc4cc;border-radius:7px}textarea{width:calc(100% - 22px);min-height:96px}button{padding:9px 16px;border-radius:7px;border:1px solid #17212b;background:#17212b;color:white;cursor:pointer;margin:8px 8px 0 0}button:disabled{opacity:.5;cursor:wait}.secondary{background:white;color:#17212b}.error{color:#ac2424}.muted{color:#63717e;font-size:14px}.item{border-bottom:1px solid #ddd;padding:14px 0}a{color:#245b91}h1,h2{line-height:1.3}</style></head><body><main data-project="${esc(workspace.project.id)}">
  <nav><a href="/projects/${id}/agent">单视频直出</a> · <a href="/projects/${id}/director">标准导演流程</a> · <a href="/projects">项目</a></nav>
  <h1>一键成片工作台</h1><p>${esc(workspace.project.name)} · 目标 ${workspace.project.targetDurationMs / 1000} 秒</p>
  <p class="muted">已接入可恢复规划、批量生成、视觉 AI 辅助审片、规则自动剪辑、字幕与后期音轨。视觉 AI 只在你明确启用且产品身份、稳定性、使用约束、画质和固定时长剪辑窗口全部高置信通过时自动采用；其他情况返回人工审片。</p>
  <p><a href="/projects/${id}/creative-references">管理本项目已确认创作参考</a>（修改集合后需要重新规划，不复用旧付费范围）</p>
  ${active ? '<p>本项目已有未结束的编排，请继续下方原任务，或明确停止后再创建。</p>' : `<section class="card"><h2>创建编排任务</h2><form id="smart-create">
  <label for="request-text">视频要求</label><textarea id="request-text" required maxlength="6000" placeholder="说明产品展示方式、使用场景、受众和创作要求"></textarea>
  <div class="row"><label class="field">目标视频模型<select id="smart-model" disabled></select></label><label class="field">画幅<select id="smart-ratio" disabled></select></label><label class="field">分辨率<select id="smart-resolution" disabled></select></label></div>
  <p><label><input type="checkbox" id="smart-native-audio" disabled> 请求模型原生声音（仅在当前能力允许时）</label></p><p class="muted" id="smart-audio-help"></p>
  <p><label><input type="checkbox" id="auto-creative"> 自动选择创意并确认脚本、分镜；不自动确认产品事实、付费或最终成片。</label></p>
  <p><label><input type="checkbox" id="auto-visual-review"> 高置信视觉自动采用生成镜头。仅在视觉门禁全部通过时生效；不确定、产品变化、使用动作疑点或明显穿帮会暂停人工审片，不会自动重做。</label></p>
  <p class="muted">启用此项会调用“模型设置 → 视觉审片 / 智能剪辑”配置的图片理解模型；它不会额外提交 Dreamina 视频生成。</p>
  <p><label><input type="checkbox" id="use-research"> 使用当前已有研究的结构与创作方向；新事实候选必须先审核。</label></p>
  ${renderPostProductionControls({ projectId: workspace.project.id })}
  <p class="muted">会保存新的创意、脚本与分镜版本，使旧生成前检查失效；历史素材与生成记录不删除。</p>
  <button id="start-smart" disabled>开始规划（不提交付费视频生成）</button><p class="error" id="create-error" role="alert"></p></form></section>`}
  <div id="run-list">${cards || '<p class="muted">尚无一键成片任务。</p>'}</div><p class="muted" id="poll-state"></p>
  </main>${postProductionBrowserScript}<script>
  (()=>{
    const project=document.querySelector('main').dataset.project,base='/api/projects/'+encodeURIComponent(project)+'/smart-runs';
    let busy=false;const form=document.querySelector('#smart-create');
    async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||'操作失败');return j;}
    if(form){const model=document.querySelector('#smart-model'),ratio=document.querySelector('#smart-ratio'),resolution=document.querySelector('#smart-resolution'),audio=document.querySelector('#smart-native-audio'),start=document.querySelector('#start-smart');let registry=null;const requestKey=crypto.randomUUID();
      const intersection=a=>a.length?a.reduce((x,y)=>x.filter(v=>y.includes(v))):[];
      const fill=(el,values,old)=>{el.replaceChildren();for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v==='AUTO'?'自动 / 跟随素材':v;el.append(o);}if(values.includes(old))el.value=old;el.disabled=!values.length;};
      const refresh=()=>{const ops=['text2video','multimodal2video'].map(n=>registry.operations.find(o=>o.operation===n));const caps=ops.map(o=>o.models.find(m=>m.modelVersion===model.value));if(caps.some(c=>!c))return;
        fill(ratio,['AUTO',...(caps.every(c=>c.explicitRatioAllowed)?intersection(ops.map(o=>o.supportedRatios)):[])],ratio.value||'9:16');fill(resolution,intersection(caps.map(c=>c.supportedResolutions)),resolution.value||'720p');
        const supported=ops.every(o=>o.supportsNativeAudioOutput);audio.disabled=!supported;if(!supported)audio.checked=false;
        document.querySelector('#smart-audio-help').textContent=supported?'原生声音与参考音频是不同能力。':'当前命令未暴露原生声音开关；请在下方选择后期配音或提供音频，不会把参考音频当成输出声音开关。';start.disabled=!model.value||!resolution.value;};
      model.addEventListener('change',refresh);
      fetch('/api/dreamina/capabilities').then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.message||'读取能力失败');registry=j.registry;const ops=['text2video','multimodal2video'].map(n=>registry.operations.find(o=>o.operation===n));if(ops.some(o=>!o))throw new Error('当前命令能力不完整');fill(model,intersection(ops.map(o=>o.supportedModels)),'seedance2.0mini');refresh();}).catch(e=>document.querySelector('#create-error').textContent=e.message);
      form.addEventListener('submit',async e=>{e.preventDefault();start.disabled=true;busy=true;try{await post(base,{requestKey,options:{requestText:document.querySelector('#request-text').value,generationSettings:{requestedModelVersion:model.value,aspectRatio:ratio.value,videoResolution:resolution.value,nativeAudioOutputRequested:audio.checked},reviewMode:document.querySelector('#auto-creative').checked?'AUTO':'MANUAL',autoSelectLowRiskClips:document.querySelector('#auto-visual-review').checked,useExistingResearch:document.querySelector('#use-research').checked,postProduction:window.pvsReadPostProduction(form.querySelector('.post-production-settings'))}});location.reload();}catch(e){document.querySelector('#create-error').textContent=e.message;start.disabled=false;busy=false;}});
    }
    for(const card of document.querySelectorAll('.run'))for(const b of card.querySelectorAll('[data-action]'))b.addEventListener('click',async()=>{const action=b.dataset.action;let endpoint=action,body={};
      if(action==='cancel'&&!confirm('停止后续本地编排？已提交的远端视频可能仍在生成，历史记录会保留。'))return;
      if(['SELECT_CREATIVE','CONFIRM_SCRIPT','CONFIRM_PLAN'].includes(action)){endpoint='review';body={action,expectedRevision:Number(card.dataset.revision),creativeId:b.dataset.creative};}
      if(action==='paid')body={scopeHash:b.dataset.scope,confirmPaidGeneration:Boolean(card.querySelector('.confirm-paid')?.checked),acceptedUnknownCostRisk:Boolean(card.querySelector('.unknown-cost')?.checked)};
      if(action==='post-production')body={expectedRevision:Number(card.dataset.revision),settings:window.pvsReadPostProduction(card.querySelector('.post-production-settings'))};
      if(action==='adopt-timeline'){
        if(!confirm('采用当前已确认的手工时间线并开始渲染？不会重新生成视频，也不会覆盖手工编辑。'))return;
        try{const response=await fetch('/api/projects/'+encodeURIComponent(project)+'/post-production');const data=await response.json();if(!response.ok||data.timeline?.status!=='CONFIRMED')throw new Error('请先到时间线页面确认当前剪辑版本');body={expectedRevision:Number(card.dataset.revision),timelineId:data.timeline.id,timelineHash:data.timeline.hash};}
        catch(error){card.querySelector('.action-error').textContent=error.message;return;}
      }
      b.disabled=true;busy=true;try{await post(base+'/'+encodeURIComponent(card.dataset.run)+'/'+endpoint,body);location.reload();}catch(e){card.querySelector('.action-error').textContent=e.message;b.disabled=false;busy=false;}});
    // Read-only status polling; it never grants consent or starts/advances work.
    const versions=new Map([...document.querySelectorAll('.run')].map(c=>[c.dataset.run,Number(c.dataset.revision)]));
    if([...document.querySelectorAll('.run')].some(c=>${JSON.stringify(runnableSmartStatuses)}.includes(c.dataset.status)))setInterval(async()=>{if(busy||document.querySelector('.post-production-settings[data-dirty="1"],.post-production-settings[data-uploading="1"]'))return;try{const r=await fetch(base);const j=await r.json();if(!r.ok)throw new Error(j.message||'状态读取失败');if(j.runs.some(run=>versions.get(run.id)!==run.revision))location.reload();}catch(e){document.querySelector('#poll-state').textContent='状态刷新失败：'+e.message;}},4000);
  })();
  </script></body></html>`;
}

export function renderBatchGenerationPanel(projectId: string): string {
  return `<section class="card" id="batch-generation" data-project="${esc(projectId)}"><h3>批量提交本轮镜头</h3><p class="muted">只提交当前计划中已有独立审批的最新待生成记录。本地顺序提交；每个镜头独立记录结果，失败镜头不会自动重提。</p><button class="primary" id="batch-submit" disabled>一键提交全部待生成镜头</button><p id="batch-status" class="muted"></p><div id="batch-results" role="status"></div></section>
  <script>(()=>{const root=document.querySelector('#batch-generation'),button=document.querySelector('#batch-submit'),status=document.querySelector('#batch-status'),results=document.querySelector('#batch-results');let selection=null;const base='/api/projects/'+encodeURIComponent(root.dataset.project)+'/generation-batch';
  fetch(base).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.message||'批量范围读取失败');selection=j.selection;button.disabled=!selection.targets.length;status.textContent='当前可提交 '+selection.targets.length+' 个镜头。';}).catch(e=>{status.textContent=e.message;});
  button.addEventListener('click',async()=>{if(!selection?.targets.length)return;button.disabled=true;status.textContent='正在依次提交已授权镜头，请勿重复点击…';try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({attemptIds:selection.targets.map(t=>t.attemptId),scopeHash:selection.scopeHash})});const j=await r.json();if(!r.ok)throw new Error(j.message||'批量提交失败');results.replaceChildren();for(const [i,item] of j.result.results.entries()){const p=document.createElement('p');p.textContent='镜头 '+(i+1)+'：'+item.message;results.append(p);}status.textContent='本轮提交已结束。刷新页面可查看生成进度；不会自动重提失败或未知记录。';const link=document.createElement('a');link.href=location.href;link.textContent='刷新生成进度';results.append(link);if(j.result.results.some(item=>item.outcome==='SUBMITTED')){status.textContent+=' 三秒后自动转入现有查询与下载流程。';setTimeout(()=>location.reload(),3000);}}catch(e){status.textContent=e.message+'；请刷新核查实际记录，不会自动重试。';}});
  })();</script>`;
}
