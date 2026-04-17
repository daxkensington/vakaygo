#!/usr/bin/env node
// Refactor app/api/operator/** routes to use the shared requireOperator helper.
// Two patterns to handle:
//   A) Inline (per-handler):
//      const cookieStore = await cookies();
//      const token = cookieStore.get("session")?.value;
//      if (!token) return NextResponse.json({error:"Unauthorized"},{status:401});
//      const { payload } = await jwtVerify(token, SECRET);
//      const <name> = payload.id as string;
//   B) Helper function getOperatorId() { ... } returning string|null
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = process.cwd();
const files = execSync(
  `grep -rl "jwtVerify" app/api/operator || true`,
  { cwd: root, encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean);

let changed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let src = original;

  // Pattern A inline (in a try block):
  // const cookieStore = await cookies();
  //     const token = cookieStore.get("session")?.value;
  //
  //     if (!token) return NextResponse.json({error:"Unauthorized"},{status:401});
  //
  //     const { payload } = await jwtVerify(token, SECRET);
  //     const <name> = payload.id as string;
  src = src.replace(
    /const cookieStore = await cookies\(\);\s*\n\s*const token = cookieStore\.get\("session"\)\?\.value;\s*\n\s*\n?\s*if \(!token\) \{?\s*\n?\s*return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);\s*\n?\s*\}?\s*\n\s*\n?\s*const \{ payload \} = await jwtVerify\(token, SECRET\);\s*\n\s*const (\w+) = payload\.id as string;/g,
    (_m, name) =>
      `const __auth = await requireOperator();\n    if (!__auth.ok) return __auth.error;\n    const ${name} = __auth.userId;`
  );

  // Pattern B helper getOperatorId()
  src = src.replace(
    /\nasync function getOperatorId\(\)[^{]*\{[\s\S]*?\n\}\n/m,
    "\n"
  );

  // Replace `await getOperatorId()` callsites with helper inline
  // const X = await getOperatorId(); if (!X) return NextResponse.json(...,401);
  src = src.replace(
    /const (\w+) = await getOperatorId\(\);\s*\n\s*if \(!\1\) \{?\s*\n?\s*return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);\s*\n?\s*\}?/g,
    (_m, name) =>
      `const __auth = await requireOperator();\n    if (!__auth.ok) return __auth.error;\n    const ${name} = __auth.userId;`
  );

  // Drop SECRET if jwtVerify is gone
  if (!/jwtVerify/.test(src)) {
    src = src.replace(
      /\nconst SECRET = new TextEncoder\(\)\.encode\(process\.env\.AUTH_SECRET!\);\n/g,
      "\n"
    );
    src = src.replace(/\nimport \{ jwtVerify \} from "jose";\n/g, "\n");
  }
  if (!/cookies\(\)/.test(src)) {
    src = src.replace(/\nimport \{ cookies \} from "next\/headers";\n/g, "\n");
  }

  if (src === original) continue;

  if (
    /requireOperator\(\)/.test(src) &&
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
      '\nimport { requireOperator } from "@/server/admin-auth";' +
      src.slice(lastEnd);
  }

  writeFileSync(file, src);
  changed++;
}

console.log(`Updated ${changed} files`);
