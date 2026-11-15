import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const files = execFileSync(process.platform === "win32" ? "rg.exe" : "rg", ["--files", "app", "lib", "scripts", "tests", "--glob", "!**/*.snap"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const issues = [];
for (const relative of files) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  if (/\bdebugger\s*;/.test(source)) issues.push(`${relative}: debugger statement`);
  if (!relative.startsWith("scripts\\") && !relative.startsWith("scripts/") && /console\.log\s*\(/.test(source)) issues.push(`${relative}: console.log is not allowed`);
}
if (issues.length) { console.error(issues.join("\n")); process.exit(1); }
console.log(`Static hygiene lint passed for ${files.length} source files.`);
