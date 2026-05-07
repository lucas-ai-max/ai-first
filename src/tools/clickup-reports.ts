import { clickupFetch } from "./clickup-mcp.js";
import { getEnv } from "../config/env.js";
import type { ReportTask } from "../reports/format.js";

interface RawClickUpTask {
  id: string;
  name: string;
  url?: string;
  status?: { status?: string; color?: string } | string;
  assignees?: Array<{ id?: number; username?: string }>;
  date_created?: string | null;
  date_done?: string | null;
  date_closed?: string | null;
  start_date?: string | null;
  due_date?: string | null;
}

interface RawListResponse {
  tasks: RawClickUpTask[];
}

const TZ_OFFSET_HOURS = -3; // BRT (sem horário de verão desde 2019)

const STATUS_TERMINAIS = new Set([
  "concluída",
  "concluida",
  "concluído",
  "concluido",
  "complete",
  "closed",
  "done",
  "fechado",
  "finalizado",
]);

function getReportsToken(): string {
  const env = getEnv();
  return env.CLICKUP_REPORTS_TOKEN || env.CLICKUP_API_TOKEN;
}

function getInicioDiaMs(date: Date): number {
  const localMs = date.getTime() + TZ_OFFSET_HOURS * 3600 * 1000;
  const ymd = new Date(localMs).toISOString().slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y as number, (m as number) - 1, d as number) - TZ_OFFSET_HOURS * 3600 * 1000;
}

async function fetchAllFromList(listId: string): Promise<RawClickUpTask[]> {
  const qs = "subtasks=false&include_closed=true&archived=false";
  const path = `/list/${listId}/task?${qs}`;
  const data = (await clickupFetch(path, { method: "GET" }, getReportsToken())) as RawListResponse;
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function statusText(s: RawClickUpTask["status"]): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return s.status ?? "";
}

function statusColor(s: RawClickUpTask["status"]): string | undefined {
  if (!s || typeof s === "string") return undefined;
  return s.color;
}

function isClosed(t: RawClickUpTask): boolean {
  return STATUS_TERMINAIS.has(statusText(t.status).toLowerCase());
}

function getDoneMs(t: RawClickUpTask): number | null {
  const raw = t.date_done ?? t.date_closed;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function assigneesToString(arr: RawClickUpTask["assignees"]): string {
  if (!arr || arr.length === 0) return "";
  return arr.map((u) => u?.username ?? "").filter(Boolean).join(", ");
}

function toReportTask(t: RawClickUpTask, statusOverride?: string, colorOverride?: string): ReportTask {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    status: statusOverride ?? statusText(t.status),
    status_color: colorOverride ?? statusColor(t.status),
    assignees: assigneesToString(t.assignees),
    date_created_ms: t.date_created ? parseInt(t.date_created, 10) : undefined,
    start_date: t.start_date ?? null,
    due_date: t.due_date ?? null,
  };
}

// ─── Open (para daily — mantém qualquer status não terminal) ──
export async function fetchOpenTasks(listId: string): Promise<ReportTask[]> {
  const all = await fetchAllFromList(listId);
  return all.filter((t) => !isClosed(t)).map((t) => toReportTask(t));
}

// ─── Concluídas no dia anterior ───────────────────────────────
export async function fetchClosedYesterday(listId: string): Promise<ReportTask[]> {
  const inicioHoje = getInicioDiaMs(new Date());
  const inicioOntem = inicioHoje - 24 * 3600 * 1000;
  const fimOntem = inicioHoje - 1;
  const all = await fetchAllFromList(listId);
  return all
    .filter((t) => isClosed(t))
    .filter((t) => {
      const dd = getDoneMs(t);
      return dd !== null && dd >= inicioOntem && dd <= fimOntem;
    })
    .map((t) => toReportTask(t, "Concluída ontem", "#008844"));
}

// ─── Concluídas nos últimos 7 dias (excluindo hoje) ───────────
export async function fetchClosedLastWeek(listId: string): Promise<ReportTask[]> {
  const inicioHoje = getInicioDiaMs(new Date());
  const inicioSemana = inicioHoje - 7 * 24 * 3600 * 1000;
  const fimSemana = inicioHoje - 1;
  const all = await fetchAllFromList(listId);
  return all
    .filter((t) => isClosed(t))
    .filter((t) => {
      const dd = getDoneMs(t);
      return dd !== null && dd >= inicioSemana && dd <= fimSemana;
    })
    .map((t) => toReportTask(t, "Concluída na semana", "#008844"));
}

// ─── Wrappers usados pelos flows ──────────────────────────────
export async function fetchFeatures(): Promise<ReportTask[]> {
  const env = getEnv();
  const listId = env.CLICKUP_REPORTS_FEATURES_LIST;
  const [open, closed] = await Promise.all([fetchOpenTasks(listId), fetchClosedYesterday(listId)]);
  return [...open, ...closed];
}

export async function fetchTarefas(): Promise<ReportTask[]> {
  const env = getEnv();
  const listId = env.CLICKUP_REPORTS_TAREFAS_LIST;
  const [open, closed] = await Promise.all([fetchOpenTasks(listId), fetchClosedYesterday(listId)]);
  return [...open, ...closed];
}

export async function fetchFeaturesClosedLastWeek(): Promise<ReportTask[]> {
  return fetchClosedLastWeek(getEnv().CLICKUP_REPORTS_FEATURES_LIST);
}

export async function fetchTarefasClosedLastWeek(): Promise<ReportTask[]> {
  return fetchClosedLastWeek(getEnv().CLICKUP_REPORTS_TAREFAS_LIST);
}

// Wrappers usados pelo weekly: open atuais + concluídas semana passada,
// pra a categorização (atrasadas, pausadas, programadas, etc) acontecer no format.
export async function fetchFeaturesWeekly(): Promise<ReportTask[]> {
  const env = getEnv();
  const listId = env.CLICKUP_REPORTS_FEATURES_LIST;
  const [open, closed] = await Promise.all([fetchOpenTasks(listId), fetchClosedLastWeek(listId)]);
  return [...open, ...closed];
}

export async function fetchTarefasWeekly(): Promise<ReportTask[]> {
  const env = getEnv();
  const listId = env.CLICKUP_REPORTS_TAREFAS_LIST;
  const [open, closed] = await Promise.all([fetchOpenTasks(listId), fetchClosedLastWeek(listId)]);
  return [...open, ...closed];
}
