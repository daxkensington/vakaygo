// Extract exact production statements without importing the app or accessing a DB.
// Feed only to the isolated synthetic PostgreSQL fixture; all writes roll back.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function queries(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const result = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query") {
      const value = node.arguments[0];
      if (value && (ts.isNoSubstitutionTemplateLiteral(value) || ts.isStringLiteral(value))) {
        result.push(vm.runInNewContext(value.getText(file), {}, { timeout: 1000 }));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}
const attribution = queries("server/outreach-attribution.ts");
const legacy = queries("app/api/outreach/unsubscribe/route.ts");
const bindings = {
  "-- SERVICE_VISIT_SQL": attribution.filter(value => value.trimStart().startsWith("INSERT INTO outreach_claim_attributions")),
  "-- SERVICE_APPROVE_SQL": attribution.filter(value => value.trimStart().startsWith("UPDATE outreach_claim_attributions")),
  "-- SERVICE_UNSUBSCRIBE_SQL": attribution.filter(value => value.includes("WITH target AS") && value.includes("INSERT INTO outreach_email_suppressions")),
  "-- LEGACY_MARK_SQL": legacy.filter(value => value.trimStart().startsWith("INSERT INTO business_outreach")),
  "-- LEGACY_GLOBAL_SQL": legacy.filter(value => value.includes("WITH sources AS") && value.includes("INSERT INTO outreach_email_suppressions")),
};
let sql = fs.readFileSync(path.join(__dirname, "outreach-attribution.sql"), "utf8");
for (const [marker, values] of Object.entries(bindings)) {
  if (values.length !== 1 || !sql.includes(marker)) throw new Error("Attribution SQL binding changed; review the guard harness.");
  sql = sql.replace(marker, () => values[0]);
}
process.stdout.write(sql);
