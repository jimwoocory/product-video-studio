/**
 * Called ONLY from the user's explicit Douyin "launch / recover" action.
 * Reuses the dedicated Chromium on 127.0.0.1:9223. When no Douyin tab exists,
 * navigates one existing blank tab; never creates a duplicate Douyin tab.
 */
import { chromium } from "playwright-core";
const endpoint="http://127.0.0.1:9223";
const isMain = raw => {
  try {
    const u=new URL(raw);
    return u.protocol==="https:" && ["www.douyin.com","douyin.com"].includes(u.hostname);
  }catch{return false;}
};
let browser;
for(let i=0;i<30;i++){
  try{
    browser=await chromium.connectOverCDP(endpoint,{timeout:1600});
    break;
  }catch{
    await new Promise(r=>setTimeout(r,350));
  }
}
if(!browser)throw Error("Dedicated Chromium CDP unavailable");
const contexts=browser.contexts();
if(contexts.length!==1)throw Error("Unexpected dedicated browser context count");
const ctx=contexts[0];
const main=()=>ctx.pages().filter(p=>isMain(p.url()));
if(main().length>1)throw Error("Multiple Douyin pages already exist; refuse to select one");
if(main().length===1){
  console.log("DOUYIN_MAIN_REUSED - one existing page; no navigation");
  process.exit(0);
}
const blank=ctx.pages().filter(page=>page.url()==="about:blank" ||
  page.url().startsWith("chrome://newtab") ||
  page.url().startsWith("chrome://new-tab-page"));
const tab=blank[0] ?? await ctx.newPage();
await tab.goto("https://www.douyin.com/",{waitUntil:"domcontentloaded",timeout:19000});
if(main().length!==1)throw Error("Failed to establish exactly one dedicated Douyin main page");
console.log("DOUYIN_MAIN_OPENED_IN_DEDICATED_PROFILE mainCount=1");
process.exit(0);
