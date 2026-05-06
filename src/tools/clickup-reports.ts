import { clickupFetch } from "./clickup-mcp.js";
import { getEnv } from "../config/env.js";
import type { ReportTask } from "../reports/format.js";

interface RawClickUpTask {
  id: string;
  name: string;
  url?: string;
  status?: { status?: string } | string;
  assignees?: Array<{ id?: number; username?: string }>;
  date_created?: string | null;
  due_date?: string | null;
}

interface RawListResponse {
  tasks: RawClickUpTask[];
}

function getReportsToken(): string {
  const env = getEnv();
  return env.CLICKUP_REPORTS_TOKEN || env.CLICKUP_API_TOKEN;
}

function buildStatusQuery(statuses: string[]): string {
  return statuses.map((s) => `statuses[]=${encodeURIComponent(s)}`).join("&");
}

function activeStatuses(): string[] {
  return getEnv()
    .REPORTS_ACTIVE_STATUSES.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchActiveTasksFromList(listId: string): Promise<RawClickUpTask[]> {
  const statuses = activeStatuses();
  const qs = [buildStatusQuery(statuses), "subtasks=false", "include_closed=false"].join("&");
  const path = `/list/${listId}/task?${qs}`;
  const data = (await clickupFetch(path, { method: "GET" }, getReportsToken())) as RawListResponse;
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function statusText(s: RawClickUpTask["status"]): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return s.status ?? "";
}

function assigneesToString(arr: RawClickUpTask["assignees"]): string {
  if (!arr || arr.length === 0) return "";
  return arr.map((u) => u?.username ?? "").filter(Boolean).join(", ");
}

function toReportTask(t: RawClickUpTask): ReportTask {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    status: statusText(t.status),
    assignees: assigneesToString(t.assignees),
    date_created_ms: t.date_created ? parseInt(t.date_created, 10) : undefined,
    due_date: t.due_date ?? null,
  };
}

export async function fetchFeatures(): Promise<ReportTask[]> {
  const env = getEnv();
  const raw = await fetchActiveTasksFromList(env.CLICKUP_REPORTS_FEATURES_LIST);
  return raw.map(toReportTask);
}

export async function fetchTarefas(): Promise<ReportTask[]> {
  const env = getEnv();
  const raw = await fetchActiveTasksFromList(env.CLICKUP_REPORTS_TAREFAS_LIST);
  return raw.map(toReportTask);
}
