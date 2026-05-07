import { getEquipe, extrairNomesAssignees, identificarDono } from "./team.js";
import type { TeamMember } from "./team.js";

export interface ReportTask {
  id?: string;
  name: string;
  url?: string;
  status?: string | { status?: string; color?: string };
  status_color?: string;
  assignees?: unknown;
  start_date?: string | null;
  due_date?: string | null;
  date_created_ms?: number;
}

// ─── Status helpers ───────────────────────────────────────
const TZ_OFFSET_HOURS = -3; // BRT

function statusToString(s: ReportTask["status"]): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return String(s.status ?? "");
}

function statusToColor(s: ReportTask["status"], fallback?: string): string | undefined {
  if (!s) return fallback;
  if (typeof s === "object" && s.color) return s.color;
  return fallback;
}

function capitalizar(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Color → emoji (HSL) ──────────────────────────────────
function hexToHsl(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const m = cleaned.length === 3
    ? cleaned.split("").map((c) => c + c)
    : cleaned.match(/.{2}/g);
  if (!m || m.length < 3) return [0, 0, 0];
  const [r, g, b] = m.map((x) => parseInt(x, 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

function colorToEmoji(hex?: string): string {
  if (!hex) return "⚪";
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.15) return "⚪";
  if (l < 0.15) return "⚫";
  if (h < 20 || h >= 340) return "🔴";
  if (h < 50) return "🟠";
  if (h < 70) return "🟡";
  if (h < 160) return "🟢";
  if (h < 260) return "🔵";
  if (h < 320) return "🟣";
  return "🔴";
}

const STATUS_NAME_OVERRIDE: Record<string, string> = {
  "em execução": "🟡",
  "em execucao": "🟡",
  "in progress": "🟡",
  fazendo: "🟡",
  "em revisão": "🔵",
  "em revisao": "🔵",
  review: "🔵",
  concluída: "🟢",
  concluida: "🟢",
  concluído: "🟢",
  concluido: "🟢",
  complete: "🟢",
  closed: "🟢",
  done: "🟢",
  fechado: "🟢",
  finalizado: "🟢",
  backlog: "⚪",
  "to do": "⚪",
  pause: "⏸️",
  paused: "⏸️",
  pausa: "⏸️",
  pausado: "⏸️",
  "on hold": "⏸️",
  "em espera": "⏸️",
};

function statusEmoji(name: string, color?: string): string {
  const hit = STATUS_NAME_OVERRIDE[name.trim().toLowerCase()];
  if (hit) return hit;
  return colorToEmoji(color);
}

// ─── Tempo relativo ───────────────────────────────────────
function formatTempoRelativo(dateMs: number | undefined, now: Date = new Date()): string {
  if (!dateMs || Number.isNaN(dateMs)) return "";
  const diff = now.getTime() - dateMs;
  const dia = 24 * 60 * 60 * 1000;
  const dias = Math.floor(diff / dia);
  if (dias <= 0) {
    const horas = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
    return `há ${horas}h`;
  }
  if (dias === 1) return "há 1 dia";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses === 1) return "há ~1 mês";
  if (meses < 12) return `há ~${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "há ~1 ano" : `há ~${anos} anos`;
}

function buildTaskUrl(task: ReportTask): string | undefined {
  if (task.url) return task.url;
  if (task.id) return `https://app.clickup.com/t/${task.id}`;
  return undefined;
}

function formatDataDM(ms: string | null | undefined): string {
  if (!ms) return "";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
  return fmt.format(new Date(n));
}

function formatJanela(t: ReportTask): string {
  const inicio = formatDataDM(t.start_date);
  const termino = formatDataDM(t.due_date);
  if (!inicio && !termino) return "";
  if (inicio && termino) return `${inicio} → ${termino}`;
  if (termino) return `→ ${termino}`;
  return `${inicio} →`;
}

function isTerminalStatus(t: ReportTask): boolean {
  const name = statusToString(t.status).toLowerCase();
  return STATUS_TERMINAIS.has(name);
}

function isOverdue(t: ReportTask, now: Date): boolean {
  if (isTerminalStatus(t)) return false;
  if (!t.due_date) return false;
  const due = Number(t.due_date);
  if (!Number.isFinite(due)) return false;
  return due < getInicioDiaMs(now);
}

function formatLinhaTarefa(t: ReportTask, now: Date): string {
  const url = buildTaskUrl(t);
  const nome = t.name || "Tarefa sem nome";
  const link = url ? `[${nome}](${url})` : nome;
  const partes: string[] = [link];
  const janela = formatJanela(t);
  if (janela) partes.push(janela);
  const tempo = formatTempoRelativo(t.date_created_ms, now);
  if (tempo) partes.push(tempo);
  const flag = isOverdue(t, now) ? "⚠️ " : "";
  return flag + partes.join(" — ");
}

// ─── Datas ────────────────────────────────────────────────
function getInicioDiaMs(date: Date): number {
  const localMs = date.getTime() + TZ_OFFSET_HOURS * 3600 * 1000;
  const ymd = new Date(localMs).toISOString().slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y as number, (m as number) - 1, d as number) - TZ_OFFSET_HOURS * 3600 * 1000;
}

// ─── Daily: agrupa por pessoa, dentro por status real ────
const STATUS_ORDER = [
  "concluída ontem",
  "em execução",
  "em execucao",
  "in progress",
  "em revisão",
  "em revisao",
  "review",
  "backlog",
  "to do",
  "pause",
  "paused",
  "pausado",
];

function statusOrderIndex(name: string): number {
  const idx = STATUS_ORDER.indexOf(name.trim().toLowerCase());
  return idx === -1 ? STATUS_ORDER.length + 1 : idx;
}

function tarefasDoMembro(tasks: ReportTask[], membro: TeamMember): ReportTask[] {
  return tasks.filter((t) => identificarDono(t.assignees)?.alias === membro.alias);
}

interface StatusGroup {
  statusName: string;
  emoji: string;
  tasks: ReportTask[];
}

function agruparPorStatus(tasks: ReportTask[]): StatusGroup[] {
  const map = new Map<string, StatusGroup>();
  for (const t of tasks) {
    const name = statusToString(t.status) || "sem status";
    const color = statusToColor(t.status, t.status_color);
    const key = name.toLowerCase();
    let grp = map.get(key);
    if (!grp) {
      grp = { statusName: name, emoji: statusEmoji(name, color), tasks: [] };
      map.set(key, grp);
    }
    grp.tasks.push(t);
  }
  return Array.from(map.values()).sort(
    (a, b) => statusOrderIndex(a.statusName) - statusOrderIndex(b.statusName),
  );
}

function gerarBlocoDailyPorMembro(tasks: ReportTask[], now: Date): string {
  const equipe = getEquipe();
  let buf = "";
  for (const membro of equipe) {
    const minhas = tarefasDoMembro(tasks, membro);
    if (minhas.length === 0) continue;
    buf += `\n## ${membro.alias}\n`;
    const grupos = agruparPorStatus(minhas);
    for (const grupo of grupos) {
      buf += `\n**${grupo.emoji} ${capitalizar(grupo.statusName)}**\n`;
      for (const t of grupo.tasks) {
        buf += `- ${formatLinhaTarefa(t, now)}\n`;
      }
    }
  }
  return buf || "\n_Nada em andamento no momento._\n";
}

// ─── Weekly: agrupa por pessoa, dentro por categoria ─────
type WeeklyCategory =
  | "concluidas-semana"
  | "em-execucao-revisao"
  | "programadas-semana"
  | "atrasadas"
  | "pausadas"
  | "outras";

const WEEKLY_CATEGORIAS: Array<{ key: WeeklyCategory; emoji: string; label: string }> = [
  { key: "concluidas-semana", emoji: "🟢", label: "Concluídas na semana passada" },
  { key: "em-execucao-revisao", emoji: "🟡", label: "Em execução / revisão" },
  { key: "programadas-semana", emoji: "📅", label: "Programadas para esta semana" },
  { key: "atrasadas", emoji: "🔴", label: "Atrasadas" },
  { key: "pausadas", emoji: "⏸️", label: "Pausadas" },
];

const STATUS_TERMINAIS = new Set([
  "concluída",
  "concluida",
  "concluído",
  "concluido",
  "concluída ontem",
  "concluída na semana",
  "complete",
  "closed",
  "done",
  "fechado",
  "finalizado",
]);

const STATUS_PAUSADOS = new Set([
  "pause",
  "paused",
  "pausa",
  "pausado",
  "on hold",
  "em espera",
]);

const STATUS_EXEC_REV = new Set([
  "em execução",
  "em execucao",
  "in progress",
  "fazendo",
  "em revisão",
  "em revisao",
  "review",
]);

function categorizarWeekly(t: ReportTask, now: Date): WeeklyCategory {
  const name = statusToString(t.status).toLowerCase();
  if (STATUS_TERMINAIS.has(name)) return "concluidas-semana";
  if (STATUS_PAUSADOS.has(name)) return "pausadas";
  const inicioHojeMs = getInicioDiaMs(now);
  const fimSemanaMs = inicioHojeMs + 7 * 24 * 3600 * 1000;
  const dueMs = t.due_date ? Number(t.due_date) : null;
  const isOverdue = dueMs !== null && Number.isFinite(dueMs) && dueMs < inicioHojeMs;
  if (isOverdue) return "atrasadas";
  if (STATUS_EXEC_REV.has(name)) return "em-execucao-revisao";
  if (dueMs !== null && Number.isFinite(dueMs) && dueMs >= inicioHojeMs && dueMs <= fimSemanaMs) {
    return "programadas-semana";
  }
  return "outras";
}

function gerarBlocoWeeklyPorMembro(tasks: ReportTask[], now: Date): string {
  const equipe = getEquipe();
  let buf = "";
  for (const membro of equipe) {
    const minhas = tarefasDoMembro(tasks, membro);
    if (minhas.length === 0) continue;

    const porCat = new Map<WeeklyCategory, ReportTask[]>();
    for (const t of minhas) {
      const cat = categorizarWeekly(t, now);
      if (cat === "outras") continue;
      const arr = porCat.get(cat) ?? [];
      arr.push(t);
      porCat.set(cat, arr);
    }
    if (porCat.size === 0) continue;

    buf += `\n## ${membro.alias}\n`;
    for (const { key, emoji, label } of WEEKLY_CATEGORIAS) {
      const arr = porCat.get(key);
      if (!arr?.length) continue;
      buf += `\n**${emoji} ${label}**\n`;
      for (const t of arr) {
        buf += `- ${formatLinhaTarefa(t, now)}\n`;
      }
    }
  }
  return buf || "\n_Nada relevante na semana._\n";
}

// ─── Templates ────────────────────────────────────────────
export interface ReportMarkdownInput {
  features: ReportTask[];
  tarefas: ReportTask[];
  now?: Date;
}

const CABECALHO_DAILY = `**Facilitador:**\n**Tempo:**\n**Presencial:**\n**Home:**\n**Avisou:**\n**Não participou:**\n\n---\n`;

export function montarMarkdownDaily(input: ReportMarkdownInput): string {
  const now = input.now ?? new Date();
  const todas = [...input.features, ...input.tarefas];
  const corpo = gerarBlocoDailyPorMembro(todas, now);
  return `${CABECALHO_DAILY}${corpo}\n`;
}

export interface WeeklyMarkdownInput extends ReportMarkdownInput {
  intervaloLabel: string;
}

export function montarMarkdownWeekly(input: WeeklyMarkdownInput): string {
  const now = input.now ?? new Date();
  const cabecalho = `**Período da semana passada:** ${input.intervaloLabel}\n**Facilitador:**\n**Tempo:**\n\n---\n`;
  const todas = [...input.features, ...input.tarefas];
  const corpo = gerarBlocoWeeklyPorMembro(todas, now);
  return `${cabecalho}${corpo}\n`;
}

export type { TeamMember };
