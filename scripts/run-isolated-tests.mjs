import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `command terminated by signal ${signal}`
            : `command failed with exit code ${code}`
        )
      );
    });
  });
}

const tempRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "pvs-unit-db-")
);
const databasePath = path
  .join(tempRoot, "unit.db")
  .replaceAll("\\", "/");
const env = {
  ...process.env,
  DATABASE_URL: `file:${databasePath}`
};

try {
  await run(
    process.execPath,
    [
      path.resolve(
        root,
        "node_modules/prisma/build/index.js"
      ),
      "migrate",
      "deploy"
    ],
    env
  );

  const testDir = path.resolve(root, "dist/tests");
  const testFiles = (await fs.readdir(testDir))
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => path.join(testDir, name));

  await run(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      ...testFiles
    ],
    env
  );
} finally {
  await fs.rm(tempRoot, {
    recursive: true,
    force: true,
    maxRetries: 3
  });
}
