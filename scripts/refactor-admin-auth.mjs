#!/usr/bin/env node
// Refactor app/api/admin/** routes to use the shared requireAdmin helper.
// Removes per-file SECRET, jose imports, and inline verifyAdmin/requireAdmin definitions.
// Rewrites callsites to the new {ok, userId, error} discriminated union.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = process.cwd();
const files = execSync(
  `grep -rl "function verifyAdmin\\|function requireAdmin" app/api/admin || true`,
  { cwd: root, encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);

let changed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let src = original;

  // Drop the local SECRET constant (uses process.env.AUTH_SECRET!)
  src = src.replace(
    /\nconst SECRET = new TextEncoder\(\)\.encode\(process\.env\.AUTH_SECRET!\);\n/g,
    "\n"
  );

  // Drop the inline verifyAdmin block (returns string | null).
  src = src.replace(
    /\nasync function verifyAdmin\(\)[^{]*\{[\s\S]*?\n\}\n/m,
    "\n"
  );

  // Drop the inline requireAdmin block (returns { userId, error? }).
  src = src.replace(
    /\nasync function requireAdmin\(\)[^{]*\{[\s\S]*?\n\}\n/m,
    "\n"
  );

  // Drop the cookies import if it's no longer used (only verifyAdmin used it).
  if (!/cookies\(\)/.test(src)) {
    src = src.replace(
      /\nimport \{ cookies \} from "next\/headers";\n/g,
      "\n"
    );
  }
  // Drop the jose import if it's no longer used.
  if (!/jwtVerify/.test(src)) {
    src = src.replace(/\nimport \{ jwtVerify \} from "jose";\n/g, "\n");
  }

  // Pattern A: const X = await verifyAdmin(); if (!X) return NextResponse.json({error:...},{status:403});
  src = src.replace(
    /const (\w+) = await verifyAdmin\(\);\s*\n\s*if \(!\1\) \{\s*\n\s*return NextResponse\.json\([^)]+\);\s*\n\s*\}/g,
    (_m, name) =>
      `const __auth = await requireAdmin();\n  if (!__auth.ok) return __auth.error;\n  const ${name} = __auth.userId;`
  );

  // Pattern A short form: const X = await verifyAdmin(); if (!X) return NextResponse.json(...);
  src = src.replace(
    /const (\w+) = await verifyAdmin\(\);\s*\n\s*if \(!\1\) return NextResponse\.json\([^;]+;\n/g,
    (_m, name) =>
      `const __auth = await requireAdmin();\n  if (!__auth.ok) return __auth.error;\n  const ${name} = __auth.userId;\n`
  );

  // Pattern B (existing requireAdmin):
  // const auth = await requireAdmin(); if (auth.error) return auth.error;
  src = src.replace(
    /const (\w+) = await requireAdmin\(\);\s*\n\s*if \(\1\.error\) return \1\.error;/g,
    (_m, name) =>
      `const ${name} = await requireAdmin();\n    if (!${name}.ok) return ${name}.error;`
  );

  // Bare verifyAdmin remaining call → requireAdmin via auth.userId
  src = src.replace(
    /await verifyAdmin\(\)/g,
    "(await requireAdmin()).userId"
  );

  if (src === original) continue;

  // Add the import if not present
  if (
    /requireAdmin\(\)/.test(src) &&
    !/from\s+["']@\/server\/admin-auth["']/.test(src)
  ) {
    const importRe = /^import [^;]+;\s*$/gm;
    let lastEnd = 0;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    src =
      src.slice(0, lastEnd) +
      '\nimport { requireAdmin } from "@/server/admin-auth";' +
      src.slice(lastEnd);
  }

  writeFileSync(file, src);
  changed++;
}

console.log(`Updated ${changed} files`);
