#!/usr/bin/env node
// Strip now-unused imports/SECRET in operator routes that delegate to requireOperator.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `grep -rl "requireOperator" app/api/operator || true`,
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);

let changed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let src = original;

  // Count usages of each symbol outside its import line.
  const usesJwt = (src.match(/jwtVerify/g) || []).length > 1;
  const usesCookies = (src.match(/cookies\(\)/g) || []).length > 0;
  const usesSecret = (src.match(/\bSECRET\b/g) || []).length > 1;

  if (!usesJwt) {
    src = src.replace(/^import \{ jwtVerify \} from "jose";\s*\n/m, "");
  }
  if (!usesCookies) {
    src = src.replace(/^import \{ cookies \} from "next\/headers";\s*\n/m, "");
  }
  if (!usesSecret) {
    src = src.replace(
      /^const SECRET = new TextEncoder\(\)\.encode\(process\.env\.AUTH_SECRET!\);\s*\n/m,
      ""
    );
  }

  if (src !== original) {
    writeFileSync(file, src);
    changed++;
  }
}

console.log(`Cleaned ${changed} files`);
