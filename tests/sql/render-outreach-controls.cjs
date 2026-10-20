// Execute only against an isolated synthetic database. All fixture writes roll back.
// Usage: node tests/sql/render-outreach-controls.cjs | psql <fixture URL> -v ON_ERROR_STOP=1
// Compile the actual service, without loading its imports or connecting to any DB,
// then extract the exact three production mutation statements through the TS AST.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "server/outreach-campaign-control.ts"), "utf8");
const file = ts.createSourceFile("control.ts", source, ts.ScriptTarget.Latest, true);
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const context = vm.createContext({ exports: {}, require: () => ({}) });
vm.runInContext(compiled, context, { timeout: 1000 });
const queries = [];
const reportQueries = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === "tx.query" && ts.isTemplateExpression(node.arguments[0])) {
    queries.push(vm.runInContext(node.arguments[0].getText(file), context, { timeout: 1000 }));
  }
  if (ts.isCallExpression(node) && node.expression.getText(file) === "sql.query" && ts.isTemplateExpression(node.arguments[0])) {
    const query = vm.runInContext(node.arguments[0].getText(file), context, { timeout: 1000 });
    if (query.includes("FROM snapshot s")) reportQueries.push(query);
  }
  ts.forEachChild(node, visit);
}
visit(file);
const bindings = {
  "-- SERVICE_GRANT_SQL": queries.filter(query => query.includes("INSERT INTO outreach_recipient_consents")),
  "-- SERVICE_REVOKE_SQL": queries.filter(query => query.includes("UPDATE outreach_recipient_consents")),
  "-- SERVICE_CONTROL_SQL": queries.filter(query => query.includes("UPDATE outreach_campaign_control")),
  "-- SERVICE_REPORT_SQL": reportQueries,
};
let sql = fs.readFileSync(path.join(__dirname, "outreach-controls.sql"), "utf8");
for (const [marker, values] of Object.entries(bindings)) {
  if (values.length !== 1 || !sql.includes(marker)) throw new Error("Campaign SQL binding changed; review the guard harness.");
  sql = sql.replace(marker, () => values[0]);
}
process.stdout.write(sql);
