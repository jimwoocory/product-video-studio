// Isolated integration harness: real SQLite/services/HTTP; synthetic AI/video provider, no credentials or paid CLI.
// Run after build: node scripts/smoke-smart-generation.mjs [--serve]
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';import { deflateSync } from 'node:zlib';
process.env.NODE_ENV='test';process.env.PVS_SMART_WORKER_DISABLED='1';
const fullAutoEdit = process.argv.includes('--auto-edit');
const root=await fs.mkdtemp(path.resolve('.tmp/smart-smoke-'));
process.env.DATABASE_URL='file:'+path.join(root,'smoke.db').replaceAll('\\','/');
await new Promise((ok,fail)=>{const p=spawn(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,stdio:'ignore',windowsHide:true});p.on('error',fail);p.on('exit',c=>c===0?ok():fail(Error('isolated migration failed '+c)));});
const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
const mod=p=>import('../dist/src/'+p+'.js');
const {hashValue,sha256Bytes}=await mod('domain/hashing');
const {directorCase,modelRegistry}=await import('../dist/tests/model-aware-fixtures.js');
const {makeProductTruth,H}=await import('../dist/tests/fixtures.js');
const {PrismaProductFlowRepository}=await mod('adapters/db/prisma-product-flow-repository');
const {PrismaArtifactRepository}=await mod('adapters/db/prisma-artifact-repository');
const {PrismaGenerationRepository}=await mod('adapters/db/prisma-generation-repository');
const {PrismaWorkflowRepository}=await mod('adapters/db/prisma-workflow-repository');
const {PrismaReviewRepository}=await mod('adapters/db/prisma-review-repository');
const {PrismaProviderAuditRepository}=await mod('adapters/db/prisma-provider-audit-repository');
const {PrismaFinalOutputRepository}=await mod('adapters/db/prisma-final-output-repository');
const {PrismaSmartRunRepository}=await mod('adapters/db/prisma-smart-run-repository');
const {ProductFlowService}=await mod('application/services/product-flow');
const {AiGenerationService}=await mod('application/services/ai-generation');
const {ProductDirectorService}=await mod('application/services/product-director');
const {HermesProductDirectorGenerator}=await mod('adapters/ai/hermes-product-director-generator');
const {LocalArtifactStore}=await mod('adapters/store/local-artifact-store');
const {LocalProductInputStore}=await mod('adapters/store/local-product-input-store');
const {GenerationPreflightService}=await mod('application/services/generation-preflight');
const {ApprovalService}=await mod('application/services/approval-service');
const {GenerationExecutionService}=await mod('application/services/generation-execution');
const {ReviewService}=await mod('application/services/review-service');
const {BatchGenerationService}=await mod('application/services/batch-generation-service');
const {SmartGenerationService}=await mod('application/services/smart-generation-service');
const {ApplicationSmartProduction}=await mod('application/services/smart-production-adapter');
const {startSmartGenerationWorker}=await mod('application/services/smart-generation-worker');
const {runnableSmartStatuses}=await mod('domain/smart-generation');
const {createAppServer}=await mod('web/server');
const {PrismaTimelineRepository}=await mod('adapters/db/prisma-timeline-repository');
const {TimelineService}=await mod('application/services/timeline-service');
const {RenderEngine}=await mod('application/services/render-engine');
const {AutoEditService}=await mod('application/services/auto-edit-service');
const {WindowsSpeechSynthesis}=await mod('adapters/media/windows-speech-synthesis');
const {inspectMedia}=await mod('adapters/media/inspect-media');
const {FinalAssemblyService}=await mod('application/services/final-assembly-service');
const {PrismaPublishRepository}=await mod('adapters/db/prisma-publish-repository');
const {PublishProviderRegistry}=await mod('application/services/publish-provider-registry');
const {PublishBridgeService}=await mod('application/services/publish-bridge-service');
const {ManualExportProvider}=await mod('adapters/publish/manual-export-provider');
const projectsRoot=path.join(root,'projects');
const fixtureVideo=path.join(root,'synthetic-video.mp4');
await new Promise((ok,fail)=>{const p=spawn(process.env.FFMPEG_PATH??'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=gray:s=512x512:r=5:d=15','-an','-c:v','libx264','-pix_fmt','yuv420p','-y',fixtureVideo],{stdio:'ignore',windowsHide:true});p.on('error',fail);p.on('exit',c=>c===0?ok():fail(Error('synthetic fixture encoding failed '+c)));});
const audit={kind:'ISOLATED_SERVICES_HTTP',realAiCalls:0,realPaidSubmissions:0,mockSubmissions:0,mockPreflights:0,aiCalls:0};
const productFlow=new ProductFlowService(new PrismaProductFlowRepository(db));
const artifacts=new PrismaArtifactRepository(db),generation=new PrismaGenerationRepository(db),workflow=new PrismaWorkflowRepository(db),review=new PrismaReviewRepository(db),providerAudit=new PrismaProviderAuditRepository(db),finalOutput=new PrismaFinalOutputRepository(db);
const productInput=new LocalProductInputStore(projectsRoot,artifacts);
const registry=modelRegistry(15);
const provider={id:'domestic-jimeng-cli',
  probe:async()=>({code:'READY',cliFound:true,identityVerified:true,executablePath:'TEST_ONLY',executableSha256:H.a,cliVersion:'isolated',providerIdentityHash:registry.providerIdentityHash,capabilityFingerprint:registry.providerCapabilityFingerprint,supportedOperations:['submit','status','download'],supportedModels:registry.models,supportedDurationsMs:[4000,5000,8000,10000,15000],rawStdout:'fixture',rawStderr:''}),
  accountStatus:async()=>({status:'AUTHENTICATED',availableCredits:100}),estimate:async()=>({status:'UNKNOWN',reason:'Synthetic integration; not real pricing'}),
  submit:async()=>{audit.mockSubmissions++;await new Promise(r=>setTimeout(r,15));return {externalTaskId:'SYNTHETIC-TEST-'+audit.mockSubmissions};},
  status:async()=>({status:'SUCCEEDED'}),download:async(_handle,target)=>{await fs.copyFile(fixtureVideo,target);return {path:target};},
  reconcileSubmission:async()=>({outcome:'INCONCLUSIVE',reason:'test-only'}),drainCommandEvidence:()=>[]};
const runtime={id:'synthetic-ai',version:'test',generateJson:async request=>{
  audit.aiCalls++;
  if(request.outputContract?.violations)return {violations:[]};
  if(request.outputContract?.concepts)return {concepts:directorCase(30000).input.creativeBatch.concepts.map(c=>({...c,expectedDurationMs:request.input.targetDurationMs,requiredFactIds:[request.input.allowedFactIds[0]]}))};
  if(request.outputContract?.beats)return {beats:[{purpose:'PRODUCT',text:'展示产品（隔离测试）',estimatedDurationMs:request.input.targetDurationMs,requiredFactIds:[request.input.allowedFactIds[0]]}]};
  if(request.outputContract?.scenes){const c=directorCase(request.input.projectTargetDurationMs);const beat=request.input.scriptBeats[0].id;const fact=request.input.allowedFacts[0].id;const scene=c.proposal.scenes[0];
    if(fullAutoEdit){const original=scene.clips[0];scene.clips=[0,1].map(i=>({...original,durationMs:15000,segments:[{...original.segments[0],endMs:15000,dialogueOrNarration:{kind:'NARRATION',text:i===0?'这是第一段产品展示，声音与字幕同步呈现。':'这是第二段产品展示，最终成片仍需要人工确认。',estimatedDurationMs:5000,estimatorVersion:'synthetic-fixture'}}]}));}
    scene.sourceBeatIds=[beat];scene.requiredFactIds=[fact];for(const clip of scene.clips){clip.sourceBeatIds=[beat];clip.requiredFactIds=[fact];clip.referenceAssets=[{assetId:request.input.referenceAssets[0].assetId,role:'PRIMARY_PRODUCT',priority:0,required:true}];for(const segment of clip.segments){segment.sourceBeatIds=[beat];segment.requiredFactIds=[fact];}}return c.proposal;}
  throw Error('Unexpected synthetic AI contract');
}};
const aiGeneration=new AiGenerationService(runtime),productDirector=new ProductDirectorService(new HermesProductDirectorGenerator(runtime),runtime);
const dreaminaCapability={registry:async()=>registry};
const preflight=new GenerationPreflightService(generation,workflow,provider,(pid,key)=>productFlow.nextVersion(pid,'CompiledPrompt',key),'seedance2.0mini',runtime,dreaminaCapability);
const approval=new ApprovalService(generation,workflow),execution=new GenerationExecutionService(generation,workflow,artifacts,providerAudit,provider,projectsRoot,review);
const batchGeneration=new BatchGenerationService(productFlow,generation,workflow,review,execution);
const reviewService=new ReviewService(productFlow,generation,workflow,artifacts,review);
const referenceVideo={latest:async()=>null},research={pageData:async()=>({runs:[],evidence:[]})};
const timelineRepo=new PrismaTimelineRepository(db),timeline=new TimelineService(productFlow,workflow,artifacts,review,timelineRepo,projectsRoot);
const renderEngine=new RenderEngine(productFlow,artifacts,timelineRepo,finalOutput,projectsRoot);
const autoEdit=new AutoEditService({productFlow,workflow,review,artifacts,timelines:timelineRepo,projectsRoot,speech:new WindowsSpeechSynthesis()});
const finalAssembly=new FinalAssemblyService(productFlow,workflow,artifacts,review,finalOutput,projectsRoot);
const publishBridge=new PublishBridgeService(productFlow,artifacts,finalOutput,new PrismaPublishRepository(db),new PublishProviderRegistry([new ManualExportProvider()]),projectsRoot);
const production=new ApplicationSmartProduction({productFlow,productInput,artifacts,aiGeneration,productDirector,referenceVideo,research,generation,workflow,review,dreaminaCapability,preflight,approval,execution,batchGeneration,finalOutput,renderEngine,timeline,projectsRoot,preflightAudit:async()=>{audit.mockPreflights++;},
 ...(fullAutoEdit?{autoEdit:async run=>{const result=await autoEdit.create({projectId:run.projectId,settings:run.postProduction??run.options.postProduction??{},expectedPlanHash:run.productionPlan.contentHash,attemptIds:run.attemptIds});const confirmed=await timeline.confirm(run.projectId,{id:result.timeline.id,hash:result.timeline.contentHash});return {timelineRef:{id:confirmed.id,hash:confirmed.contentHash},autoEditArtifactId:result.planArtifactId};}}:{})});
const smartGeneration=new SmartGenerationService(new PrismaSmartRunRepository(db),production);
const deps={productFlow,productInput,artifacts,aiGeneration,productDirector,referenceVideo,research,generation,workflow,review,dreaminaCapability,preflight,approval,execution,batchGeneration,smartGeneration,finalOutput,projectsRoot,provider,providerAudit,reviewService,timeline,renderEngine,autoEdit,finalAssembly,publishBridge,snapshots:{refresh:async()=>{}}};
function crc(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),length=Buffer.alloc(4),hash=Buffer.alloc(4);length.writeUInt32BE(data.length);hash.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([length,t,data,hash]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(512,0);ihdr.writeUInt32BE(512,4);ihdr[8]=8;ihdr[9]=2;
const pixels=Buffer.alloc((512*3+1)*512,128);for(let y=0;y<512;y++)pixels[y*(512*3+1)]=0;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
async function seed(pid){
 const now=new Date().toISOString();await productFlow.createProject({id:pid,name:'隔离测试项目：可恢复编排',status:'DRAFT',targetPlatform:'douyin',targetDurationMs:30000,aspectRatio:'16:9',createdAt:now,updatedAt:now});
 const store=new LocalArtifactStore(path.join(projectsRoot,pid),artifacts);const a=await store.writeImmutable({id:'artifact-'+pid,projectId:pid,kind:'USER_INPUT',relativePath:'input/test.png',immutable:true,bytes:png,mimeType:'image/png'});
 const asset={id:'asset-'+pid,artifactId:a.id,type:'image',source:'user_upload',originalFilename:'test.png',sha256:a.sha256,mimeType:'image/png',sizeBytes:png.length,width:512,height:512,createdAt:now};
 await productInput.save({projectId:pid,productName:'隔离测试产品',featureDescription:'仅用于验证流程',assets:[asset],forbiddenChanges:makeProductTruth().forbiddenChanges});
 const truth={...makeProductTruth(),id:'truth-'+pid,projectId:pid,productName:'隔离测试产品',canonicalImageId:asset.id,referenceImageIds:[asset.id]};truth.contentHash=hashValue(truth);await productFlow.confirmProductTruth(truth);
}
const options={requestText:'仅测试规划：保留真实外观，30秒横版',generationSettings:{requestedModelVersion:'seedance2.0mini',aspectRatio:'16:9',videoResolution:'720p',nativeAudioOutputRequested:false},reviewMode:'AUTO'};
const pid='smart-http-fixture';await seed(pid);
const app=createAppServer(deps);await new Promise(ok=>app.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+app.address().port;
async function api(url,body){const r=await fetch(base+url,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,json:await r.json()};}
async function drain(run){for(let n=0;n<45&&runnableSmartStatuses.includes(run.status);n++)run=await smartGeneration.advance(run.projectId,run.id);return run;}
try{
 const prefix='/api/projects/'+pid+'/smart-runs';const created=await api(prefix,{requestKey:'integration',options});assert.equal(created.status,201,JSON.stringify(created));
 let run=await drain(created.json.run);assert.equal(run.status,'READY_FOR_PAID_CONFIRM',JSON.stringify(run.blocker));assert.equal(audit.mockSubmissions,0);assert.equal(run.paidScope.requests.length,2);
 assert.equal((await api(prefix,{requestKey:'integration',options})).json.run.id,run.id);
 assert.equal((await api(prefix+'/'+run.id+'/paid',{scopeHash:H.a,confirmPaidGeneration:true,acceptedUnknownCostRisk:true})).status,400);
 const paid={scopeHash:run.paidScope.hash,confirmPaidGeneration:true,acceptedUnknownCostRisk:true};assert.equal((await api(prefix+'/'+run.id+'/paid',paid)).status,200);
 assert.equal((await api(prefix+'/'+run.id+'/paid',paid)).status,200);
 run=await smartGeneration.advance(pid,run.id);assert.equal(run.status,'GENERATING',JSON.stringify(run.blocker));
 const approvals=await generation.listUserApprovals(pid);assert.equal(approvals.length,2);assert.equal(new Set(approvals.map(a=>a.id)).size,2);
 const first=run.attemptIds[0];
 const boundAttempt=await workflow.getGenerationAttempt(first);
 await db.generationAttemptRecord.update({where:{id:first},data:{approvalHash:H.a}});
 await assert.rejects(execution.submitAttempt(first),/approvalHash mismatch/);assert.equal(audit.mockSubmissions,0);
 await db.generationAttemptRecord.update({where:{id:first},data:{approvalHash:boundAttempt.approvalHash}});
 await reviewService.decide({projectId:pid,clipId:boundAttempt.clipId,decision:'SKIP'});
 await assert.rejects(execution.submitAttempt(first),/已被用户跳过/);assert.equal(audit.mockSubmissions,0);
 await reviewService.decide({projectId:pid,clipId:boundAttempt.clipId,decision:'USE'});
 const raced=await Promise.allSettled([execution.submitAttempt(first),execution.submitAttempt(first)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(audit.mockSubmissions,1);
 const batch=(await api('/api/projects/'+pid+'/generation-batch')).json.selection;assert.equal(batch.targets.length,1);
 const batchBody={attemptIds:batch.targets.map(t=>t.attemptId),scopeHash:batch.scopeHash};assert.equal((await api('/api/projects/'+pid+'/generation-batch',batchBody)).status,200);
 await api('/api/projects/'+pid+'/generation-batch',batchBody);assert.equal(audit.mockSubmissions,2);
 run=await drain(await smartGeneration.get(pid,run.id));assert.equal(run.status,'WAITING_FOR_CLIP_REVIEW',JSON.stringify(run.blocker));
 const downloaded=await workflow.getGenerationAttempt(first);
 const sameDownloads=await Promise.all([execution.downloadAttempt(first),execution.downloadAttempt(first)]);
 assert.ok(sameDownloads.every(a=>a.outputArtifactId===downloaded.outputArtifactId));
 assert.equal((await artifacts.listByProject(pid)).filter(a=>a.kind==='GENERATED_VIDEO').length,2);
 for(const a of await workflow.listGenerationAttempts(pid)){assert.ok(a.outputArtifactId);await reviewService.decide({projectId:pid,clipId:a.clipId,generationAttemptId:a.id,decision:'ACCEPT',note:'SYNTHETIC TEST ACCEPTANCE, not real footage'});}
 run=await drain(await smartGeneration.resume(pid,run.id));
 let localResult;
 if(fullAutoEdit){
   assert.equal(run.status,'WAITING_FOR_AUDIO',JSON.stringify(run.blocker));assert.equal(run.finalOutput,undefined);
   const originalConsent=structuredClone(run.consent),originalAssets=(await productInput.latest(pid)).contentHash;
   const configured=await api(prefix+'/'+run.id+'/post-production',{expectedRevision:run.revision,settings:{narrationMode:'SOURCE_OR_LOCAL_TTS'}});assert.equal(configured.status,200,JSON.stringify(configured));
   run=await drain(configured.json.run);assert.equal(run.status,'REVIEW_READY',JSON.stringify(run.blocker));assert.deepEqual(run.consent,originalConsent);assert.equal(audit.mockSubmissions,2);
   assert.equal((await productInput.latest(pid)).contentHash,originalAssets);
   const artifact=await artifacts.findById(run.finalOutput.artifactId),file=path.join(projectsRoot,pid,artifact.relativePath),media=await inspectMedia(file);
   assert.ok(media.hasAudio&&media.hasVideo);assert.equal(media.width,1280);assert.equal(media.height,720);assert.ok(Math.abs(media.durationMs-30000)<120);
   assert.equal(sha256Bytes(await fs.readFile(file)),run.finalOutput.sha256);
   const t=await timeline.latestTimeline(pid);assert.equal(t.audioItems.filter(a=>a.role==='NARRATION').length,2);assert.ok(t.textItems.length>=2);
   const finalPage=await fetch(base+'/projects/'+pid+'/final');assert.equal(finalPage.status,200,await finalPage.text());
   localResult={outputPath:file,artifactId:artifact.id,sha256:artifact.sha256,media,narrationTracks:2,captions:t.textItems.length,localSpeech:true,voiceArtifacts:(await artifacts.listByProject(pid)).filter(a=>a.relativePath.startsWith('post-production/speech/')).length};
   await fs.copyFile(file,'.tmp/p1f02-autoedit-demo.mp4');
 }else{assert.equal(run.blocker?.code,'AUTO_EDIT_NOT_READY');assert.equal(run.finalOutput,undefined);}
 const evidence={...audit,status:'PASS',checks:fullAutoEdit?24:15,productionDatabaseUsed:false,realCompleteVideoE2E:false,localRenderE2E:fullAutoEdit,localResult,runId:run.id,checkpointStatus:run.status,checkpointCode:run.blocker?.code,base,root,at:new Date().toISOString()};
 await fs.writeFile(fullAutoEdit?'.tmp/p1f02-autoedit-http-smoke.json':'.tmp/p1f02-smart-http-smoke.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 if(process.argv.includes('--serve')){
   await seed('smart-browser-fixture');
   await seed('batch-browser-fixture');
   const br=await drain(await smartGeneration.create('batch-browser-fixture','batch-browser',options));
   assert.equal(br.status,'READY_FOR_PAID_CONFIRM');
   await approval.approveCurrentRequests({projectId:'batch-browser-fixture',generationRequestIds:br.paidScope.requests.map(r=>r.requestId),acceptedUnknownCostRisk:true,acceptedDuplicateSubmissionRisk:false});
   const stopWorker=startSmartGenerationWorker(smartGeneration,{intervalMs:1000,onError:e=>console.error('TEST WORKER:',String(e))});
   const lab=http.createServer(async(req,res)=>{if(req.url==='/audit'){res.setHeader('content-type','application/json');res.end(JSON.stringify(audit));}else if(req.url==='/stop'&&req.method==='POST'){res.end('stopped');stopWorker();app.close();lab.close();await db.$disconnect();}else{res.writeHead(404);res.end();}});
   await new Promise(ok=>lab.listen(0,'127.0.0.1',ok));console.log('BROWSER_PAGE='+base+'/projects/smart-browser-fixture/smart');console.log('LAB_CONTROL=http://127.0.0.1:'+lab.address().port);
   await fs.writeFile('.tmp/p1f02-smart-browser-lab.json',JSON.stringify({base,control:'http://127.0.0.1:'+lab.address().port,root},null,2));
   setTimeout(()=>{stopWorker();app.close();lab.close();void db.$disconnect();},20*60*1000).unref();
 }else{await new Promise(ok=>app.close(ok));await db.$disconnect();}
}catch(error){app.close();await db.$disconnect();throw error;}
