import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function walk(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return entry.name.endsWith(".snap") ? [] : [relative];
  });
}
const files = ["app", "lib", "scripts", "tests"].flatMap(walk);
const issues = [];
for (const relative of files) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  if (/\bdebugger\s*;/.test(source)) issues.push(`${relative}: debugger statement`);
  if (!relative.startsWith("scripts\\") && !relative.startsWith("scripts/") && /console\.log\s*\(/.test(source)) issues.push(`${relative}: console.log is not allowed`);
}
if (issues.length) { console.error(issues.join("\n")); process.exit(1); }
console.log(`Static hygiene lint passed for ${files.length} source files.`);
