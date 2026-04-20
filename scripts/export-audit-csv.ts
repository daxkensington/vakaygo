/**
 * Export all audit issues (descriptions + prices) to a single CSV for
 * manual review / spreadsheet handoff.
 *
 *   DATABASE_URL=... npx tsx scripts/export-audit-csv.ts > audit-issues.csv
 */

import { spawnSync } from "node:child_process";

type Issue = {
  listingId: string;
  title: string;
  type: string;
  island: string;
  issue: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

function runJson(script: string): Issue[] {
  const r = spawnSync("npx", ["tsx", script, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
    shell: true,
  });
  if (r.status !== 0) {
    process.stderr.write(`Failed to run ${script}: ${r.stderr}\n`);
    return [];
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    process.stderr.write(`Could not parse JSON from ${script}\n`);
    return [];
  }
}

function csvEscape(s: string): string {
  const needsQuote = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

const all: Issue[] = [
  ...runJson("scripts/audit-descriptions.ts"),
  ...runJson("scripts/audit-prices.ts"),
];

// Stable severity ordering for the CSV
const sevRank = { high: 0, medium: 1, low: 2 } as const;
all.sort((a, b) =>
  sevRank[a.severity] - sevRank[b.severity] ||
  a.issue.localeCompare(b.issue) ||
  a.island.localeCompare(b.island),
);

process.stdout.write(
  "severity,issue,listingId,title,type,island,detail\n",
);
for (const i of all) {
  process.stdout.write(
    [i.severity, i.issue, i.listingId, i.title, i.type, i.island, i.detail]
      .map((v) => csvEscape(String(v)))
      .join(",") + "\n",
  );
}

process.stderr.write(`\nWrote ${all.length} issues\n`);
