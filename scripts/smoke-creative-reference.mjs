// Real isolated SQLite/FFmpeg/HTTP/UI, synthetic visual assessment only. No production or paid providers.
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
process.env.NODE_ENV='test';process.env.PVS_SMART_WORKER_DISABLED='1';
const {referenceFixture,goodAssessment}=await import('../dist/tests/creative-reference-fixture.js');
const {handleCreativeReferenceHttp}=await import('../dist/src/web/creative-reference-http.js');
const f=await referenceFixture();await f.service.capture(f.captured);
const other=path.join(f.root,'other.png');await promisify(execFile)(process.env.FFMPEG_PATH??'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=white:s=512x512','-frames:v','1','-y',other],{windowsHide:true,timeout:30000});
const bytes=await fs.readFile(other);await f.service.capture({...f.captured,title:'第二个外观候选',mediaUrl:'https://example.com/other.png',sourceBytes:bytes,images:[{bytes,mimeType:'image/png'}]});
f.ai.assessment.identity='OTHER_PRODUCT';await f.service.capture({...f.captured,title:'测试：竞品必须阻断',mediaUrl:'https://example.com/competitor.png'},'explicit-test-reanalysis');Object.assign(f.ai.assessment,goodAssessment);
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;server.close();await f.cleanup()};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url??'/','http://localhost');
 if(url.pathname==='/lab-state'){res.setHeader('content-type','application/json');res.end(JSON.stringify({projectId:f.projectId,referenceState:await f.repo.state(f.projectId),candidates:await f.repo.candidates(f.projectId),aiCalls:f.ai.calls.length,realAiCalls:0,realPaidSubmissions:0}));return;}
 if(url.pathname==='/stop'&&req.method==='POST'){res.end('stopped');setTimeout(()=>void stop(),50);return;}
 const artifactMatch=url.pathname.match(/^\/api\/artifacts\/([^/]+)\/content$/);if(artifactMatch){const a=await f.artifacts.findById(decodeURIComponent(artifactMatch[1]));if(!a||a.projectId!==f.projectId){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':a.mimeType??'application/octet-stream'});res.end(await fs.readFile(f.store.resolveArtifactPath(a.relativePath)));return;}
 if(await handleCreativeReferenceHttp(req,res,url,{productFlow:f.productFlow,creativeReferences:f.service,collectCreativeReferences:async()=>({mediaCount:0,failures:['隔离环境不访问外部研究来源']})}))return;
 res.writeHead(404);res.end();
}catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({message:String(e)}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const data={base,projectId:f.projectId,root:f.root,page:base+'/projects/'+f.projectId+'/creative-references',realAiCalls:0,realPaidSubmissions:0};
await fs.writeFile('.tmp/p1f03-reference-browser-lab.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data));
setTimeout(()=>void stop(),20*60*1000).unref();
