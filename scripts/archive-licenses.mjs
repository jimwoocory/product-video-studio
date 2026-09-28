import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const [allow, lock] = await Promise.all([
  fs.readFile(path.join(root, "dependency-allowlist.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "package-lock.json"), "utf8").then(JSON.parse)
]);
const outDir = path.join(root, "third_party", "licenses", "npm");
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

function safeName(value) {
  return value.replace(/^@/, "").replaceAll("/", "__").replaceAll("\\", "__");
}
function nameFromLockPath(lockPathKey, meta) {
  if (typeof meta.name === "string" && meta.name) return meta.name;
  const marker = "node_modules/";
  const index = lockPathKey.lastIndexOf(marker);
  const tail = index >= 0 ? lockPathKey.slice(index + marker.length) : lockPathKey;
  if (tail.startsWith("@")) return tail.split("/").slice(0, 2).join("/");
  return tail.split("/")[0];
}
const approved = new Map(
  (allow.dependencies ?? []).map((dep) => [`${dep.name}@${dep.version}`, dep])
);

const failures = [];
const skippedOptional = [];
let archived = 0;

for (const [lockPathKey, meta] of Object.entries(lock.packages ?? {})) {
  if (!lockPathKey) continue;
  const name = nameFromLockPath(lockPathKey, meta);
  const key = `${name}@${meta.version}`;
  if (!approved.has(key)) {
    failures.push(`${key}: missing from allowlist`);
    continue;
  }

  const packageDir = path.join(root, ...lockPathKey.split("/"));
  let names;
  try {
    names = await fs.readdir(packageDir);
  } catch {
    const isPlatformOptional = meta.optional === true || Boolean(meta.os) || Boolean(meta.cpu);
    if (isPlatformOptional) {
      skippedOptional.push(`${lockPathKey} :: ${key}`);
      continue;
    }
    failures.push(`${lockPathKey} :: ${key}: required package directory missing`);
    continue;
  }

  const pkgJson = JSON.parse(await fs.readFile(path.join(packageDir, "package.json"), "utf8"));
  if (pkgJson.version !== meta.version) {
    failures.push(`${lockPathKey}: installed ${pkgJson.version}, lock ${meta.version}`);
    continue;
  }

  const licenseName = names.find((file) => /^(license|licence|copying)(\.|$)/i.test(file));
  if (!licenseName) {
    failures.push(`${lockPathKey} :: ${key}: installed package license file missing`);
    continue;
  }

  const src = path.join(packageDir, licenseName);
  const pathTag = safeName(lockPathKey.replace(/^node_modules\//, ""));
  const dst = path.join(outDir, `${pathTag}-${meta.version}-${licenseName}`);
  await fs.copyFile(src, dst);
  archived += 1;
}

if (failures.length) {
  console.error("LICENSE_ARCHIVE_INCOMPLETE");
  for (const line of failures) console.error(line);
  process.exit(4);
}

await fs.writeFile(
  path.join(outDir, "PLATFORM_OPTIONAL_SKIPPED.txt"),
  skippedOptional.length ? skippedOptional.join("\n") + "\n" : "",
  "utf8"
);
console.log(`LICENSE_ARCHIVE_PASS archived=${archived} skipped_optional=${skippedOptional.length}`);
