import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "showcase", "src");
const artifactRoot = path.join(root, "out", "showcase");
const sourceFiles = [];
const artifactFiles = [];

function collect(directory, output) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(filename, output);
    else output.push(filename);
  }
}

collect(sourceRoot, sourceFiles);
collect(artifactRoot, artifactFiles);
if (!artifactFiles.length) {
  console.error("SHOWCASE_ARTIFACT_MISSING: run npm run build:showcase first.");
  process.exit(1);
}

const sourceImportPattern = /(?:from|import\s*\()\s*["'][^"']*(?:lib[\\/]persistence|lib[\\/]security|lib[\\/]copilot|app[\\/]api|better-sqlite3|node:)[^"']*["']/i;
const prohibitedArtifactPatterns = [
  /better-sqlite3/i,
  /CAUSAL_PROOF_(?:DB|KEY|ANCHOR|BOOTSTRAP)/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:\.sqlite3?|\.db(?:-wal|-shm)?|\.private\.pem|\.env(?:\.|\b))/i,
  /(?:password|passphrase|secret[_ -]?key|authorization)\s*[:=]\s*["'`][^"'`]{8,}/i,
  /(?:^|["'`])(?:\/api\/|app\/api)/i,
  /(?:lib[\\/]persistence|lib[\\/]security|lib[\\/]copilot)/i,
];
const failures = [];

for (const filename of sourceFiles) {
  const content = fs.readFileSync(filename, "utf8");
  if (sourceImportPattern.test(content)) failures.push(`PRIVILEGED_SOURCE_IMPORT: ${path.relative(root, filename)}`);
}
for (const filename of artifactFiles) {
  const content = fs.readFileSync(filename, "utf8");
  for (const pattern of prohibitedArtifactPatterns) if (pattern.test(content)) failures.push(`PROHIBITED_ARTIFACT_CONTENT: ${pattern} in ${path.relative(root, filename)}`);
}

const index = path.join(artifactRoot, "index.html");
if (!fs.existsSync(index)) failures.push("INDEX_MISSING: out/showcase/index.html");
else if (!fs.readFileSync(index, "utf8").includes("/causal-proof/")) failures.push("BASE_PATH_MISSING: emitted index does not reference the GitHub Pages base path.");

if (failures.length) {
  console.error("SHOWCASE_VERIFICATION_FAILED");
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`Showcase verification passed: ${sourceFiles.length} source files and ${artifactFiles.length} emitted files scanned.`);
