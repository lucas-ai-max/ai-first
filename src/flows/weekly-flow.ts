import { getEnv } from "../config/env.js";
import {
  fetchFeaturesClosedLastWeek,
  fetchTarefasClosedLastWeek,
} from "../tools/clickup-reports.js";
import { ensureMonthPage, createReportPage, findChildPageByName } from "../tools/clickup-docs.js";
import { montarMarkdownWeekly } from "../reports/format.js";

function formatDM(date: Date, timezone: string): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [, mm, dd] = ymd.split("-");
  return `${dd}/${mm}`;
}

function formatPageName(date: Date, timezone: string): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const [yyyy, mm, dd] = ymd.split("-");
  return `${dd}/${mm}/${(yyyy ?? "").slice(-2)}`;
}

export interface WeeklyFlowResult {
  status: "created" | "exists";
  pageName: string;
  pageId?: string;
  taskCounts: { features: number; tarefas: number };
}

export async function runWeeklyFlow(now: Date = new Date()): Promise<WeeklyFlowResult> {
  const env = getEnv();
  const tz = env.REPORTS_TIMEZONE;
  const fimSemana = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const inicioSemana = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const intervaloLabel = `${formatDM(inicioSemana, tz)} a ${formatDM(fimSemana, tz)}`;
  const pageName = formatPageName(now, tz);
  console.log(`[weekly-flow] iniciando (página "${pageName}", intervalo ${intervaloLabel})`);

  const [features, tarefas] = await Promise.all([
    fetchFeaturesClosedLastWeek(),
    fetchTarefasClosedLastWeek(),
  ]);
  console.log(
    `[weekly-flow] concluídas na semana: features=${features.length}, tarefas=${tarefas.length}`,
  );

  const markdown = montarMarkdownWeekly({ features, tarefas, intervaloLabel, now });
  console.log(`[weekly-flow] markdown built (${markdown.length} chars)`);

  const monthPage = await ensureMonthPage(env.CLICKUP_REPORTS_WEEKLY_PARENT_ID, now);
  const existing = await findChildPageByName(monthPage.id, pageName);
  if (existing) {
    console.warn(`[weekly-flow] página "${pageName}" já existe (id=${existing.id}); pulando.`);
    return {
      status: "exists",
      pageName,
      pageId: existing.id,
      taskCounts: { features: features.length, tarefas: tarefas.length },
    };
  }

  const created = await createReportPage(monthPage.id, pageName, markdown);
  console.log(`[weekly-flow] page ${created.status}: id=${created.page.id}`);

  return {
    status: created.status,
    pageName,
    pageId: created.page.id,
    taskCounts: { features: features.length, tarefas: tarefas.length },
  };
}
