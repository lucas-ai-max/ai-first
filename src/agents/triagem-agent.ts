import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { buildTriagemSystemPrompt } from "../config/triagem-prompt.js";
import { getEnv } from "../config/env.js";

let _agent: Agent | undefined;

export function getTriagemAgent(): Agent {
  if (!_agent) {
    const env = getEnv();
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    _agent = new Agent({
      name: "Agente Triagem",
      instructions: buildTriagemSystemPrompt(),
      model: openai(env.OPENAI_MODEL),
    });
  }
  return _agent;
}

export interface TriagemResult {
  severidade: "P0" | "P1" | "P2" | "P3";
  severidade_justificativa: string;
  severidade_forcada_lgpd: boolean;
  modulo: "Backend" | "Frontend" | "Infra" | "Auth" | "Dados" | null;
  modulo_justificativa: string;
  modulos_secundarios: string[];
  canal: "Suporte" | "QA" | "Clarity" | "Sentry" | null;
  canal_justificativa: string | null;
  dados_paciente: boolean;
  lgpd_termos_encontrados: string[];
  dev_sugerido: string;
  confianca: "Alta" | "Baixa";
  confianca_baixa_motivo: string | null;
}

const MAX_CONTEXT_CHARS = 10_000;

/**
 * Monta o prompt de usuário com o contexto da task e pede a análise.
 */
function buildUserPrompt(
  title: string,
  description: string,
  comments: Array<{ author: string; text: string }>,
  currentFields: Record<string, string>,
): string {
  let context = `## Task: ${title}\n\n`;
  context += `## Descrição:\n${description || "(sem descrição)"}\n\n`;

  if (Object.keys(currentFields).length > 0) {
    context += `## Campos atuais:\n`;
    for (const [key, value] of Object.entries(currentFields)) {
      context += `- ${key}: ${value}\n`;
    }
    context += "\n";
  }

  if (comments.length > 0) {
    context += `## Comentários (${comments.length}):\n`;
    for (const c of comments) {
      context += `[${c.author}]: ${c.text}\n---\n`;
    }
  }

  // Truncamento: corta os comentários mais antigos se passar de 10k chars
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(-MAX_CONTEXT_CHARS);
    context = `[...contexto truncado, mostrando últimos ${MAX_CONTEXT_CHARS} caracteres...]\n\n${context}`;
  }

  context += `\nAnalise esta task e retorne o JSON de classificação conforme o formato especificado.`;
  return context;
}

/**
 * Executa a triagem de uma task usando o LLM.
 */
export async function runTriagem(
  title: string,
  description: string,
  comments: Array<{ author: string; text: string }>,
  currentFields: Record<string, string>,
): Promise<TriagemResult> {
  const agent = getTriagemAgent();
  const userPrompt = buildUserPrompt(title, description, comments, currentFields);

  const response = await agent.generate(userPrompt);
  const text = typeof response.text === "string" ? response.text : String(response.text);

  // Extrai o JSON da resposta (pode estar envolto em ```json ... ```)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch?.[1]) {
    throw new Error(`Agente não retornou JSON válido. Resposta: ${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(jsonMatch[1]) as TriagemResult;
  return parsed;
}

/**
 * Formata o resultado da triagem como comentário markdown pro ClickUp.
 */
export function formatTriagemComment(result: TriagemResult): string {
  const env = getEnv();

  let comment = "";

  // Aviso de baixa confiança no topo
  if (result.confianca === "Baixa") {
    comment += `Atenção: confiança baixa nessa triagem, revisa manualmente. ${result.confianca_baixa_motivo ?? "Descrição insuficiente pra classificar com certeza."}\n\n`;
  }

  // Severidade
  comment += `**Severidade:** ${result.severidade}\n`;
  if (result.severidade_forcada_lgpd) {
    comment += `> P0 forçado por menção a ${result.lgpd_termos_encontrados.map((t) => `"${t}"`).join(", ")}.\n\n`;
  } else {
    comment += `> ${result.severidade_justificativa}\n\n`;
  }

  // Módulo
  if (result.modulo) {
    comment += `**Módulo:** ${result.modulo}\n`;
    comment += `> ${result.modulo_justificativa}\n`;
    if (result.modulos_secundarios.length > 0) {
      comment += `> Módulos secundários: ${result.modulos_secundarios.join(", ")}\n`;
    }
    comment += "\n";
  } else {
    comment += `**Módulo:** (não identificado)\n`;
    comment += `> Não foi possível identificar o módulo com confiança.\n\n`;
  }

  // Canal
  if (result.canal) {
    comment += `**Canal:** ${result.canal}\n`;
    comment += `> ${result.canal_justificativa}\n\n`;
  }

  // Dados de paciente / LGPD
  if (result.dados_paciente) {
    comment += `**Dados de paciente:** ✅ SIM\n`;
    comment += `> ⚠️ LGPD — termos encontrados: ${result.lgpd_termos_encontrados.map((t) => `"${t}"`).join(", ")}.\n`;
    comment += `> Severidade forçada para P0. @${env.TRIAGEM_BACKEND_DEV} adicionado como watcher.\n\n`;
  } else {
    comment += `**Dados de paciente:** ❌ Não\n\n`;
  }

  // Dev sugerido
  comment += `**Dev sugerido:** ${result.dev_sugerido}`;
  if (result.dados_paciente && result.modulo === "Frontend") {
    comment += ` (por módulo Frontend + @${env.TRIAGEM_BACKEND_DEV} watcher LGPD)`;
  } else if (result.modulo) {
    comment += ` (por módulo ${result.modulo})`;
  }
  comment += "\n\n";

  // Confiança
  comment += `**Confiança:** ${result.confianca}\n\n`;

  // Footer
  comment += `---\nSe algo tiver errado, corrige manualmente e manda um \`@triagem\` de novo.`;

  return comment;
}
