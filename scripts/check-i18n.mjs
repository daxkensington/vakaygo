#!/usr/bin/env node
// Verify all message locales have the same key set as en.json (the source of truth).
// Exits non-zero on drift; prints missing/extra keys per locale.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
if (!files.includes("en.json")) {
  console.error("en.json not found in messages/");
  process.exit(2);
}

function flatten(obj, prefix = "") {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const child of flatten(v, path)) out.add(child);
    } else {
      out.add(path);
    }
  }
  return out;
}

const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
const enKeys = flatten(en);

let drift = 0;
for (const file of files) {
  if (file === "en.json") continue;
  const locale = file.replace(".json", "");
  const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const keys = flatten(data);

  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  if (missing.length || extra.length) {
    drift++;
    console.log(`\n[${locale}] ${missing.length} missing, ${extra.length} extra`);
    if (missing.length) console.log("  missing:", missing.slice(0, 10).join(", ") + (missing.length > 10 ? ` (+${missing.length - 10} more)` : ""));
    if (extra.length) console.log("  extra:  ", extra.slice(0, 10).join(", ") + (extra.length > 10 ? ` (+${extra.length - 10} more)` : ""));
  } else {
    console.log(`[${locale}] ok (${keys.size} keys)`);
  }
}

if (drift > 0) {
  console.error(`\n${drift} locale(s) have drift from en.json`);
  process.exit(1);
}
