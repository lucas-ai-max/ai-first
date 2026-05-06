import { getEquipe, extrairNomesAssignees } from "./team.js";
import type { TeamMember } from "./team.js";

export interface ReportTask {
  id?: string;
  name: string;
  url?: string;
  status?: string | { status?: string };
  assignees?: unknown;
  due_date?: string | null;
  date_created_ms?: number;
}

const STATUS_EMOJI: Record<string, string> = {
  "em execução": "🟢",
  "em revisao": "🟡",
  "em revisão": "🟡",
  backlog: "⚪",
  complete: "✅",
  closed: "✅",
  done: "✅",
  concluído: "✅",
  fechado: "✅",
};

function statusToString(s: ReportTask["status"]): string {
  if (!s) return "";
  if (typeof s === "string") return s;
  return String(s.status ?? "");
}

function statusEmoji(statusRaw: unknown): string {
  const s = statusToString(statusRaw as ReportTask["status"]).toLowerCase();
  return STATUS_EMOJI[s] ?? "⚪";
}

function buildTaskUrl(task: ReportTask): string | undefined {
  if (task.url) return task.url;
  if (task.id) return `https://app.clickup.com/t/${task.id}`;
  return undefined;
}

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

function formatLinhaTarefa(t: ReportTask, now: Date = new Date()): string {
  const url = buildTaskUrl(t);
  const nome = t.name || "Tarefa sem nome";
  const link = url ? `[${nome}](${url})` : nome;
  const emoji = statusEmoji(t.status);
  const tempo = formatTempoRelativo(t.date_created_ms, now);
  const sufixo = tempo ? ` — ${tempo}` : "";
  return `${emoji} ${link}${sufixo}`;
}

function gerarSecao(
  titulo: string,
  listaDeTarefas: ReportTask[],
  now: Date = new Date(),
): string {
  if (listaDeTarefas.length === 0) return "";
  const equipe = getEquipe();
  let texto = `\n### ${titulo}\n`;
  let temConteudo = false;
  let bufferMembros = "";

  for (const membro of equipe) {
    const tarefasDaPessoa = listaDeTarefas.filter((task) => {
      const responsaveis = extrairNomesAssignees(task.assignees).toLowerCase();
      return membro.match.some((termo) => responsaveis.includes(termo.toLowerCase()));
    });
    if (tarefasDaPessoa.length === 0) continue;
    temConteudo = true;
    bufferMembros += `\n#### ${membro.alias}\n`;
    tarefasDaPessoa.forEach((t, i) => {
      bufferMembros += `${i + 1}. ${formatLinhaTarefa(t, now)}\n`;
    });
  }

  if (!temConteudo) return "";
  return texto + bufferMembros;
}

export interface ReportMarkdownInput {
  features: ReportTask[];
  tarefas: ReportTask[];
  now?: Date;
}

const CABECALHO_DAILY = `**Facilitador:**\n**Tempo:**\n**Presencial:**\n**Home:**\n**Avisou:**\n**Não participou:**\n\n---\n`;

export function montarMarkdownDaily(input: ReportMarkdownInput): string {
  const now = input.now ?? new Date();
  const blocos = [
    gerarSecao("🚀 Features em andamento", input.features, now),
    gerarSecao("🔧 Tarefas em andamento", input.tarefas, now),
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
    gerarSecao("🚀 Features em andamento", input.features, now),
    gerarSecao("🔧 Tarefas em andamento", input.tarefas, now),
  ].filter(Boolean);
  const corpo = blocos.length > 0 ? blocos.join("\n") : "\n_Nada em andamento no momento._\n";
  return `${cabecalho}${corpo}\n`;
}

export type { TeamMember };
