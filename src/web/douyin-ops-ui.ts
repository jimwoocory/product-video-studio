import type {
  DouyinOpsGlobalView,
  DouyinOpsProjectView
} from "../application/services/douyin-ops-dashboard-service.js";

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]!
  );

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${esc(title)} · Product Video Studio</title>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#f5f6f8;color:#17212b}.top{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:13px 22px;background:#171717;color:white}.top a{color:white;text-decoration:none}.top a.current{font-weight:800;text-decoration:underline}.wrap{max-width:1180px;margin:28px auto;padding:0 20px}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:14px}.card{background:white;border:1px solid #d7dde3;border-radius:12px;padding:18px;margin:14px 0}.metric{font-size:28px;font-weight:800}.muted{color:#687580}.ok{color:#216e39}.warn{color:#8a5a00}.danger{color:#a12424}.status{display:inline-block;border:1px solid #cbd2d9;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700}.status-ok{background:#edf8ef;border-color:#a9d6b1}.status-warn{background:#fff8e8;border-color:#e4c77c}.status-danger{background:#fff0f0;border-color:#e1aaaa}button,.button{font:inherit;border:1px solid #17212b;border-radius:8px;background:#17212b;color:white;padding:8px 13px;cursor:pointer;text-decoration:none;display:inline-block}button.secondary,.button.secondary{background:white;color:#17212b}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e4e8ec;vertical-align:top}th{font-size:13px;color:#56616b}.scroll{overflow:auto}.comment{padding:13px 0;border-bottom:1px solid #e4e8ec}.comment:last-child{border-bottom:0}.comment-meta{display:flex;gap:10px;flex-wrap:wrap;color:#687580;font-size:13px}.notice{padding:11px 13px;border-radius:8px;background:#fff8e8;border:1px solid #e4c77c}.error{color:#a12424;white-space:pre-wrap}.technical{font-size:12px;color:#687580}.draft-editor{width:100%;min-height:86px;margin-top:8px;padding:9px;border:1px solid #cbd2d9;border-radius:8px;font:inherit;resize:vertical}a{color:#245b91}@media(max-width:700px){.metric{font-size:23px}th,td{white-space:nowrap}}
</style></head><body><header class="top"><b>Product Video Studio</b><a href="/projects">项目</a><a href="/tasks">任务中心</a><a href="/health-center">系统诊断</a><a href="/agent">智能生成</a><a class="current" href="/douyin-ops">抖音运营</a><a href="/settings/ai">大模型设置</a></header><main class="wrap">${body}</main></body></html>`;
}

function statusChip(
  text: string,
  kind: "ok" | "warn" | "danger"
) {
  return `<span class="status status-${kind}">${esc(text)}</span>`;
}

function accountStatus(view: DouyinOpsGlobalView["account"]) {
  if (view.status === "MATCHED") {
    return statusChip("账号已匹配", "ok");
  }
  if (view.status === "MISMATCHED") {
    return statusChip("账号不一致", "danger");
  }
  return statusChip("账号待确认", "warn");
}

function runtimeStatus(view: DouyinOpsGlobalView["runtime"]) {
  return view.ready
    ? statusChip("运营连接正常", "ok")
    : statusChip("运营连接未就绪", "warn");
}

function fmt(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function time(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? esc(value)
    : esc(date.toLocaleString("zh-CN", { hour12: false }));
}

const sentimentLabel: Record<string, string> = {
  POSITIVE: "正向",
  NEUTRAL: "中性",
  NEGATIVE: "负向",
  MIXED: "复杂"
};

const categoryLabel: Record<string, string> = {
  PRODUCT_QUESTION: "产品疑问",
  PURCHASE_INTENT: "购买意向",
  USAGE_FEEDBACK: "使用反馈",
  PRAISE: "好评",
  COMPLAINT: "投诉 / 不满",
  GENERAL_INTERACTION: "普通互动",
  SPAM_OR_IRRELEVANT: "无关 / 垃圾内容"
};

const priorityLabel: Record<string, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低"
};

const replyStrategyLabel: Record<string, string> = {
  ANSWER_QUESTION: "回答问题",
  ACKNOWLEDGE_FEEDBACK: "回应反馈",
  THANK_AND_ENGAGE: "感谢互动",
  DEESCALATE: "安抚回应",
  CLARIFY_WITHOUT_CLAIMING: "保守澄清"
};

function classificationMeta(
  comment: DouyinOpsProjectView["comments"][number]
): string {
  if (!comment.sentiment && !comment.category && !comment.priority) {
    return '<div class="comment-meta"><span class="muted">尚未进行 AI 分类</span></div>';
  }
  const sentiment = sentimentLabel[comment.sentiment ?? ""] ?? comment.sentiment ?? "—";
  const category = categoryLabel[comment.category ?? ""] ?? comment.category ?? "—";
  const priority = priorityLabel[comment.priority ?? ""] ?? comment.priority ?? "—";
  return '<div class="comment-meta"><span>情绪：' + esc(sentiment) + '</span><span>类型：' + esc(category) + '</span><span>优先级：' + esc(priority) + '</span></div>';
}

function workRows(view: DouyinOpsGlobalView) {
  if (!view.works.length) {
    return `<p class="muted">${esc(
      view.worksMessage ??
        (view.worksStatus === "READY"
          ? "当前账号没有返回作品。"
          : "当前无法读取账号作品。")
    )}</p>`;
  }
  return `<div class="scroll"><table><thead><tr><th>作品</th><th>发布时间</th><th>播放</th><th>点赞</th><th>评论</th><th>分享</th></tr></thead><tbody>${view.works
    .map(
      (work) =>
        `<tr><td><b>${esc(work.description || "未命名作品")}</b><div class="technical">${esc(work.awemeId)}</div></td><td>${time(work.publishedAt)}</td><td>${fmt(work.metrics.plays)}</td><td>${fmt(work.metrics.likes)}</td><td>${fmt(work.metrics.comments)}</td><td>${fmt(work.metrics.shares)}</td></tr>`
    )
    .join("")}</tbody></table></div>`;
}

export function renderDouyinOpsGlobalPage(
  view: DouyinOpsGlobalView
): string {
  const linked = view.linkedProjects.length
    ? `<div class="scroll"><table><thead><tr><th>项目</th><th>绑定状态</th><th>抖音作品</th><th></th></tr></thead><tbody>${view.linkedProjects
        .map(
          (item) =>
            `<tr><td>${esc(item.projectName)}</td><td>${esc(item.binding.status)}</td><td>${esc(item.binding.awemeId ?? "待绑定")}</td><td><a href="/projects/${encodeURIComponent(item.projectId)}/douyin">查看发布后表现</a></td></tr>`
        )
        .join("")}</tbody></table></div>`
    : '<p class="muted">还没有项目建立抖音作品绑定。</p>';

  const body = `
<div class="head"><div><h1>抖音运营</h1><p class="muted">统一查看账号状态、作品数据和项目发布后表现。当前支持读取、同步、本地绑定、AI 评论分类和回复草稿；不会自动评论、点赞或私信。</p></div><div class="actions"><button id="launch-ops">启动 / 打开抖音运营连接</button><a class="button secondary" href="/douyin-ops">重新检查</a></div></div>
<section class="grid">
  <div class="card"><h3>运营连接</h3><p>${runtimeStatus(view.runtime)}</p><p>${esc(view.runtime.message ?? (view.runtime.ready ? "Bridge 与抖音主页面已连接。" : "Bridge 或抖音主页面当前未连接。"))}</p><div class="technical">状态：${esc(view.runtime.status)} · Contract v${esc(view.runtime.contractVersion ?? "—")}</div></div>
  <div class="card"><h3>账号关系</h3><p>${accountStatus(view.account)}</p><p><b>发布账号：</b>${esc(view.account.publish.displayName || "未登录")} ${view.account.publish.platformUserId ? "· 抖音号 " + esc(view.account.publish.platformUserId) : ""}</p><p><b>运营账号：</b>${esc(view.account.ops.nickname || "未登录")} ${view.account.ops.uniqueId ? "· 抖音号 " + esc(view.account.ops.uniqueId) : ""}</p><p class="muted">${esc(view.account.message)}</p></div>
</section>
<section class="card"><h2>我的抖音作品</h2>${workRows(view)}</section>
<section class="card"><h2>已关联到 PVS 的项目</h2>${linked}</section>
<div id="launch-message" class="error"></div>
<script>
(()=>{const b=document.querySelector('#launch-ops'),m=document.querySelector('#launch-message');b?.addEventListener('click',async()=>{b.disabled=true;m.textContent='正在启动专用抖音浏览器与 Bridge…';try{const r=await fetch('/api/douyin/ops/launch',{method:'POST'});const data=await r.json();if(!r.ok)throw new Error(data.message||'启动失败');m.textContent=data.message||'已启动，请在专用浏览器完成登录。';setTimeout(()=>location.reload(),1800);}catch(err){m.textContent=err.message;b.disabled=false;}});})();
</script>`;
  return layout("抖音运营", body);
}

function bindingBlock(view: DouyinOpsProjectView) {
  const binding = view.binding;
  if (binding?.status === "BOUND" && binding.awemeId) {
    return `<p>${statusChip("已绑定抖音作品", "ok")}</p><p><b>作品：</b>${esc(binding.awemeId)}</p><p class="muted">来源：${esc(binding.source ?? "—")} · 可信度：${esc(binding.confidence)}</p>`;
  }
  const candidates =
    view.candidatesStatus === "READY" && view.candidates.length
      ? `<div class="candidate-list"><p><b>请选择本次发布对应的作品：</b></p>${view.candidates
          .slice(0, 12)
          .map(
            (work) =>
              `<div class="comment"><div><b>${esc(work.description || "未命名作品")}</b></div><div class="comment-meta"><span>${time(work.publishedAt)}</span><span>播放 ${fmt(work.metrics.plays)}</span><span>点赞 ${fmt(work.metrics.likes)}</span></div><div class="actions"><button class="bind-work" data-aweme="${esc(work.awemeId)}" data-url="${esc(work.externalUrl)}">确认绑定这条作品</button></div></div>`
          )
          .join("")}</div>`
      : `<p class="muted">${esc(view.candidatesMessage ?? "当前没有可用于人工绑定的作品候选。")}</p>`;
  return `<p>${statusChip(
    binding?.status === "BLOCKED_ACCOUNT_MISMATCH"
      ? "账号不一致，禁止自动绑定"
      : "作品待绑定",
    binding?.status === "BLOCKED_ACCOUNT_MISMATCH"
      ? "danger"
      : "warn"
  )}</p><p class="muted">${esc(
    binding?.status === "BLOCKED_ACCOUNT_MISMATCH"
      ? "发布账号与运营账号不一致。若你确认某条作品属于本项目，可以人工选择；系统不会静默猜测。"
      : "发布回执暂未提供可信作品 ID。登录正确的运营账号后可人工选择作品。"
  )}</p>${candidates}`;
}

function metricBlock(view: DouyinOpsProjectView) {
  const latest = view.snapshots.at(-1);
  if (!latest) {
    return '<p class="muted">还没有保存指标快照。作品绑定后点击“刷新数据”即可创建第一条历史快照。</p>';
  }
  return `<div class="grid"><div><div class="muted">播放</div><div class="metric">${fmt(latest.plays)}</div></div><div><div class="muted">点赞</div><div class="metric">${fmt(latest.likes)}</div></div><div><div class="muted">评论</div><div class="metric">${fmt(latest.comments)}</div></div><div><div class="muted">分享</div><div class="metric">${fmt(latest.shares)}</div></div></div><p class="muted">上次同步：${time(latest.capturedAt)}</p>`;
}

function historyBlock(view: DouyinOpsProjectView) {
  if (!view.snapshots.length) return "";
  return `<div class="scroll"><table><thead><tr><th>时间</th><th>播放</th><th>点赞</th><th>评论</th><th>分享</th></tr></thead><tbody>${view.snapshots
    .map(
      (item) =>
        `<tr><td>${time(item.capturedAt)}</td><td>${fmt(item.plays)}</td><td>${fmt(item.likes)}</td><td>${fmt(item.comments)}</td><td>${fmt(item.shares)}</td></tr>`
    )
    .join("")}</tbody></table></div>`;
}

function insightItems(title: string, items: DouyinOpsProjectView["latestInsight"] extends infer T ? any[] : never): string {
  if (!items?.length) return "";
  return `<h4>${esc(title)}</h4><ul>${items.map((item) => `<li>${esc(item.text)}<div class="technical">证据：${esc(item.evidenceRefs.join(" / "))}</div></li>`).join("")}</ul>`;
}

function retrospectiveBlock(view: DouyinOpsProjectView): string {
  const insight = view.latestInsight;
  if (!insight) {
    return '<p class="muted">还没有发布后 AI 复盘。至少保存一条作品指标快照后即可生成。</p>';
  }
  return `<div class="notice"><p><b>复盘摘要</b></p><p>${esc(insight.summary)}</p><div class="comment-meta"><span>生成时间：${time(insight.createdAt)}</span><span>指标证据 ${insight.metricSnapshotIds.length} 条</span><span>评论证据 ${insight.commentIds.length} 条</span></div></div>${insightItems("已验证优势", insight.strengths)}${insightItems("需要改进", insight.weaknesses)}${insightItems("用户真实关注", insight.audienceQuestions)}${insightItems("下一条创意建议", insight.nextCreativeActions)}`;
}

function commentsBlock(view: DouyinOpsProjectView) {
  if (!view.comments.length) {
    return '<p class="muted">还没有保存评论。作品绑定后点击“同步评论”。</p>';
  }
  const draftByComment = new Map(
    view.replyDrafts.map((draft) => [draft.commentId, draft])
  );
  return view.comments
    .map((comment) => {
      const draft = draftByComment.get(comment.id);
      const editable = draft?.status === "DRAFT";
      const draftHtml = draft
        ? `<div class="notice"><b>AI 回复草稿（仅本地，未发布）</b>${editable ? `<textarea class="draft-editor" maxlength="280" data-draft-text="${esc(draft.id)}">${esc(draft.currentText)}</textarea>` : `<p>${esc(draft.currentText)}</p>`}<div class="comment-meta"><span>状态：${esc(draft.status === "REJECTED" ? "已拒绝" : "草稿")}</span><span>revision ${esc(draft.revision)}</span><span>策略：${esc(replyStrategyLabel[draft.strategy] ?? draft.strategy)}</span><span>更新时间：${time(draft.updatedAt)}</span></div>${editable ? `<div class="actions"><button class="secondary save-reply-draft" data-draft-id="${esc(draft.id)}" data-revision="${esc(draft.revision)}">保存草稿</button><button class="secondary reject-reply-draft" data-draft-id="${esc(draft.id)}" data-revision="${esc(draft.revision)}">拒绝草稿</button></div>` : ""}</div>`
        : '<div class="comment-meta"><span class="muted">尚未生成回复草稿</span></div>';
      const draftButton = draft ? "重新生成AI回复草稿" : "生成AI回复草稿";
      return `<article class="comment"><div><b>${esc(comment.nickname || "抖音用户")}</b></div><div>${esc(comment.text)}</div><div class="comment-meta"><span>${time(comment.platformCreatedAt)}</span><span>点赞 ${fmt(comment.diggCount)}</span><span>回复 ${fmt(comment.replyCount)}</span></div>${classificationMeta(comment)}${draftHtml}<div class="actions"><button class="secondary generate-reply-draft" data-cid="${esc(comment.cid)}">${draftButton}</button>${comment.replyCount > 0 ? `<button class="secondary sync-replies" data-cid="${esc(comment.cid)}">同步这条评论的回复</button>` : ""}</div></article>`;
    })
    .join("");
}

export function renderDouyinOpsProjectPage(
  view: DouyinOpsProjectView
): string {
  const id = encodeURIComponent(view.project.id);
  const runtimeNote = view.runtime.ready
    ? "运营连接正常，可以刷新平台数据。"
    : "运营连接当前不可用；下方已保存的历史指标和评论仍可查看。";
  const body = `
<nav><a href="/projects/${id}/final">返回成片 / 发布</a> · <a href="/douyin-ops">抖音运营首页</a> · <a href="/projects">项目列表</a></nav>
<div class="head"><div><h1>发布后表现</h1><p>${esc(view.project.name)}</p><p class="muted">${esc(runtimeNote)}</p></div><div>${runtimeStatus(view.runtime)} ${accountStatus(view.account)}</div></div>
<section class="card"><h2>抖音作品绑定</h2>${bindingBlock(view)}<div id="bind-message" class="error"></div></section>
<section class="card"><div class="head"><div><h2>作品表现</h2><p class="muted">每次刷新都会保存在 PVS 自己的历史快照中。</p></div><div class="actions"><button id="refresh-metrics" ${view.binding?.status === "BOUND" ? "" : "disabled"}>刷新数据</button></div></div>${metricBlock(view)}${historyBlock(view)}<div id="metric-message" class="error"></div></section>
<section class="card"><div class="head"><div><h2>发布后 AI 复盘</h2><p class="muted">只使用 PVS 已保存的指标快照、评论和已确认产品事实，不会编造平台指标。</p></div><div class="actions"><button id="generate-retrospective" ${view.snapshots.length ? "" : "disabled"}>AI复盘</button></div></div>${retrospectiveBlock(view)}<div id="retrospective-message" class="error"></div></section>
<section class="card"><div class="head"><div><h2>评论中心</h2><p class="muted">评论同步仍然是只读；AI 分类和回复草稿只保存在 PVS 本地，本阶段不会发送回复。</p></div><div class="actions"><button id="sync-comments" ${view.binding?.status === "BOUND" ? "" : "disabled"}>同步评论</button><button class="secondary" id="classify-comments" ${view.comments.length ? "" : "disabled"}>AI分类评论</button></div></div><div id="comments-list">${commentsBlock(view)}</div><div id="comment-message" class="error"></div></section>
<script>
(()=>{const projectId=${JSON.stringify(view.project.id)};
const call=async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});let data={};try{data=await r.json();}catch{}if(!r.ok)throw new Error(data.message||'操作失败');return data;};
document.querySelector('#refresh-metrics')?.addEventListener('click',async(e)=>{const b=e.currentTarget,m=document.querySelector('#metric-message');b.disabled=true;m.textContent='正在读取抖音作品数据…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/metrics/refresh');location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}});
document.querySelector('#generate-retrospective')?.addEventListener('click',async(e)=>{const b=e.currentTarget,m=document.querySelector('#retrospective-message');b.disabled=true;m.textContent='正在基于已保存指标和评论生成 AI 复盘…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/retrospective/generate',{});location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}});
document.querySelector('#sync-comments')?.addEventListener('click',async(e)=>{const b=e.currentTarget,m=document.querySelector('#comment-message');b.disabled=true;m.textContent='正在同步评论…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/comments/sync');location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}});
document.querySelector('#classify-comments')?.addEventListener('click',async(e)=>{const b=e.currentTarget,m=document.querySelector('#comment-message');b.disabled=true;m.textContent='正在用当前项目的大模型设置分析评论…';try{const data=await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/comments/classify',{});const result=data.result||{};m.textContent='AI 分类完成：本次分类 '+(result.classifiedCount||0)+' 条，跳过 '+(result.skippedCount||0)+' 条。';setTimeout(()=>location.reload(),900);}catch(err){m.textContent=err.message;b.disabled=false;}});
document.querySelectorAll('.generate-reply-draft').forEach(b=>b.addEventListener('click',async()=>{const m=document.querySelector('#comment-message');b.disabled=true;m.textContent='正在生成 AI 回复草稿（只保存到 PVS，不会发布）…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/comments/'+encodeURIComponent(b.dataset.cid)+'/reply-draft',{});location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}}));
document.querySelectorAll('.save-reply-draft').forEach(b=>b.addEventListener('click',async()=>{const m=document.querySelector('#comment-message'),id=b.dataset.draftId,revision=Number(b.dataset.revision),editor=document.querySelector('[data-draft-text=\"'+CSS.escape(id)+'\"]');b.disabled=true;m.textContent='正在保存本地草稿…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/reply-drafts/'+encodeURIComponent(id)+'/save',{expectedRevision:revision,currentText:editor?.value||''});location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}}));
document.querySelectorAll('.reject-reply-draft').forEach(b=>b.addEventListener('click',async()=>{const m=document.querySelector('#comment-message'),id=b.dataset.draftId,revision=Number(b.dataset.revision);if(!confirm('确认拒绝这条本地回复草稿？不会对抖音执行任何操作。'))return;b.disabled=true;m.textContent='正在拒绝本地草稿…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/reply-drafts/'+encodeURIComponent(id)+'/reject',{expectedRevision:revision});location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}}));
document.querySelectorAll('.sync-replies').forEach(b=>b.addEventListener('click',async()=>{const m=document.querySelector('#comment-message');b.disabled=true;m.textContent='正在同步回复…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/comments/'+encodeURIComponent(b.dataset.cid)+'/replies/sync');location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}}));
document.querySelectorAll('.bind-work').forEach(b=>b.addEventListener('click',async()=>{const m=document.querySelector('#bind-message');if(!confirm('确认把这条抖音作品绑定到当前 PVS 项目？'))return;b.disabled=true;m.textContent='正在保存作品绑定…';try{await call('/api/projects/'+encodeURIComponent(projectId)+'/douyin/binding/confirm',{awemeId:b.dataset.aweme,externalUrl:b.dataset.url,confirmed:true});location.reload();}catch(err){m.textContent=err.message;b.disabled=false;}}));})();
</script>`;
  return layout("发布后表现", body);
}
