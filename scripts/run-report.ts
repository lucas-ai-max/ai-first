import "dotenv/config";
import { runDailyFlow } from "../src/flows/daily-flow.js";
import { runWeeklyFlow } from "../src/flows/weekly-flow.js";
import { getEnv } from "../src/config/env.js";

async function main(): Promise<void> {
  const arg = (process.argv[2] ?? "daily").toLowerCase();
  const env = getEnv();

  if (arg === "daily") {
    const r = await runDailyFlow();
    console.log("\n[run-report] DAILY result:", JSON.stringify(r, null, 2));
    if (r.pageId) {
      console.log(
        `[run-report] URL: https://app.clickup.com/${env.CLICKUP_REPORTS_TEAM_ID}/v/dc/${env.CLICKUP_REPORTS_DOC_ID}/${r.pageId}`,
      );
    }
  } else if (arg === "weekly") {
    const r = await runWeeklyFlow();
    console.log("\n[run-report] WEEKLY result:", JSON.stringify(r, null, 2));
    if (r.pageId) {
      console.log(
        `[run-report] URL: https://app.clickup.com/${env.CLICKUP_REPORTS_TEAM_ID}/v/dc/${env.CLICKUP_REPORTS_DOC_ID}/${r.pageId}`,
      );
    }
  } else {
    console.error(`uso: tsx scripts/run-report.ts <daily|weekly>  (recebido: "${arg}")`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[run-report] FALHA:", err);
  process.exit(1);
});
