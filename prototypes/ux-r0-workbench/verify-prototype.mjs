import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const dir=dirname(fileURLToPath(import.meta.url));
const chrome="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--disable-extensions","--no-first-run"]});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const requests=[],exceptions=[];
page.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))requests.push(r.method()+" "+r.url());});
page.on("pageerror",e=>exceptions.push(e.message));
try{
  const res=await page.goto("http://127.0.0.1:3195/");
  assert.equal(res.status(),200);
  assert.equal(await page.locator("iframe").count(),0);
  await page.getByRole("heading",{name:"填写产品资料"}).waitFor();
  await page.screenshot({path:join(dir,"preview-desktop.png")});
  await page.locator("#saveProduct").click();
  await page.getByRole("heading",{name:"确认产品事实"}).waitFor();
  assert.equal(await page.locator("#confirmTruth").isDisabled(),true);
  await page.locator("#truthAccepted").check();
  await page.locator("#confirmTruth").click();
  await page.getByRole("heading",{name:"选择视频创意"}).waitFor();
  await page.locator('input[name="creativeDirection"][value="showcase"]').check();
  await page.locator("#selectCreative").click();
  await page.getByRole("heading",{name:"创意已确认，进入制作准备"}).waitFor();
  assert.match(await page.locator("#createResultMessage").innerText(),/轻量产品展示/);
  console.log("PASS 01 新建: 资料 -> 事实核对 -> 创意 -> 制作准备");

  await page.locator('[data-scenario="review"]').click();
  await page.getByRole("heading",{name:"审片：确认镜头 2"}).waitFor();
  await page.screenshot({path:join(dir,"preview-review.png")});
  await page.locator("#reviewRedo").click();
  await page.locator("#dialogPrompt").fill("只重做镜头2，固定人物和产品外观，保留原生声音");
  await page.locator("#dialogPrimary").click();
  await page.locator("#dialogConsent").waitFor();
  assert.equal(await page.locator("#dialogPrimary").isDisabled(),true);
  await page.locator("#dialogConsent").check();
  await page.locator("#dialogPrimary").click();
  assert.match(await page.locator("#lastAction").innerText(),/局部重做/);
  await page.locator("#reviewAccept").click();
  await page.getByRole("heading",{name:"审片：确认镜头 3"}).waitFor();
  await page.locator("#reviewAccept").click();
  await page.getByRole("heading",{name:"本轮审片已经完成"}).waitFor();
  await page.locator("#showEditPlan").click();
  assert.equal(await page.locator("#editPlanResult").isVisible(),true);
  console.log("PASS 02 审片: 局部重做 -> 费用门禁 -> 再审 -> 全部采用 -> 剪辑方案");

  await page.locator('[data-scenario="asset"]').click();
  await page.getByRole("heading",{name:"修复失败的制作素材"}).waitFor();
  await page.screenshot({path:join(dir,"preview-asset.png")});
  await page.locator("#toggleRemote").click();
  assert.match(await page.locator("#assetRepair").innerText(),/核对原提交结果/);
  await page.locator("#assetRepair").click();
  assert.match(await page.locator("#assetIssueMessage").innerText(),/仍未知/);
  await page.locator("#toggleRemote").click();
  await page.locator("#assetRepair").click();
  await page.locator("#dialogPrompt").fill("只修复人物B，保持已确认服装发型一致");
  await page.locator("#dialogPrimary").click();
  assert.equal(await page.locator("#dialogPrimary").isDisabled(),true);
  await page.locator("#dialogConsent").check();
  await page.locator("#dialogPrimary").click();
  await page.getByRole("heading",{name:"审核人物 B 的新候选"}).waitFor();
  await page.locator("#approveAsset").click();
  await page.getByRole("heading",{name:"固定素材已全部确认"}).waitFor();
  assert.match(await page.locator("#contextSaved").innerText(),/4 项/);
  console.log("PASS 03 资产: 远端未知禁止重提 -> 明确失败才局部修复 -> 付费门禁 -> 看图确认");

  await page.setViewportSize({width:390,height:844});
  await page.locator("#resetDemo").click();
  await page.screenshot({path:join(dir,"preview-mobile.png"),fullPage:true});
  const layout=await page.evaluate(()=>({
    innerWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    iframeCount:document.querySelectorAll("iframe").length
  }));
  assert.equal(layout.iframeCount,0);
  assert.ok(layout.scrollWidth<=layout.innerWidth+2,"Mobile horizontal overflow: "+JSON.stringify(layout));
  console.log("PASS 04 响应式: 390px 宽度无水平溢出；无 iframe");
  assert.deepEqual(requests,[]);
  assert.deepEqual(exceptions,[]);
  console.log("PASS 05 隔离: 0 个非 GET/HEAD 请求，0 个页面 JS 异常");
  const offline=await browser.newPage();
  await offline.goto(new URL("./standalone-preview.html",import.meta.url).href);
  await offline.getByRole("heading",{name:"填写产品资料"}).waitFor();
  await offline.locator("#saveProduct").click();
  await offline.getByRole("heading",{name:"确认产品事实"}).waitFor();
  await offline.close();
  console.log("PASS 06 离线版: 本机 file:// 单 HTML 可以独立交互");
}finally{
  await browser.close();
}
