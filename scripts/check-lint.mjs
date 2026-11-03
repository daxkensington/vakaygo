import { ESLint } from "eslint";
const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
if (errors || warnings) {
  console.error((await eslint.loadFormatter("stylish")).format(results.filter(result => result.errorCount || result.warningCount)));
  process.exitCode = 1;
}
console.log(JSON.stringify({ errors, warnings }));
