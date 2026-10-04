// Runs the existing complete suite against a fresh additive-migrated SQLite database.
// Does not copy user data or credentials and never runs migrations against the live database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const temp = await fs.mkdtemp(path.join(root, '.tmp', 'test-isolated-'));
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'file:' + path.join(temp, 'suite.db').replaceAll('\\', '/'), PVS_SMART_WORKER_DISABLED: '1' };
async function run(command, args) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1));
  });
  if (code !== 0) throw new Error('Command failed (' + code + '): ' + path.basename(command));
}
await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
await run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json']);
const names = (await fs.readdir(path.join(root, 'dist', 'tests'))).filter(n => n.endsWith('.test.js')).map(n => path.join('dist', 'tests', n));
await run(process.execPath, ['--test', ...names]);
console.log(JSON.stringify({ status: 'PASS', database: env.DATABASE_URL, productionDatabaseUsed: false, at: new Date().toISOString() }));
