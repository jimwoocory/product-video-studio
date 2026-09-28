import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.PVS_LICENSE_ROOT ?? process.cwd());
const fail = (code, lines = []) => {
  console.error(code);
  for (const line of lines) console.error(line);
  process.exit(2);
};

async function fileExists(relativePath) {
  try {
    const stat = await fs.stat(path.join(root, relativePath));
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function dirHasFiles(relativePath) {
  const absolute = path.join(root, relativePath);
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) return true;
      if (entry.isDirectory()) {
        if (await dirHasFiles(path.join(relativePath, entry.name))) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function packageNameFromLockPath(lockPathKey, meta) {
  if (typeof meta.name === "string" && meta.name) return meta.name;
  const marker = "node_modules/";
  const index = lockPathKey.lastIndexOf(marker);
  if (index < 0) return lockPathKey;
  const tail = lockPathKey.slice(index + marker.length);
  if (tail.startsWith("@")) {
    return tail.split("/").slice(0, 2).join("/");
  }
  return tail.split("/")[0];
}

function keyOf(entry) {
  return `${entry.name}@${entry.version}`;
}

function slugifyHeading(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function noticeAnchors(markdown) {
  const anchors = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (match) anchors.add(slugifyHeading(match[1]));
  }
  return anchors;
}

function noticeAnchorFromEntry(value) {
  if (typeof value !== "string") return null;
  const index = value.indexOf("#");
  return index >= 0 ? value.slice(index + 1) : null;
}

const requiredGovernanceFiles = [
  "package.json",
  "package-lock.json",
  "dependency-allowlist.json",
  "THIRD_PARTY_NOTICES.md",
  "docs/THIRD-PARTY-POLICY.md"
];
const missingGovernance = [];
for (const file of requiredGovernanceFiles) {
  if (!(await fileExists(file))) missingGovernance.push(file);
}
try {
  const stat = await fs.stat(path.join(root, "third_party", "licenses"));
  if (!stat.isDirectory()) missingGovernance.push("third_party/licenses/");
} catch {
  missingGovernance.push("third_party/licenses/");
}
if (missingGovernance.length) {
  fail("LICENSE_GOVERNANCE_MISSING", missingGovernance);
}

const [manifestRaw, lockRaw, allowRaw, noticeRaw] = await Promise.all([
  fs.readFile(path.join(root, "package.json"), "utf8"),
  fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  fs.readFile(path.join(root, "dependency-allowlist.json"), "utf8"),
  fs.readFile(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8")
]);
const manifest = JSON.parse(manifestRaw);
const lock = JSON.parse(lockRaw);
const allow = JSON.parse(allowRaw);
const notice = noticeRaw;
const anchors = noticeAnchors(notice);

if (allow.defaultDecision !== "DENY") {
  fail("LICENSE_POLICY_BLOCK", ["defaultDecision must be DENY"]);
}

const allowedLicenses = new Set(allow.allowedLicenses ?? []);
const deniedLicenses = new Set(allow.deniedLicenses ?? []);
const rootPkg = lock.packages?.[""] ?? {};
const directProd = new Set(Object.keys(rootPkg.dependencies ?? {}));
const directDev = new Set(Object.keys(rootPkg.devDependencies ?? {}));

const manifestFailures = [];
for (const section of ["dependencies", "devDependencies"]) {
  const manifestDeps = manifest[section] ?? {};
  const lockDeps = rootPkg[section] ?? {};
  const names = new Set([
    ...Object.keys(manifestDeps),
    ...Object.keys(lockDeps)
  ]);
  for (const name of names) {
    if (!(name in manifestDeps)) {
      manifestFailures.push(
        `${section}:${name} exists in lockfile root but not package.json`
      );
      continue;
    }
    if (!(name in lockDeps)) {
      manifestFailures.push(
        `${section}:${name} exists in package.json but not lockfile root`
      );
      continue;
    }
    if (manifestDeps[name] !== lockDeps[name]) {
      manifestFailures.push(
        `${section}:${name} manifest=${manifestDeps[name]} lock=${lockDeps[name]}`
      );
    }
    if (
      typeof manifestDeps[name] !== "string" ||
      !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifestDeps[name])
    ) {
      manifestFailures.push(
        `${section}:${name} must use an exact pinned version`
      );
    }
  }
}
if (manifestFailures.length) {
  fail("MANIFEST_LOCK_MISMATCH", manifestFailures);
}

const forbiddenRuntimePattern =
  /(algovate|deluxebear|xiaozhichao|jimengcli[_-]?api|jimeng-cli|reverse[-_ ]?engineered.*jimeng|third[-_ ]?party.*jimeng)/i;

const discovered = Object.entries(lock.packages ?? {})
  .filter(([lockPathKey]) => lockPathKey !== "")
  .map(([lockPathKey, meta]) => {
    const name = packageNameFromLockPath(lockPathKey, meta);
    const license = meta.license ?? "NO-LICENSE";
    const direct = directProd.has(name) || directDev.has(name);
    const scope = directProd.has(name)
      ? "production"
      : directDev.has(name)
        ? "development"
        : "transitive";
    return {
      name,
      version: meta.version,
      license,
      scope,
      direct
    };
  })
  .sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

const policyFailures = discovered.filter(
  (entry) =>
    !entry.version ||
    deniedLicenses.has(entry.license) ||
    !allowedLicenses.has(entry.license)
);
if (policyFailures.length) {
  fail(
    "LICENSE_POLICY_BLOCK",
    policyFailures.map(
      (item) => `${item.name}@${item.version ?? "?"} :: ${item.license}`
    )
  );
}

const allowedByKey = new Map(
  (allow.dependencies ?? []).map((entry) => [keyOf(entry), entry])
);
const missing = [];
const governanceFailures = [];
const requiredDependencyFields = [
  "name",
  "version",
  "ecosystem",
  "usage",
  "license",
  "sourceUrl",
  "bundled",
  "runtimeType",
  "approvedForP0",
  "licenseFile",
  "noticeEntry",
  "reviewedAt"
];

for (const discoveredEntry of discovered) {
  const key = keyOf(discoveredEntry);
  const approved = allowedByKey.get(key);
  if (
    !approved ||
    approved.license !== discoveredEntry.license ||
    approved.approvedForP0 !== true
  ) {
    missing.push(key);
    continue;
  }

  for (const field of requiredDependencyFields) {
    const value = approved[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      governanceFailures.push(`${key}: missing ${field}`);
    }
  }
  if (approved.ecosystem !== "npm") {
    governanceFailures.push(`${key}: ecosystem must be npm`);
  }
  const dependencyDescriptor = [
    approved.name,
    approved.sourceUrl,
    approved.usage
  ]
    .filter(Boolean)
    .join(" ");
  if (forbiddenRuntimePattern.test(dependencyDescriptor)) {
    governanceFailures.push(
      `${key}: prohibited Jimeng/Dreamina wrapper or reverse CLI dependency`
    );
  }
  if (
    approved.scope !== discoveredEntry.scope ||
    Boolean(approved.direct) !== discoveredEntry.direct
  ) {
    governanceFailures.push(`${key}: scope/direct mismatch with lockfile`);
  }
  if (!(await fileExists(approved.licenseFile))) {
    governanceFailures.push(
      `${key}: licenseFile missing or empty: ${approved.licenseFile}`
    );
  }
  const anchor = noticeAnchorFromEntry(approved.noticeEntry);
  if (!anchor || !anchors.has(anchor)) {
    governanceFailures.push(
      `${key}: NOTICE anchor missing: ${approved.noticeEntry}`
    );
  }
  const rowNeedle = `| ${approved.name} | ${approved.version} |`;
  if (!notice.includes(rowNeedle)) {
    governanceFailures.push(`${key}: NOTICE inventory row missing`);
  }
}

const extra = [...allowedByKey.keys()].filter(
  (key) => !discovered.some((entry) => keyOf(entry) === key)
);
if (missing.length || extra.length) {
  fail("ALLOWLIST_MISSING_OR_MISMATCH", [
    ...missing.map((item) => `missing: ${item}`),
    ...extra.map((item) => `not in lockfile: ${item}`)
  ]);
}
if (governanceFailures.length) {
  fail("LICENSE_GOVERNANCE_INVALID", governanceFailures);
}

const runtimeFailures = [];
const requiredRuntimeFields = [
  "name",
  "version",
  "ecosystem",
  "usage",
  "license",
  "sourceUrl",
  "bundled",
  "runtimeType",
  "approvedForP0",
  "serviceTermsStatus",
  "noticeEntry",
  "reviewedAt"
];

for (const runtime of allow.externalRuntimes ?? []) {
  for (const field of requiredRuntimeFields) {
    const value = runtime[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim())
    ) {
      runtimeFailures.push(`${runtime.name ?? "runtime"}: missing ${field}`);
    }
  }
  if (runtime.runtimeType !== "external-runtime" || runtime.bundled !== false) {
    runtimeFailures.push(
      `${runtime.name}: external runtime must be runtimeType=external-runtime and bundled=false`
    );
  }
  if (runtime.approvedForP0 !== true) {
    runtimeFailures.push(`${runtime.name}: approvedForP0 must be true`);
  }
  const approvedExternalLicenseException =
    runtime.bundled === false &&
    (runtime.license === "EXTERNAL-SERVICE-TERMS-NOT-BUNDLED" ||
      (runtime.name === "ffmpeg" &&
        runtime.license === "GPL-3.0-or-later"));
  if (
    !approvedExternalLicenseException &&
    (deniedLicenses.has(runtime.license) ||
      !allowedLicenses.has(runtime.license))
  ) {
    runtimeFailures.push(
      `${runtime.name}: external runtime license is not approved: ${runtime.license}`
    );
  }
  const descriptor = [runtime.name, runtime.sourceUrl, runtime.usage]
    .filter(Boolean)
    .join(" ");
  if (runtime.name !== "dreamina" && forbiddenRuntimePattern.test(descriptor)) {
    runtimeFailures.push(
      `${runtime.name}: prohibited Jimeng/Dreamina wrapper or reverse CLI runtime`
    );
  }
  const anchor = noticeAnchorFromEntry(runtime.noticeEntry);
  if (!anchor || !anchors.has(anchor)) {
    runtimeFailures.push(
      `${runtime.name}: NOTICE anchor missing: ${runtime.noticeEntry}`
    );
  }
  if (allowedLicenses.has(runtime.license)) {
    if (!runtime.licenseFile || !(await fileExists(runtime.licenseFile))) {
      runtimeFailures.push(
        `${runtime.name}: allowed-code runtime requires existing licenseFile`
      );
    }
  }
  if (runtime.name === "dreamina") {
    if (runtime.licenseFile !== null) {
      runtimeFailures.push(
        "dreamina: official binary must not be archived in third_party/licenses"
      );
    }
    if (runtime.identityVerificationRequired !== true) {
      runtimeFailures.push(
        "dreamina: identityVerificationRequired must be true"
      );
    }
  }
}

const runtimeNames = new Set((allow.externalRuntimes ?? []).map((item) => item.name));
if (!runtimeNames.has("dreamina") || !runtimeNames.has("hermes-agent")) {
  runtimeFailures.push(
    "required external runtimes dreamina and hermes-agent must be explicitly registered"
  );
}
if (runtimeFailures.length) {
  fail("EXTERNAL_RUNTIME_POLICY_BLOCK", runtimeFailures);
}

const vendorPaths = ["vendor", "third_party/bin", "third_party/vendor"];
const vendorFiles = [];
for (const vendorPath of vendorPaths) {
  if (await dirHasFiles(vendorPath)) vendorFiles.push(vendorPath);
}
if (vendorFiles.length && !(allow.vendorEntries ?? []).length) {
  fail(
    "UNREGISTERED_VENDOR_OR_BINARY",
    vendorFiles.map((item) => `${item}: files present without vendorEntries allowlist`)
  );
}

console.log(
  `LICENSE_GATE_PASS packages=${discovered.length} external_runtimes=${runtimeNames.size}`
);
