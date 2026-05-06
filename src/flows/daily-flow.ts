import { getEnv } from "../config/env.js";
import { fetchFeatures, fetchTarefas } from "../tools/clickup-reports.js";
import { ensureMonthPage, createReportPage, findChildPageByName } from "../tools/clickup-docs.js";
import { montarMarkdownDaily } from "../reports/format.js";

function formatPageName(now: Date, timezone: string): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [yyyy, mm, dd] = ymd.split("-");
  return `${dd}/${mm}/${(yyyy ?? "").slice(-2)}`;
}

export interface DailyFlowResult {
  status: "created" | "exists";
  pageName: string;
  pageId?: string;
  taskCounts: { features: number; tarefas: number };
}

export async function runDailyFlow(now: Date = new Date()): Promise<DailyFlowResult> {
  const env = getEnv();
  const tz = env.REPORTS_TIMEZONE;
  const pageName = formatPageName(now, tz);
  console.log(`[daily-flow] iniciando (página "${pageName}")`);

  const [features, tarefas] = await Promise.all([fetchFeatures(), fetchTarefas()]);
  console.log(`[daily-flow] features=${features.length}, tarefas=${tarefas.length}`);

  const markdown = montarMarkdownDaily({ features, tarefas, now });
  console.log(`[daily-flow] markdown built (${markdown.length} chars)`);

  const monthPage = await ensureMonthPage(env.CLICKUP_REPORTS_DAILY_PARENT_ID, now);
  const existing = await findChildPageByName(monthPage.id, pageName);
  if (existing) {
    console.warn(`[daily-flow] página "${pageName}" já existe (id=${existing.id}); pulando.`);
    return {
      status: "exists",
      pageName,
      pageId: existing.id,
      taskCounts: { features: features.length, tarefas: tarefas.length },
    };
  }

  const created = await createReportPage(monthPage.id, pageName, markdown);
  console.log(`[daily-flow] page ${created.status}: id=${created.page.id}`);

  return {
    status: created.status,
    pageName,
    pageId: created.page.id,
    taskCounts: { features: features.length, tarefas: tarefas.length },
  };
}
