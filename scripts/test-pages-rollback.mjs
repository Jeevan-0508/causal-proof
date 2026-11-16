import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const source = path.resolve(process.cwd(), "out", "showcase");
if (!fs.existsSync(path.join(source, "index.html"))) {
  console.error("SHOWCASE_ARTIFACT_MISSING: run npm run build:showcase first.");
  process.exit(1);
}

function copy(sourceDirectory, targetDirectory) {
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.cpSync(sourceDirectory, targetDirectory, { recursive: true });
}

function digest(directory) {
  const files = [];
  const collect = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) collect(filename);
      else files.push(filename);
    }
  };
  collect(directory);
  files.sort();
  return crypto.createHash("sha256").update(files.map((filename) => `${path.relative(directory, filename).replaceAll(path.sep, "/")}\0${fs.readFileSync(filename).toString("base64")}`).join("\n")).digest("hex");
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "causal-proof-pages-rollback-"));
try {
  const previous = path.join(root, "previous-known-good");
  const candidate = path.join(root, "candidate-failed");
  const current = path.join(root, "published");
  copy(source, previous);
  copy(source, candidate);
  const previousHash = digest(previous);
  fs.appendFileSync(path.join(candidate, "index.html"), "\n<!-- simulated failed candidate -->\n", "utf8");
  const failedCandidateHash = digest(candidate);
  if (failedCandidateHash === previousHash) throw new Error("Simulated candidate did not differ from the known-good artifact.");
  copy(candidate, current);
  if (digest(current) !== failedCandidateHash) throw new Error("Candidate publication rehearsal did not select the candidate artifact.");
  copy(previous, current);
  if (digest(current) !== previousHash) throw new Error("Rollback rehearsal did not restore the known-good artifact.");
  console.log(JSON.stringify({ status: "PASS", previousHash, failedCandidateHash, restoredHash: digest(current), restoredMatchesPrevious: true }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
