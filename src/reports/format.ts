import { getEquipe, extrairNomesAssignees } from "./team.js";
import type { TeamMember } from "./team.js";

export interface ReportTask {
  id?: string;
  name: string;
  url?: string;
  status?: string | { status?: string; color?: string };
  status_color?: string;
  assignees?: unknown;
  due_date?: string | null;
  date_created_ms?: number;
}

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

// ─── Color → emoji ─────────────────────────────────────────
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
  if (s < 0.15) return "⚪"; // cinza/branco
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
  pause: "⚪",
  paused: "⚪",
  pausa: "⚪",
  pausado: "⚪",
  "on hold": "⚪",
  "em espera": "⚪",
};

function statusEmoji(name: string, color?: string): string {
  const hit = STATUS_NAME_OVERRIDE[name.trim().toLowerCase()];
  if (hit) return hit;
  return colorToEmoji(color);
}

// ─── Tempo relativo ────────────────────────────────────────
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

// ─── Membros ───────────────────────────────────────────────
function nomesMembros(assignees: unknown): string {
  const equipe = getEquipe();
  const responsaveis = extrairNomesAssignees(assignees).toLowerCase();
  if (!responsaveis) return "Sem responsável";
  const matches = equipe.filter((m) =>
    m.match.some((termo) => responsaveis.includes(termo.toLowerCase())),
  );
  if (matches.length > 0) return matches.map((m) => m.alias).join(" + ");
  return extrairNomesAssignees(assignees);
}

// ─── Agrupamento por status ────────────────────────────────
const STATUS_ORDER = [
  "em execução",
  "em execucao",
  "in progress",
  "em revisão",
  "em revisao",
  "review",
  "concluída",
  "concluida",
  "concluído",
  "concluido",
  "complete",
  "closed",
  "done",
  "backlog",
  "to do",
  "pause",
  "paused",
  "pausado",
  "on hold",
  "em espera",
];

function statusOrderIndex(name: string): number {
  const idx = STATUS_ORDER.indexOf(name.trim().toLowerCase());
  return idx === -1 ? STATUS_ORDER.length + 1 : idx;
}

function buildTaskUrl(task: ReportTask): string | undefined {
  if (task.url) return task.url;
  if (task.id) return `https://app.clickup.com/t/${task.id}`;
  return undefined;
}

function formatLinhaTarefa(t: ReportTask, now: Date): string {
  const url = buildTaskUrl(t);
  const nome = t.name || "Tarefa sem nome";
  const link = url ? `[${nome}](${url})` : nome;
  const tempo = formatTempoRelativo(t.date_created_ms, now);
  const sufixoTempo = tempo ? ` — ${tempo}` : "";
  return `**${nomesMembros(t.assignees)}** — ${link}${sufixoTempo}`;
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

function gerarBlocoPorLista(titulo: string, tasks: ReportTask[], now: Date): string {
  if (tasks.length === 0) return "";
  let buf = `\n## ${titulo}\n`;
  const grupos = agruparPorStatus(tasks);
  for (const grupo of grupos) {
    buf += `\n### ${grupo.emoji} ${grupo.statusName}\n`;
    for (const t of grupo.tasks) {
      buf += `- ${formatLinhaTarefa(t, now)}\n`;
    }
  }
  return buf;
}

// ─── Templates ─────────────────────────────────────────────
export interface ReportMarkdownInput {
  features: ReportTask[];
  tarefas: ReportTask[];
  now?: Date;
}

const CABECALHO_DAILY = `**Facilitador:**\n**Tempo:**\n**Presencial:**\n**Home:**\n**Avisou:**\n**Não participou:**\n\n---\n`;

export function montarMarkdownDaily(input: ReportMarkdownInput): string {
  const now = input.now ?? new Date();
  const blocos = [
    gerarBlocoPorLista("🚀 Features", input.features, now),
    gerarBlocoPorLista("🔧 Tarefas", input.tarefas, now),
  ].filter(Boolean);
  const corpo = blocos.length > 0 ? blocos.join("\n") : "\n_Nada em andamento no momento._\n";
  return `${CABECALHO_DAILY}${corpo}\n`;
}

export interface WeeklyMarkdownInput extends ReportMarkdownInput {
  intervaloLabel: string;
}

export function montarMarkdownWeekly(input: WeeklyMarkdownInput): string {
  const now = input.now ?? new Date();
  const cabecalho = `**Período:** ${input.intervaloLabel}\n**Facilitador:**\n**Tempo:**\n\n---\n`;
  const blocos = [
    gerarBlocoPorLista("🚀 Features", input.features, now),
    gerarBlocoPorLista("🔧 Tarefas", input.tarefas, now),
  ].filter(Boolean);
  const corpo = blocos.length > 0 ? blocos.join("\n") : "\n_Nada em andamento no momento._\n";
  return `${cabecalho}${corpo}\n`;
}

export type { TeamMember };
