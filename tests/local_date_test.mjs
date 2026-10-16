// "Today" in the frontend must be the user's LOCAL calendar date (the backend
// validates against Asia/Manila). toISOString() gives the UTC date, which is
// yesterday between 00:00 and 07:59 in the Philippines.
// Usage: node tests/local_date_test.mjs   (sets TZ itself)
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
if (process.env.TZ !== "Asia/Manila") {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { stdio: "inherit", env: { ...process.env, TZ: "Asia/Manila" } });
  process.exit(0);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const { localDateISO } = await import(pathToFileURL(join(root, "frontend/src/utils/dates.js")).href);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const at = (iso) => new Date(iso);
ok(localDateISO(at("2026-10-16T02:30:00+08:00")) === "2026-10-16", "02:30 Manila is still Oct 16 (UTC would say Oct 15)");
ok(localDateISO(at("2026-10-16T00:00:00+08:00")) === "2026-10-16", "midnight Manila starts the new day");
ok(localDateISO(at("2026-10-16T23:59:00+08:00")) === "2026-10-16", "23:59 Manila is the same day");
ok(localDateISO(at("2026-01-05T07:59:00+08:00")) === "2026-01-05", "single-digit month/day are zero-padded");
console.log(`\nLOCAL DATE TEST: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
