// Render the exact trusted-contact snapshot from migration0006 into synthetic SQL assertions.
// Usage: node tests/sql/render-business-onboarding.cjs | psql <synthetic database only>
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"../..");
const migration = fs.readFileSync(path.join(root,"drizzle/migrations/0006_business_onboarding.sql"),"utf8");
const snapshot = migration.split("--> statement-breakpoint").find(statement => statement.includes("INSERT INTO listing_trusted_contacts"));
if (!snapshot) throw new Error("Migration trusted-contact snapshot was not found");
const assertions = fs.readFileSync(path.join(__dirname,"business-onboarding.sql"),"utf8");
process.stdout.write(assertions.replace("-- MIGRATION_CONTACT_SNAPSHOT",()=>snapshot));
