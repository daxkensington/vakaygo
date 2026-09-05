import { ESLint } from "eslint";
import fs from "node:fs";
import path from "node:path";
const results = await new ESLint().lintFiles(["."]);
const baseline = JSON.parse(fs.readFileSync(new URL("../eslint-baseline.json",import.meta.url),"utf8"));
const counts = {};
for (const result of results) for (const message of result.messages) {
  if (message.severity !== 2) continue;
  const key = path.relative(process.cwd(),result.filePath).replaceAll(path.sep,"/")+"|"+(message.ruleId || "parser");
  counts[key]=(counts[key]||0)+1;
}
const increases = Object.entries(counts).filter(([key,count])=>count>(baseline[key]||0));
if(increases.length){console.error("New lint errors:",Object.fromEntries(increases));process.exitCode=1;}
console.log(JSON.stringify({errors:Object.values(counts).reduce((a,b)=>a+b,0),newErrors:increases.length}));
