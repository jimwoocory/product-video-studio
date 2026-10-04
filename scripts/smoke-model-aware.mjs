// Offline HTTP/browser smoke test. Real AI, database and paid video ports are NOT used.
// Usage: npm.cmd run build; node scripts/smoke-model-aware.mjs [--serve]
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
process.env.NODE_ENV = 'test'; // Must precede the dynamic server import: disables production boot/recovery.
const { createAppServer } = await import('../dist/src/web/server.js');
const { renderProjectPage } = await import('../dist/src/web/workbench-ui.js');
const { ProductDirectorService } = await import('../dist/src/application/services/product-director.js');
const { HermesProductDirectorGenerator } = await import('../dist/src/adapters/ai/hermes-product-director-generator.js');
const { directorCase } = await import('../dist/tests/model-aware-fixtures.js');
const { ISO } = await import('../dist/tests/fixtures.js');
const c = directorCase(60000, 10);
const audit = { aiCalls: 0, paidCalls: 0, usageChecks: 0, plans: [], capabilityFailure: false, lastTarget: null };
const project = { id: c.input.productTruth.projectId, name: '隔离验收：模型感知导演', status: 'DIRECTOR_REVIEW',
  targetPlatform: 'douyin', targetDurationMs: 60000, aspectRatio: '16:9', selectedCreativeId: 'creative-1',
  currentProductTruthRef: c.input.script.productTruthRef, currentCreativeBatchRef: c.input.script.creativeBatchRef,
  currentScriptRef: { entityType: 'ScriptDraft', entityId: c.input.script.id, version: 1, hash: c.input.script.contentHash }, createdAt: ISO, updatedAt: ISO };
const workspace = { project, productTruth: c.input.productTruth, creativeBatch: c.input.creativeBatch, script: c.input.script };
const runtime = { id: 'offline-smoke', version: '1', async generateJson(request) {
  audit.aiCalls++; audit.lastTarget = request.input.generationTarget; return structuredClone(c.proposal);
} };
const deps = {
  productFlow: {
    async getWorkspace(id) { assert.equal(id, project.id); return workspace; },
    async nextVersion() { return audit.plans.length + 1; },
    async saveProductionPlanDraft(plan) {
      audit.plans.push(structuredClone(plan)); workspace.productionPlan = plan;
      project.currentProductionPlanRef = { entityType: 'ProductionPlan', entityId: plan.id, version: plan.version, hash: plan.contentHash };
      return project;
    },
    async confirmScript(script) { workspace.script = script; return project; }
  },
  aiGeneration: { async assertScriptUsageCompliance() { audit.usageChecks++; } },
  productDirector: new ProductDirectorService(new HermesProductDirectorGenerator(runtime)),
  referenceVideo: { async latest() { return null; } },
  dreaminaCapability: { async registry() {
    if (audit.capabilityFailure) throw new Error('OFFLINE_SMOKE_CAPABILITY_UNAVAILABLE');
    return c.registry;
  } },
  provider: new Proxy({}, { get() { return () => { audit.paidCalls++; throw new Error('REAL_PROVIDER_FORBIDDEN_IN_OFFLINE_SMOKE'); }; } })
};
const app = createAppServer(deps);
const handler = app.listeners('request')[0];
const send = (res, code, value) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (req.method === 'GET' && (pathname === '/' || pathname === '/projects/project-1/director')) {
    const html = renderProjectPage({ kind: 'director', workspace, blockers: [], attempts: [], generationRequests: [],
      preflights: [], approvals: [], compiledPrompts: [], artifacts: [], reviewDecisions: [], commandAttempts: [] });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html);
  }
  if (pathname === '/lab/audit') return send(res, 200, { ...audit, plans: audit.plans.map(p => ({ version: p.version, hash: p.contentHash, target: p.generationTarget, clips: p.scenes.flatMap(s => s.clips).map(clip => ({ durationMs: clip.durationMs, factIds: clip.requiredFactIds })) })) });
  if (req.method === 'POST' && pathname === '/lab/fail-capability') { audit.capabilityFailure = true; return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && pathname === '/lab/restore-capability') { audit.capabilityFailure = false; return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && pathname === '/lab/stop') { send(res, 200, { stopped: true }); server.close(); return; }
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const allowed = ['/api/dreamina/capabilities', '/api/projects/project-1/production-plan/generate', '/api/projects/project-1/script/confirm'];
  if (!allowed.includes(pathname)) return send(res, 403, { error: 'OFFLINE_SMOKE_ROUTE_NOT_ALLOWED' });
  return handler(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
try {
  const route = '/api/projects/project-1/production-plan/generate';
  const settings = { requestedModelVersion: 'seedance2.0mini', aspectRatio: '16:9', videoResolution: '720p', nativeAudioOutputRequested: false };
  assert.equal((await post(route, {})).status, 400);
  assert.equal((await post(route, { generationSettings: { ...settings, requestedModelVersion: 'missing-model' } })).status, 400);
  assert.equal((await post(route, { generationSettings: { ...settings, nativeAudioOutputRequested: true } })).status, 400);
  assert.equal(audit.aiCalls, 0);
  const generated = await post(route, { generationSettings: settings });
  const body = await generated.json(); assert.equal(generated.status, 201, JSON.stringify(body));
  assert.equal(body.productionPlan.scenes.flatMap(s => s.clips).length, 6);
  assert.equal(body.productionPlan.generationTarget.requestedModelVersion, settings.requestedModelVersion);
  const oldHash = body.productionPlan.contentHash;
  assert.equal((await post(route, { generationSettings: { ...settings, requestedModelVersion: 'seedance2.0', aspectRatio: '9:16' } })).status, 201);
  assert.notEqual(audit.plans[1].contentHash, oldHash); assert.equal(audit.plans[0].contentHash, oldHash);
  workspace.script = { ...c.input.script, status: 'DRAFT' }; delete workspace.script.confirmedAt;
  const confirmed = await post('/api/projects/project-1/script/confirm', { projectId: project.id, confirmCurrent: true });
  assert.equal(confirmed.status, 200); assert.equal(audit.aiCalls, 2); assert.equal(audit.usageChecks, 1);
  assert.equal(audit.paidCalls, 0);
  delete workspace.productionPlan; delete project.currentProductionPlanRef;
  assert.equal((await fetch(base + '/')).status, 200);
  const result = { status: 'PASS', kind: 'OFFLINE_HTTP_SMOKE', base, checks: 8, realAiCalls: 0, realPaidSubmissions: 0, liveDatabaseUsed: false, at: new Date().toISOString() };
  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile('.tmp/p1f02-model-aware-http-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (process.argv.includes('--serve')) {
    console.log('OFFLINE_BROWSER_LAB=' + base);
    setTimeout(() => server.close(), 20 * 60 * 1000).unref();
  } else server.close();
} catch (error) {
  server.close(); console.error(error); process.exitCode = 1;
}
