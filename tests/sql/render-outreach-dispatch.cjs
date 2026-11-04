// Usage: node tests/sql/render-outreach-dispatch.cjs | psql <isolated fixture URL> -v ON_ERROR_STOP=1
// Extract the exact final SELECT through the TypeScript AST, without imports,
// provider calls or a connection. All generated fixture writes roll back.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "server/outreach-campaign-send.ts"), "utf8");
const file = ts.createSourceFile("send.ts", source, ts.ScriptTarget.Latest, true);
const queries = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === "sql.query" &&
      ts.isNoSubstitutionTemplateLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith("SELECT a.id FROM outreach_email_attempts")) queries.push(node.arguments[0].text);
  ts.forEachChild(node, visit);
}
visit(file);
const marker = "-- SERVICE_DISPATCH_SQL";
let sql = fs.readFileSync(path.join(__dirname, "outreach-dispatch.sql"), "utf8");
if (queries.length !== 1 || !sql.includes(marker)) throw new Error("Dispatch SQL binding changed; review the guard harness.");
sql = sql.replace(marker, () => queries[0]);
process.stdout.write(sql);
