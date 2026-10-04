// Isolated Agent long-reference UI smoke. Uses real SQLite/artifacts/FFmpeg; no real AI or paid Dreamina submit.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
process.env.NODE_ENV="test";
process.env.PVS_SMART_WORKER_DISABLED="1";

const exec=promisify(execFile);
const {referenceFixture}=await import("../dist/tests/creative-reference-fixture.js");
const {AgentModeService}=await import("../dist/src/application/services/agent-mode-service.js");
const {renderAgentProjectPage}=await import("../dist/src/web/workbench-ui.js");

class MemoryTasks{
  map=new Map();
  async create(task){this.map.set(task.id,structuredClone(task));return structuredClone(task)}
  async update(id,update){const current=this.map.get(id);const next={...current,...update,updatedAt:new Date().toISOString()};for(const key of ["selectedOperation","plan","generationRequestId","generationAttemptId","outputArtifactId","acceptedAt"])if(key in update&&update[key]===null)delete next[key];this.map.set(id,structuredClone(next));return structuredClone(next)}
  async findById(id){const x=this.map.get(id);return x?structuredClone(x):null}
  async listByProject(projectId){return [...this.map.values()].filter(x=>x.projectId===projectId).map(x=>structuredClone(x))}
}
function registry(){return {
 source:"DREAMINA_SKILL_AND_CLI_HELP",skillPath:"C:\\Dreamina\\SKILL.md",skillSha256:"d".repeat(64),rootHelpSha256:"e".repeat(64),
 cliVersion:"test",providerIdentityHash:"b".repeat(64),providerCapabilityFingerprint:"c".repeat(64),registryFingerprint:"9".repeat(64),
 checkedAt:"2026-09-30T00:00:00.000Z",models:["seedance2.0mini"],ratios:["9:16"],nativeAudioOutputSupported:false,
 operations:[{operation:"multimodal2video",operationLabel:"全能参考视频",helpSha256:"5".repeat(64),modelConfigurable:true,fixedModel:false,
 supportedModels:["seedance2.0mini"],supportedRatios:["9:16"],models:[{modelVersion:"seedance2.0mini",supportedResolutions:["720p"],durationMinSeconds:4,durationMaxSeconds:15,explicitRatioAllowed:true,vipOnly:false,maxImages:9,maxVideos:3,maxAudio:3,maxTotalInputs:12,inputMediaMinSeconds:2,inputMediaMaxSeconds:15}],
 fixedResolutions:[],supportsImages:true,supportsVideos:true,supportsReferenceAudio:true,supportsNativeAudioOutput:false,maxImages:9,maxVideos:3,maxAudio:3,maxTotalInputs:12,inputMediaMinSeconds:2,inputMediaMaxSeconds:15}]
}}
const f=await referenceFixture();
const sourceFile=path.join(f.root,"long-reference.mp4");
await exec(process.env.FFMPEG_PATH??"ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=s=320x180:r=1:d=45","-an","-c:v","libx264","-pix_fmt","yuv420p","-y",sourceFile],{windowsHide:true,timeout:90000});
const sourceArtifact=await f.store.writeImmutable({id:"smoke-long-video",projectId:f.projectId,kind:"USER_INPUT",immutable:true,relativePath:"agent/input/long-reference.mp4",mimeType:"video/mp4",bytes:await fs.readFile(sourceFile)});
const sourceMaterial={artifactId:sourceArtifact.id,type:"video",originalFilename:"45秒产品参考.mp4",mimeType:"video/mp4",sizeBytes:sourceArtifact.sizeBytes,sha256:sourceArtifact.sha256,priority:0,durationMs:45000};
const tasks=new MemoryTasks(),requests=[],reports=[];
const generation={async createGenerationRequest(v){requests.push(structuredClone(v));return structuredClone(v)},async createPreflightReport(v){reports.push(structuredClone(v));return structuredClone(v)}};
const provider={async accountStatus(){return {status:"AUTHENTICATED",availableCredits:100}},async estimate(){return {status:"KNOWN",estimatedCredits:1,estimatedCostText:"隔离测试，不扣费"}}};
const capability={async registry(){return registry()}};
const service=new AgentModeService(tasks,generation,{},f.artifacts,provider,{}, {},capability,{}, {},f.projectsRoot);
let task=await service.createTask({projectId:f.projectId,requestText:"参考这条45秒视频生成10秒产品广告",requestedMethod:"multimodal2video",model:"seedance-2.0-mini",durationMs:10000,aspectRatio:"9:16",videoResolution:"720p",materials:[sourceMaterial]});
task=await service.planTask(task.id);
if(task.status!=="READY_TO_CONFIRM"||task.plan?.referenceAdaptations?.length!==1)throw Error("isolated Agent adaptation did not reach READY_TO_CONFIRM");
const workspace=await f.productFlow.getWorkspace(f.projectId);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url??"/","http://localhost");
 if(url.pathname===`/projects/${f.projectId}/agent`){
  const artifacts=await f.artifacts.listByProject(f.projectId);
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
  res.end(renderAgentProjectPage({workspace,tasks:[task],artifacts}));return;
 }
 const match=url.pathname.match(/^\/api\/artifacts\/([^/]+)\/content$/);
 if(match){const artifact=await f.artifacts.findById(decodeURIComponent(match[1]));if(!artifact){res.writeHead(404);res.end();return}const file=path.join(f.projectsRoot,f.projectId,artifact.relativePath);res.writeHead(200,{"content-type":artifact.mimeType??"application/octet-stream"});res.end(await fs.readFile(file));return}
 if(url.pathname==="/audit"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({status:"PASS",projectId:f.projectId,page:"/projects/"+f.projectId+"/agent",realPaidSubmissions:0,requestCount:requests.length,reportCount:reports.length,taskStatus:task.status,adaptations:task.plan.referenceAdaptations,effective:task.plan.effectiveMaterialSummary}));return}
 if(url.pathname==="/stop"&&req.method==="POST"){res.end("stopped");server.close();await f.cleanup();return}
 res.writeHead(404);res.end();
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const base="http://127.0.0.1:"+server.address().port;
console.log(JSON.stringify({base,page:base+"/projects/"+f.projectId+"/agent",audit:base+"/audit",stop:base+"/stop",projectId:f.projectId,realPaidSubmissions:0}));
if(!process.argv.includes("--serve")){const page=await fetch(base+"/projects/"+f.projectId+"/agent");if(page.status!==200)throw Error("page smoke failed");await new Promise(ok=>server.close(ok));await f.cleanup();}
else setTimeout(()=>{server.close();void f.cleanup()},20*60*1000).unref();
