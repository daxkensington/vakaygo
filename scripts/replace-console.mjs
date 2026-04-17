#!/usr/bin/env node
// Replace console.error / console.warn / console.log calls in app/api/**
// with structured logger calls, and add the import where needed.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = process.cwd();
const files = execSync(
  `grep -rl "console\\." app/api server lib --include="*.ts" --include="*.tsx" || true`,
  { cwd: root, encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  // skip the logger itself
  .filter((f) => !f.endsWith("lib/logger.ts"))
  // skip env (it's runtime guards, no logger dep)
  .filter((f) => !f.endsWith("lib/env.ts"));

let changed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let src = original;

  // console.error("msg:", err)  → logger.error("msg", err)
  // console.error("msg", err)   → logger.error("msg", err)
  src = src.replace(
    /console\.error\(\s*"([^"]+?):?"\s*,\s*([^)]+?)\)/g,
    'logger.error("$1", $2)'
  );
  // console.error("msg")        → logger.error("msg")
  src = src.replace(
    /console\.error\(\s*"([^"]+?)"\s*\)/g,
    'logger.error("$1")'
  );
  // console.warn(...) → logger.warn(...)
  src = src.replace(
    /console\.warn\(\s*"([^"]+?):?"\s*,\s*([^)]+?)\)/g,
    'logger.warn("$1", { extra: $2 })'
  );
  src = src.replace(
    /console\.warn\(\s*"([^"]+?)"\s*\)/g,
    'logger.warn("$1")'
  );
  // console.log(...) → logger.info(...) (only msg + optional ctx)
  src = src.replace(
    /console\.log\(\s*"([^"]+?):?"\s*,\s*([^)]+?)\)/g,
    'logger.info("$1", { extra: $2 })'
  );
  src = src.replace(
    /console\.log\(\s*"([^"]+?)"\s*\)/g,
    'logger.info("$1")'
  );

  if (src === original) continue;

  // Insert logger import if needed
  if (/\blogger\./.test(src) && !/from\s+["']@\/lib\/logger["']/.test(src)) {
    // Insert after the last import statement
    const importRe = /^import [^;]+;\s*$/gm;
    let lastEnd = 0;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd > 0) {
      src =
        src.slice(0, lastEnd) +
        '\nimport { logger } from "@/lib/logger";' +
        src.slice(lastEnd);
    } else {
      src = 'import { logger } from "@/lib/logger";\n' + src;
    }
  }

  writeFileSync(file, src);
  changed++;
}

console.log(`Updated ${changed} files`);
