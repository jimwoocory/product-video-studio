"use strict";
// UX-R0: pure browser-memory prototype. No API, no localStorage, no production data writes.
const $ = (id) => document.getElementById(id);
const stageNames = ["产品与事实", "研究与创意", "制作准备", "视频与审片", "剪辑与成片", "发布与运营"];
const productIllustration = $("productImagePreview").innerHTML;
const initialProduct = {
  name:"Tonemay Q8 Pro", brand:"Tonemay",
  desc:"开放式耳夹蓝牙耳机，不入耳设计；适合日常音乐、通话及通勤等使用场景。本段为用户待核实的示例产品资料。"
};
const initialReviewPrompt = "固定人物外形，佩戴耳夹式耳机，单镜头平稳推进，自然场景声音，不生成背景音乐。";
let state = {
  scenario:"create", createStage:"form", creative:"story", productPhotoUrl:null,
  reviewClip:2, reviewAccepted:new Set([1]), reviewRedoCount:0, reviewPrompt:initialReviewPrompt, reviewDoneEdit:false,
  assetMode:"failed", assetStage:"issue", assetQueried:false, assetPrompt:"固定人物 B，商场场景，保持服装、发型和人物面部特征一致；摄影棚级真实材质。",
  latest:{
    create:"等待你完成第一步。",
    review:"正在等待你审核镜头 2。",
    asset:"检测到人物 B 生成失败，仅需处理此项。"
  }
};
let dialogMode = "";
let videoTimer = null, videoSecs = 0, toastTimer = null;

function setText(id, value){const el=$(id);if(el)el.textContent=value;}
function setVisible(id, yes){const el=$(id);if(el)el.hidden=!yes;}
function setStatus(text,kind){
  const el=$("statusChip");el.textContent=text;el.className="status-chip"+(kind?" "+kind:"");
}
function track(action){
  state.latest[state.scenario]=action;
  setText("lastAction",action);
}
function toast(message){
  const el=$("toast");el.textContent=message;el.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4000);
}
function stopVideo(){
  if(videoTimer){clearInterval(videoTimer);videoTimer=null;}
  videoSecs=0;
  const fill=$("previewFill"),btn=$("previewPlay");
  if(fill)fill.style.width="0%";
  if(btn)btn.textContent="▶";
  setText("previewTime","00:00 / 00:10");
}
function stageContext(){
  if(state.scenario==="create"){
    if(state.createStage==="form")return {idx:0,heading:"填写产品资料",description:"填写一次产品资料，确认后系统会把信息带入后续创意与制作。",action:"保存产品资料",next:"确认产品事实",status:"等待你操作",contextTitle:"开始创作前",contextDescription:"请先确认产品资料。系统后续读取同一个项目的数据。",saved:"0 项"};
    if(state.createStage==="truth")return {idx:0,heading:"确认产品事实",description:"核对可用卖点，避免把未经证实的信息直接写进视频。",action:"核对可用产品信息",next:"选择创意方案",status:"等待你确认",contextTitle:"产品资料已保存",contextDescription:"系统已锁定本轮产品资料快照，只有人工认可的信息才能作为宣传事实。",saved:"产品资料 1 项"};
    if(state.createStage==="creative")return {idx:1,heading:"选择视频创意",description:"只决定本轮视频方向，随后自动进入脚本和分镜规划。",action:"从两个示例创意中选择 1 项",next:"自动准备脚本和分镜",status:"等待你选择",contextTitle:"产品事实已确认",contextDescription:"产品资料与真实卖点已关联本轮任务；创意确定后不再重复导入。",saved:"产品资料 + 产品事实"};
    return {idx:2,heading:"创意已确认，进入制作准备",description:"本原型在此停下，展示正常继续执行的方向，不提交任何模型请求。",action:"观看后续流程说明",next:"资产 / 脚本 / 导演分镜",status:"模拟完成",type:"good",contextTitle:"已完成创意选择",contextDescription:"制作目的、已确认的产品事实和创意绑定到同一任务。",saved:"事实 + 创意 2 项"};
  }
  if(state.scenario==="review"){
    if(state.reviewAccepted.has(2)&&state.reviewAccepted.has(3)){
      return {idx:4,heading:"本轮审片已经完成",description:"所有镜头已采用，下一步为剪辑和声音检查。",action:"查看模拟剪辑方案",next:"自动剪辑和成片确认",status:"已完成审片",type:"good",contextTitle:"本轮镜头已全部采用",contextDescription:"在原任务中完成审核；原始生成记录与历史镜头仍保留。",saved:"3 个已采用镜头"};
    }
    return {idx:3,heading:"审片：确认镜头 "+state.reviewClip,description:"直接在当前任务处理一个待审镜头，不再进入另一套完整的视频页面。",action:"采用或局部重做镜头 "+state.reviewClip,next:"镜头 "+(state.reviewClip===2?"3":"全部审片完成"),status:"等待人工审片",type:"warning",contextTitle:"30 秒视频 · 审片中",contextDescription:"镜头 1 已采用，其余镜头按顺序确认；当前任务未结束。",saved:state.reviewAccepted.size+" 个已采用镜头"};
  }
  if(state.assetStage==="done"){
    return {idx:3,heading:"固定素材已全部确认",description:"本次阻塞解除，后续脚本和分镜可以使用这几项素材。",action:"继续当前制作任务",next:"导演分镜和视频生成",status:"阻塞已解除",type:"good",contextTitle:"角色与场景全部已确认",contextDescription:"所有原素材和已确认候选都保留，未重新生成无关图片。",saved:"4 项素材已确认"};
  }
  if(state.assetStage==="ready"){
    return {idx:2,heading:"审核人物 B 的新候选",description:"这里只展示一个模拟图片候选；正式系统需要看到真实文件才能批准。",action:"确认人物 B 候选图",next:"继续原制作任务",status:"等待看图确认",contextTitle:"只恢复人物 B",contextDescription:"仅受人物 B 影响的部分重新检查。其余三项原素材不动。",saved:"3 项已确认 + 1 项待确认"};
  }
  return {idx:2,heading:"修复失败的制作素材",description:"只恢复当前失败的素材，不让其他已成功素材重新制作。",action:state.assetMode==="failed"?"局部修复人物 B":"核对原提交结果",next:"看图确认人物 B",status:state.assetMode==="failed"?"1 项生成失败":"提交结果未知",type:"warning",contextTitle:"人物 B 的恢复任务",contextDescription:state.assetMode==="failed"?"人物 B 生成失败；人物 A 和场景等不受影响。":"远端结果未知，必须先核查，不能直接重新付费提交。",saved:"3 项已确认素材"};
}
function renderSteps(ctx){
  const ol=$("stepList");ol.replaceChildren();
  stageNames.forEach((step,i)=>{
    const li=document.createElement("li");li.className="stage-item "+(i===ctx.idx?"active":i<ctx.idx?"done":"later");
    const num=document.createElement("span");num.className="stage-index";num.textContent=i<ctx.idx?"✓":String(i+1);
    const label=document.createElement("span");label.className="step-name";label.textContent=step;
    const phase=document.createElement("span");phase.className="step-indicator";phase.textContent=i<ctx.idx?"完成":i===ctx.idx?"当前":"";
    li.append(num,label,phase);if(i===ctx.idx)li.setAttribute("aria-current","step");ol.append(li);
  });
  setText("stepFraction",String(ctx.idx+1)+" / 6");
  $("progressBar").style.width=((ctx.idx+1)/6*100).toFixed(2)+"%";
}
function renderHeader(ctx){
  const scene=state.scenario;
  setText("sideProjectName",scene==="create"?"Tonemay Q8 Pro 宣传片":scene==="review"?"Tonemay 耳机宣传 1":"Tonemay 多镜头短片");
  setText("sideProjectMeta",scene==="create"?"目标 40 秒 · 新任务":scene==="review"?"目标 30 秒 · 审片中":"目标 30 秒 · 资产准备");
  setText("crumbScenario",scene==="create"?"新建视频":scene==="review"?"镜头审片":"失败资产恢复");
  setText("taskIdText",scene==="create"?"演示任务 · 001":scene==="review"?"演示任务 · 002":"演示任务 · 003");
  setText("currentHeading",ctx.heading);setText("currentDescription",ctx.description);setText("currentActionLabel",ctx.action);
  setStatus(ctx.status,ctx.type);
  setText("contextTitle",ctx.contextTitle);setText("contextDescription",ctx.contextDescription);
  setText("contextTask",scene==="create"?"制作产品宣传视频":scene==="review"?"30 秒完整视频":"固定角色素材准备");
  setText("contextSaved",ctx.saved);setText("contextNext",ctx.next);setText("lastAction",state.latest[scene]);
  setText("stageNote",scene==="create"?"先完成事实核对，研究与参考可按需插入。":scene==="review"?"当前只需审查 1 个镜头；其他设置不会挤占主要操作。":"已成功的素材保持原样，局部故障只影响自身依赖链。");
  document.querySelectorAll("[data-scenario]").forEach((el)=>{
    const isSelected=el.dataset.scenario===scene;
    el.classList.toggle("selected",isSelected);el.setAttribute("aria-pressed",String(isSelected));
  });
  ["create","review","asset"].forEach((s)=>setVisible("scenario"+s[0].toUpperCase()+s.slice(1),s===scene));
  renderSteps(ctx);
}
function renderCreate(){
  const now=state.createStage;
  setVisible("createStepForm",now==="form");
  setVisible("createStepTruth",now==="truth");
  setVisible("createStepCreative",now==="creative");
  setVisible("createStepDone",now==="done");
  if(now==="truth"){setText("factProductName",$("productName").value.trim()||initialProduct.name);}
  if(now==="done"){
    const selected=state.creative==="story"?"日常情节":"轻量产品展示";
    setText("createResultMessage","已采用「"+selected+"」（模拟），产品事实与参考选择绑定在当前任务。后续制作需保持原始产品图不被 AI 重绘。");
  }
}
function renderReview(){
  const complete=state.reviewAccepted.has(2)&&state.reviewAccepted.has(3);
  setVisible("reviewActive",!complete);setVisible("reviewDone",complete);
  if(complete){setVisible("editPlanResult",state.reviewDoneEdit);stopVideo();return;}
  const clip=state.reviewClip;
  setText("reviewTitle","确认镜头 "+clip+" / 3");
  setText("videoSceneText","模拟视频画面 · 镜头 "+clip);
  setText("reviewActionTitle","你是否采用镜头 "+clip+"？");
  setText("reviewSummary",clip===2?"人物耳夹佩戴方式特写":"两人离开商场的收束镜头");
  setText("reviewDescription",clip===2?(state.reviewRedoCount?"镜头 2 的模拟重做候选已就绪，仍需要你亲自确认画面。":"画面演示产品佩戴，但细节辨识度不足，需要你确认产品是否与真实图片一致。"):"剧情收束，人物外观和佩戴状态需要你确认；这是示意画面，不代表真实视频。");
  const bar=$("clipLine");bar.replaceChildren();
  for(let i=1;i<=3;i++){
    const el=document.createElement("div");const accepted=state.reviewAccepted.has(i);
    el.className="clip-pill "+(accepted?"done":i===clip?"active":"");
    const title=document.createElement("b");title.textContent="镜头 "+i;
    const status=document.createElement("span");status.textContent=accepted?"已采用":i===clip?"等待你确认":"下一镜头";
    el.append(title,status);bar.append(el);
  }
}
function renderAsset(){
  const issue=state.assetStage==="issue", ready=state.assetStage==="ready", done=state.assetStage==="done";
  setVisible("assetIssuePanel",issue);setVisible("assetReadyPanel",ready);setVisible("assetSuccessPanel",done);
  const status=$("assetBStatus");status.textContent=done?"✓ 已确认":ready?"待看图":state.assetMode==="failed"?"生成失败":"提交结果未知";
  status.className="asset-status "+(done?"ok":"trouble");
  $("assetTileB").classList.toggle("highlighted",!done);
  if(issue){
    setText("issueTitle",state.assetMode==="failed"?"固定人物 B · 生成失败":"固定人物 B · 远端提交结果未知");
    setText("issueStatus",state.assetMode==="failed"?"可局部修复":"禁止重复提交");
    setText("assetIssueMessage",state.assetMode==="failed"?"示例原因：远端已确认失败。你可以查看原提示词，仅重新准备人物 B。":state.assetQueried?"演示核查结果：原提交状态仍未知。已保存原编号，必须等待或人工排查，不能再次付费生成。":"模拟情形：提交请求已发送，但未确认远端是否接受。先核对原提交编号，不要直接重试。");
    setText("assetRepair",state.assetMode==="failed"?"查看提示词并修复人物 B →":state.assetQueried?"继续查看原任务记录":"核对原提交结果（演示）");
    setText("toggleRemote",state.assetMode==="failed"?"切换演示：结果未知":"切换演示：已明确失败");
    setText("issueSupport",state.assetMode==="failed"?"不会重做人物 A、产品主参考或商场场景；新增费用仍须确认。":"原始素材和已提交记录均保留；任何结果不明的提交都不会自动再次发起。");
  }
}
function render(){
  const ctx=stageContext();renderHeader(ctx);
  renderCreate();renderReview();renderAsset();
}
function switchScenario(name){
  if(!["create","review","asset"].includes(name))return;
  stopVideo();state.scenario=name;render();window.scrollTo({top:0,behavior:"smooth"});
}
function resetScene(){
  stopVideo();
  if(state.scenario==="create"){
    state.createStage="form";state.creative="story";$("productName").value=initialProduct.name;$("productBrand").value=initialProduct.brand;$("productDesc").value=initialProduct.desc;
    $("truthAccepted").checked=false;$("confirmTruth").disabled=true;
    $("useResearch").checked=false;$("useReference").checked=false;setText("refPreviewText","尚未选用任何参考。产品事实仍需人工核对。");
    if(state.productPhotoUrl)URL.revokeObjectURL(state.productPhotoUrl);
    state.productPhotoUrl=null;$("productImagePreview").innerHTML=productIllustration;$("productPhoto").value="";
    document.querySelector('input[name="creativeDirection"][value="story"]').checked=true;
    state.latest.create="已重置新建项目演示。";
  } else if(state.scenario==="review"){
    state.reviewClip=2;state.reviewAccepted=new Set([1]);state.reviewRedoCount=0;state.reviewPrompt=initialReviewPrompt;state.reviewDoneEdit=false;$("inlineClipPrompt").value=initialReviewPrompt;state.latest.review="已重置审片演示；镜头 1 已采用，等待镜头 2。";
  } else {
    state.assetMode="failed";state.assetStage="issue";state.assetQueried=false;state.latest.asset="已重置资产恢复演示，人物 B 生成失败。";
  }
  render();toast("当前场景已重置；没有修改任何实际项目。");
}
function acceptClip(){
  state.reviewAccepted.add(state.reviewClip);stopVideo();
  if(state.reviewClip===2){state.reviewClip=3;track("镜头 2 已模拟采用，自动定位到镜头 3。");}
  else track("镜头 3 已模拟采用，审片完成，下一步准备自动剪辑。");
  render();
}
function openDialog(mode){
  dialogMode=mode;
  const content=$("dialogBody"), title=$("dialogTitle"), main=$("dialogPrimary");
  content.replaceChildren();main.disabled=false;
  if(mode==="guide"){
    title.textContent="如何体验这三种场景";
    content.innerHTML='<p>先从顶部切换场景，再跟随当前页面<strong>唯一主动作</strong>操作。你会看到任务阶段、右侧上下文和进度同时更新。</p><div class="impact-box"><strong>重要边界</strong><p>本页仅模拟产品工作流。所有按钮都不与正式 PVS、即梦或抖音发生交互；页面刷新后会回到演示初始状态。</p></div><p>三种场景分别演示：从产品资料到创意确认、从镜头 2 审到镜头 3、只修复失败人物素材并保持其他结果。</p>';
    main.textContent="知道了";$("dialogCancel").hidden=true;
  } else if(mode==="reviewPrompt"){
    title.textContent="仅重做当前镜头";
    content.innerHTML='<p>重做范围仅限当前镜头。旧候选和其他已采用的镜头会被保留。</p><label class="field">本镜头生成提示词<textarea id="dialogPrompt" rows="5"></textarea></label><div class="impact-box"><strong>影响说明</strong><p>仅当前镜头新候选、当前镜头的预检和新一轮费用授权需要更新；不会影响镜头 1 和其他已确认内容。</p></div>';
    $("dialogPrompt").value=state.reviewPrompt;
    main.textContent="保存修改，查看新费用";$("dialogCancel").hidden=false;
  } else if(mode==="reviewConsent"){
    title.textContent="确认本次镜头重做范围";
    content.innerHTML='<p>演示中不会发送任何视频生成请求。正式系统必须重新确认镜头范围和积分成本。</p><div class="impact-box"><strong>本次授权范围（演示）</strong><p>镜头 '+state.reviewClip+' · 10 秒；原镜头保留，其他镜头不受影响。实际积分以平台返回为准，当前仅以“成本未知”说明风险。</p></div><label class="consent-line"><input id="dialogConsent" type="checkbox"> 我已了解本次重做属于新的付费操作（此处仅模拟，不会扣费）</label>';
    main.textContent="模拟确认并进入新候选";main.disabled=true;$("dialogCancel").hidden=false;
  } else if(mode==="assetPrompt"){
    title.textContent="仅修复固定人物 B";
    content.innerHTML='<p>人物 A、产品参考和商场场景均保留，不重复生成。</p><label class="field">人物 B 的生成提示词<textarea id="dialogPrompt" rows="5"></textarea></label><div class="impact-box"><strong>依赖范围</strong><p>仅人物 B 的新候选及依赖人物 B 的后续分镜检查可能需要更新。</p></div>';
    $("dialogPrompt").value=state.assetPrompt;
    main.textContent="保存提示词，检查费用";$("dialogCancel").hidden=false;
  } else if(mode==="assetConsent"){
    title.textContent="确认人物 B 的新增费用";
    content.innerHTML='<p>只处理人物 B，且必须在远端明确失败的情况下才能发起新生成。此处仅模拟。</p><div class="impact-box"><strong>演示费用提示</strong><p>本次仅人物 B 一项；平台实际积分尚未获得，不能把成本未知视为免费。</p></div><label class="consent-line"><input id="dialogConsent" type="checkbox"> 我理解新增资产需单独授权（此原型不会真实提交）</label>';
    main.textContent="模拟生成候选（不扣费）";main.disabled=true;$("dialogCancel").hidden=false;
  }
  const checkbox=$("dialogConsent");if(checkbox)checkbox.addEventListener("change",()=>main.disabled=!checkbox.checked);
  $("actionDialog").showModal();
}
function closeDialog(){if($("actionDialog").open)$("actionDialog").close();dialogMode="";}
function dialogPrimary(){
  if(dialogMode==="guide"){closeDialog();return;}
  if(dialogMode==="reviewPrompt"||dialogMode==="assetPrompt"){
    const p=$("dialogPrompt").value.trim();
    if(!p){toast("提示词不能为空。");return;}
    if(dialogMode==="reviewPrompt"){state.reviewPrompt=p;$("inlineClipPrompt").value=p;closeDialog();openDialog("reviewConsent");}
    else {state.assetPrompt=p;closeDialog();openDialog("assetConsent");}
    return;
  }
  if(dialogMode==="reviewConsent"){
    if(!$("dialogConsent").checked)return;
    state.reviewRedoCount++;track("已模拟完成镜头 "+state.reviewClip+" 的局部重做：新候选等待再次审片，原镜头和其他镜头已保留。");
    closeDialog();render();toast("模拟新候选已就绪，请继续审片；未产生模型请求。");return;
  }
  if(dialogMode==="assetConsent"){
    if(!$("dialogConsent").checked)return;
    state.assetStage="ready";track("已模拟新建人物 B 候选，等待看图确认；其他三项素材没有变化。");
    closeDialog();render();toast("仅创建演示候选，没有调用即梦或扣费。");
  }
}
function uploadImage(){
  const file=$("productPhoto").files[0];if(!file)return;
  if(!file.type.startsWith("image/")){toast("请选择图片文件。");return;}
  if(state.productPhotoUrl)URL.revokeObjectURL(state.productPhotoUrl);
  state.productPhotoUrl=URL.createObjectURL(file);
  const target=$("productImagePreview");target.replaceChildren();
  const img=document.createElement("img");img.src=state.productPhotoUrl;img.alt="仅本地预览："+file.name;
  const label=document.createElement("small");label.textContent="本地图片预览 · 未上传到服务器";
  target.append(img,label);track("已在本机预览图片「"+file.name+"」，没有上传网络。");render();
}
function saveProduct(){
  const name=$("productName").value.trim(),desc=$("productDesc").value.trim();
  if(!name||!desc){toast("请先填写产品名称和功能介绍。");return;}
  state.createStage="truth";track("已模拟保存产品资料，进入事实核对（示例）。");render();
}
function confirmTruth(){
  if(!$("truthAccepted").checked)return;
  state.createStage="creative";track("已确认本轮演示事实，未经证实的功效被排除。");render();
}
function selectCreative(){
  state.creative=document.querySelector('input[name="creativeDirection"]:checked')?.value||"story";
  state.createStage="done";track("已选择创意；产品资料和参考将自动关联当前制作任务。");render();
}
function assetAction(){
  if(state.assetMode==="unknown"){
    state.assetQueried=true;track("已演示查询原远端任务状态：仍未知，未重复提交。");render();toast("原结果仍未知，禁止再次生成。");return;
  }
  openDialog("assetPrompt");
}
function assetToggle(){
  state.assetMode=state.assetMode==="failed"?"unknown":"failed";state.assetQueried=false;
  track(state.assetMode==="failed"?"已切换到：远端明确失败，可局部重做。":"已切换到：远端结果未知，禁止重复提交。");render();
}
function assetApprove(){
  state.assetStage="done";track("人物 B 候选已模拟确认；原任务恢复至制作准备下一节点。");render();
}
function startPlayback(){
  if(videoTimer){clearInterval(videoTimer);videoTimer=null;$("previewPlay").textContent="▶";return;}
  $("previewPlay").textContent="Ⅱ";
  videoTimer=setInterval(()=>{
    videoSecs++;$("previewFill").style.width=Math.min(100,videoSecs*10)+"%";
    setText("previewTime","00:"+String(videoSecs).padStart(2,"0")+" / 00:10");
    if(videoSecs>=10){clearInterval(videoTimer);videoTimer=null;$("previewPlay").textContent="▶";videoSecs=0;}
  },350);
}
document.querySelectorAll("[data-scenario]").forEach((button)=>button.addEventListener("click",()=>switchScenario(button.dataset.scenario)));
document.querySelectorAll("[data-switch-to]").forEach((button)=>button.addEventListener("click",()=>switchScenario(button.dataset.switchTo)));
$("resetDemo").addEventListener("click",resetScene);
$("showGuide").addEventListener("click",()=>openDialog("guide"));
$("openDetails").addEventListener("click",()=>{
  const next=$("contextExtra").hidden;$("contextExtra").hidden=!next;
  setText("openDetails",next?"收起演示规则 ↑":"查看本次演示规则 ↓");
});
$("saveProduct").addEventListener("click",saveProduct);
$("productPhoto").addEventListener("change",uploadImage);
$("truthAccepted").addEventListener("change",()=>{$("confirmTruth").disabled=!$("truthAccepted").checked;});
$("confirmTruth").addEventListener("click",confirmTruth);
$("backToProduct").addEventListener("click",()=>{state.createStage="form";track("已返回已填写的产品资料，内容仍保留。");render();});
$("selectCreative").addEventListener("click",selectCreative);
$("useResearch").addEventListener("change",()=>{
  setText("refPreviewText",$("useResearch").checked||$("useReference").checked?"已记录待采用的研究/参考意向（模拟）；仍需用户明确确认相关素材的使用权。":"尚未选用任何参考。产品事实仍需人工核对。");
});
$("useReference").addEventListener("change",()=>{
  setText("refPreviewText",$("useResearch").checked||$("useReference").checked?"已记录待采用的研究/参考意向（模拟）；仍需用户明确确认相关素材的使用权。":"尚未选用任何参考。产品事实仍需人工核对。");
});
$("reviewAccept").addEventListener("click",acceptClip);
$("reviewRedo").addEventListener("click",()=>{state.reviewPrompt=$("inlineClipPrompt").value.trim()||state.reviewPrompt;openDialog("reviewPrompt");});
$("previewPlay").addEventListener("click",startPlayback);
$("showEditPlan").addEventListener("click",()=>{state.reviewDoneEdit=true;setVisible("editPlanResult",true);track("模拟剪辑方案已打开；最终成片仍需要独立质检和确认。");render();});
$("assetRepair").addEventListener("click",assetAction);
$("toggleRemote").addEventListener("click",assetToggle);
$("approveAsset").addEventListener("click",assetApprove);
$("dialogClose").addEventListener("click",closeDialog);
$("dialogCancel").addEventListener("click",closeDialog);
$("dialogPrimary").addEventListener("click",dialogPrimary);
$("actionDialog").addEventListener("close",()=>{if(!$("actionDialog").open)dialogMode="";});
render();
