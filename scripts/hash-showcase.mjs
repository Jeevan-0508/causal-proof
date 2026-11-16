import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "out", "showcase");
if (!fs.existsSync(root)) {
  console.error("SHOWCASE_ARTIFACT_MISSING: run npm run build:showcase first.");
  process.exit(1);
}
const files = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(filename);
    else files.push(filename);
  }
}
collect(root);
files.sort();
const manifest = files.map((filename) => ({ path: path.relative(root, filename).replaceAll(path.sep, "/"), sha256: crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex"), bytes: fs.statSync(filename).size }));
const artifactHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
console.log(JSON.stringify({ artifactRoot: "out/showcase", fileCount: manifest.length, artifactSha256: artifactHash, files: manifest }, null, 2));
