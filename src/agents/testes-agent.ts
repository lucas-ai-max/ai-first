import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { buildTestesSystemPrompt } from "../config/testes-prompt.js";
import { getEnv } from "../config/env.js";
import {
  getTask,
  postComment,
  updateCustomField,
  updateTaskStatus,
  createSubtask,
  getSubtasks,
  getCustomFieldValue,
  getCustomFieldId,
  getClickUpToken,
  type ClickUpTask,
} from "../tools/clickup-mcp.js";
import {
  startTest,
  stopTest,
  pollTestStatus,
  getTestReport,
  type TestaAiStartPayload,
  type TestaAiReport,
} from "../tools/testa-ai-client.js";

// ─── Types ──────────────────────────────────────────────────

export interface TestScenario {
  nome: string;
  descricao: string;
  mensagens?: number;
}

export interface EvolutionInstance {
  nome: string;
  numero: string;
  url?: string;
  key?: string;
}

interface SubtaskContext {
  subtaskId: string;
  parentTaskId: string;
  scenario: TestScenario;
  instance: EvolutionInstance;
  messageCount: number;
  project?: string;
  sessionId?: string;
}

interface SubtaskResult {
  subtaskId: string;
  scenarioName: string;
  status: "aprovado" | "reprovado" | "aguardando revisão" | "erro" | "em avaliação";
  report?: TestaAiReport;
  error?: string;
}

// ─── Agent Singleton ────────────────────────────────────────

let _agent: Agent | undefined;

function getTestesAgent(): Agent {
  if (!_agent) {
    const env = getEnv();
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    _agent = new Agent({
      name: "Agente Testes",
      instructions: buildTestesSystemPrompt(),
      model: openai(env.OPENAI_MODEL),
    });
  }
  return _agent;
}

// ─── LLM Parser: texto livre → JSON estruturado ─────────────

const PARSE_SCENARIOS_PROMPT = `Você recebe um texto descrevendo cenários de teste com dados de casos (CPF, Telefone, Nome, Contrato, etc.).

IMPORTANTE: Preserve TODOS os dados estruturados (linhas com **Campo:** valor) na descrição!

Extraia cenários e retorne SOMENTE um JSON array, sem nenhum texto adicional.

Cada cenário deve ter:
- "nome": título curto do cenário (ex: "Cobrança - Cartão vencido")
- "descricao": descrição COMPLETA incluindo TODOS os dados estruturados originais
- "mensagens": número de mensagens sugerido (se mencionado, senão omita)

Se há múltiplos casos (Caso 1, Caso 2, etc), crie um cenário pra cada um.

EXEMPLO - Preserve os dados assim:
[
  {
    "nome": "Cobrança - Cartão vencido",
    "descricao": "### Caso 1 — Cartão vencido (4-30 dias)\n- **CPF:** 12499776650\n- **Telefone:** 5521987654321\n- **Nome:** Carlos Oliveira\n- **Contrato:** 722506\nDescrição do fluxo: Perguntar motivo...",
    "mensagens": 10
  }
]

Retorne SOMENTE o JSON array.`;

const PARSE_INSTANCES_PROMPT = `Você recebe um texto livre descrevendo instâncias Evolution (WhatsApp) para testes.
Extraia as instâncias e retorne SOMENTE um JSON array, sem nenhum texto adicional.

Cada instância deve ter:
- "nome": nome/identificador da instância
- "numero": número WhatsApp (formato: 55XXXXXXXXXXX)
- "key": API key da instância (se mencionada)

Exemplos de como o usuário pode escrever:
- "instancia-01 numero 5511999990001 key ABC123"
- "instancia-01 5511999990001 apikey=ABC123"
- "nome: sofia-01, numero: 5511999990001, key: ABC123"

Se o texto não menciona instâncias específicas ou está vazio, retorne um array com uma instância padrão:
[{"nome": "instancia-default", "numero": "0000000000000"}]

Retorne SOMENTE o JSON array.`;

async function parseWithLLM(userText: string, systemPrompt: string): Promise<unknown> {
  const agent = getTestesAgent();
  console.log(`[testes] Calling LLM with user text (${userText.length} chars)`);
  const response = await agent.generate(`${systemPrompt}\n\n---\n\nTexto do usuário:\n${userText}`);
  const text = typeof response.text === "string" ? response.text : String(response.text);

  console.log(`[testes] LLM response (first 300 chars): ${text.slice(0, 300)}`);
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\[[\s\S]*\])/);
  if (!jsonMatch?.[1]) {
    console.error(`[testes] LLM parsing failed. Full response:\n${text}`);
    throw new Error(`LLM não retornou JSON válido: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[1]);
  console.log(`[testes] LLM parse successful, result type: ${Array.isArray(parsed) ? `array[${parsed.length}]` : typeof parsed}`);
  return parsed;
}

/**
 * Lê os campos em texto livre, usa o LLM pra estruturar, e atualiza
 * os campos da task com o JSON correto.
 */
async function parseAndStructureFields(
  task: ClickUpTask,
  taskId: string,
): Promise<{ scenarios: TestScenario[]; instances: EvolutionInstance[] } | null> {
  // Debug: listar todos os campos disponíveis
  console.log(`[testes] Task custom fields available:`);
  for (const field of task.custom_fields) {
    console.log(`  - "${field.name}" (id: ${field.id}): ${String(field.value).slice(0, 100)}`);
  }

  // Ler texto livre dos campos
  const rawScenarios = getCustomFieldValue(task, "cenários de teste") ??
    getCustomFieldValue(task, "cenarios de teste");
  const rawInstances = getCustomFieldValue(task, "instâncias evolution") ??
    getCustomFieldValue(task, "instancias evolution");

  console.log(`[testes] rawScenarios type: ${typeof rawScenarios}, value: ${String(rawScenarios).slice(0, 200)}`);
  console.log(`[testes] rawInstances type: ${typeof rawInstances}, value: ${String(rawInstances ?? "").slice(0, 200)}`);

  if (!rawScenarios) {
    const availableFields = task.custom_fields.map(f => f.name).join(", ");
    console.log(`[testes] rawScenarios is null/undefined. Available fields: ${availableFields}`);
    await testsPostComment(taskId, 'O campo "Cenários de teste" tá vazio. Preenche e manda de novo pra preparação.');
    return null;
  }

  const scenariosText = String(rawScenarios);
  const instancesText = rawInstances ? String(rawInstances) : "";

  console.log(`[testes] scenariosText length: ${scenariosText.length}, first 200 chars: "${scenariosText.slice(0, 200)}"`);

  // Tentar parsear como JSON primeiro (caso o usuário já tenha escrito JSON válido)
  let scenarios: TestScenario[];
  let instances: EvolutionInstance[];

  try {
    const parsed = JSON.parse(scenariosText);
    console.log(`[testes] JSON parse succeeded, type: ${Array.isArray(parsed) ? "array" : typeof parsed}, length: ${Array.isArray(parsed) ? parsed.length : "N/A"}`);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].nome) {
      scenarios = parsed as TestScenario[];
      console.log(`[testes] Cenários já estavam em JSON válido (${scenarios.length} cenários)`);
    } else {
      console.log(`[testes] JSON parsed but not a valid scenarios array. Array? ${Array.isArray(parsed)}, Length? ${Array.isArray(parsed) ? parsed.length : "N/A"}, Has nome? ${parsed[0]?.nome ? "yes" : "no"}`);
      throw new Error("not structured");
    }
  } catch (jsonErr) {
    // Texto livre — usar LLM pra estruturar
    console.log(`[testes] Cenários em texto livre, usando LLM pra estruturar...`, jsonErr instanceof Error ? jsonErr.message : String(jsonErr));
    await testsPostComment(taskId, "Lendo os cenários e organizando, um momento...");
    try {
      scenarios = (await parseWithLLM(scenariosText, PARSE_SCENARIOS_PROMPT)) as TestScenario[];
      console.log(`[testes] LLM parsing succeeded, scenarios: ${JSON.stringify(scenarios).slice(0, 300)}`);
    } catch (err) {
      console.error(`[testes] LLM parsing failed:`, err instanceof Error ? err.message : String(err));
      await testsPostComment(taskId,
        `Não consegui entender os cenários que você escreveu. Reescreve de forma mais clara e manda de novo pra preparação.\n\nDetalhe: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  try {
    const parsed = JSON.parse(instancesText);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].nome) {
      instances = parsed as EvolutionInstance[];
    } else {
      throw new Error("not structured");
    }
  } catch {
    if (instancesText.trim().length > 0) {
      console.log(`[testes] Instâncias em texto livre, usando LLM pra estruturar...`);
      try {
        instances = (await parseWithLLM(instancesText, PARSE_INSTANCES_PROMPT)) as EvolutionInstance[];
      } catch {
        instances = [{ nome: "instancia-default", numero: "0000000000000" }];
      }
    } else {
      instances = [{ nome: "instancia-default", numero: "0000000000000" }];
    }
  }

  console.log(`[testes] After parsing: scenarios.length=${scenarios.length}, instances.length=${instances.length}`);

  // Validar dados extraídos antes de prosseguir
  const problems: string[] = [];

  // Filtrar cenários inválidos (sem nome ou descrição)
  const validScenarios: TestScenario[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i]!;
    if (!s.nome || s.nome.trim().length === 0) {
      problems.push(`Cenário ${i + 1}: está sem nome`);
    } else if (!s.descricao || s.descricao.trim().length === 0) {
      problems.push(`Cenário ${i + 1}: está sem descrição`);
    } else {
      validScenarios.push(s);
    }
  }

  console.log(`[testes] Validation complete: ${scenarios.length} total, ${validScenarios.length} valid, ${problems.length} problems found`);

  // Usar apenas os cenários válidos
  scenarios = validScenarios;

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    if (!inst.nome || inst.nome.trim().length === 0) {
      problems.push(`Instância ${i + 1}: está sem nome`);
    }
    if (!inst.numero || inst.numero.trim().length === 0) {
      problems.push(`Instância ${i + 1}: está sem número`);
    }
    if (!inst.key || inst.key.trim().length === 0) {
      problems.push(`A key da conta "${inst.nome || `instância ${i + 1}`}" tá faltando, colete novamente as keys corretas`);
    }
  }

  if (problems.length > 0) {
    console.log(`[testes] Found ${problems.length} validation problems, aborting`);
    await testsPostComment(taskId,
      `Faltam algumas informações:\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\nCorrige e manda de novo pra preparação.`);
    return null;
  }

  // Verificar se acabou sem nenhum cenário válido
  if (scenarios.length === 0) {
    console.log(`[testes] All scenarios were filtered out during validation`);
    await testsPostComment(taskId,
      `Os cenários que você descreveu não têm informações suficientes (todos faltam nome ou descrição). Preencha com mais detalhes e tenta de novo.`);
    return null;
  }

  // Não sobrescreve os campos — o texto original do usuário fica intacto.
  // O JSON estruturado é usado internamente e fica documentado no comentário.

  console.log(`[testes] parseAndStructureFields returning: scenarios.length=${scenarios.length}, instances.length=${instances.length}`);
  return { scenarios, instances };
}

// ─── ClickUp Helpers com Token de Testes ──────────────────
// Recalcula o token a cada chamada para garantir que usa a versão atual do .env

async function testsPostComment(taskId: string, text: string): Promise<void> {
  const token = getClickUpToken(true);
  const env = getEnv();
  const isTestesToken = token === env.CLICKUP_API_TOKEN_TESTES;
  console.log(`[testes] Postando comentário com token de ${isTestesToken ? "TESTES" : "TRIAGEM"}`);
  return postComment(taskId, text, token);
}

async function testsUpdateTaskStatus(taskId: string, status: string): Promise<void> {
  return updateTaskStatus(taskId, status, getClickUpToken(true));
}

async function testsGetTask(taskId: string): Promise<ClickUpTask> {
  return getTask(taskId, getClickUpToken(true));
}

async function testsUpdateCustomField(taskId: string, fieldId: string, value: unknown): Promise<void> {
  return updateCustomField(taskId, fieldId, value, getClickUpToken(true));
}

async function testsCreateSubtask(params: Parameters<typeof createSubtask>[0]): Promise<ClickUpTask> {
  return createSubtask(params, getClickUpToken(true));
}

async function testsGetSubtasks(taskId: string): Promise<ClickUpTask[]> {
  return getSubtasks(taskId, getClickUpToken(true));
}

// ─── Helpers de leitura de custom fields ─────────────────────

/**
 * Lê o campo "Projeto" (ou "Project") da task-mãe. Aceita:
 * - Text field: usa o valor direto.
 * - Dropdown: resolve o orderindex em type_config.options pra pegar o nome.
 * Retorna undefined se vazio ou não-encontrado.
 */
function readProjectField(parentTask: ClickUpTask): string | undefined {
  const field = parentTask.custom_fields.find(
    (f) => f.name.toLowerCase() === "projeto" || f.name.toLowerCase() === "project",
  );
  if (!field || field.value === undefined || field.value === null) return undefined;

  if (typeof field.value === "string") {
    const trimmed = field.value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof field.value === "number" && field.type_config?.options) {
    const option = field.type_config.options[field.value];
    const name = option?.name?.trim() || option?.label?.trim();
    return name && name.length > 0 ? name : undefined;
  }

  return undefined;
}

// ─── Registry de testes em execução (in-memory) ──────────────

export interface ActiveTest {
  subtaskId: string;
  parentTaskId: string;
  sessionId: string;
  scenarioName: string;
  expectedMessages?: number;
  startedAt: string;
  lastStatus?: string;
  messagesRemaining?: number;
  lastPollAt?: string;
}

const activeTests = new Map<string, ActiveTest>();

function registerActiveTest(entry: ActiveTest): void {
  activeTests.set(entry.subtaskId, entry);
}

function updateActiveTest(subtaskId: string, patch: Partial<ActiveTest>): void {
  const cur = activeTests.get(subtaskId);
  if (cur) activeTests.set(subtaskId, { ...cur, ...patch });
}

function unregisterActiveTest(subtaskId: string): void {
  activeTests.delete(subtaskId);
}

export function getActiveTestsSnapshot(): ActiveTest[] {
  return Array.from(activeTests.values());
}

// ─── Cancelamento de testes em andamento ─────────────────────

const CANCEL_FINAL_STATUSES = new Set([
  "aprovado",
  "reprovado",
  "aguardando revisão",
  "aguardando revisao",
  "erro",
  "cancelado",
]);

function getSessionIdFromTask(task: ClickUpTask): string | undefined {
  const raw = getCustomFieldValue(task, "sessão testa-ai") ??
    getCustomFieldValue(task, "sessao testa-ai");
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Cancela testes em andamento de uma task. Se `taskId` é uma task-mãe, para
 * todas as subtasks ativas; se é subtask, para apenas ela.
 *
 * O polling existente detecta `status === "stopped"` no testa-ai e encerra
 * naturalmente — aqui só adiantamos o feedback visual marcando "erro".
 */
export async function cancelTestsForTask(taskId: string, requestedBy: string): Promise<void> {
  const task = await testsGetTask(taskId);
  const isParent = !task.parent;

  const targetSubtasks: ClickUpTask[] = isParent
    ? await testsGetSubtasks(taskId)
    : [task];

  const toCancel: Array<{ subtask: ClickUpTask; sessionId: string }> = [];
  for (const subtask of targetSubtasks) {
    if (CANCEL_FINAL_STATUSES.has(subtask.status.status.toLowerCase())) continue;
    const sessionId = getSessionIdFromTask(subtask);
    if (sessionId) toCancel.push({ subtask, sessionId });
  }

  if (toCancel.length === 0) {
    await testsPostComment(taskId, `ℹ️ Nenhum teste ativo pra cancelar.`);
    return;
  }

  await testsPostComment(
    taskId,
    `🛑 Cancelamento solicitado por @${requestedBy}. Parando ${toCancel.length} sessão(ões)...`,
  );

  const results = await Promise.allSettled(
    toCancel.map(async ({ subtask, sessionId }) => {
      await stopTest(sessionId);
      await testsUpdateTaskStatus(subtask.id, "erro");
      await testsPostComment(subtask.id, `🛑 Teste cancelado por @${requestedBy}.`);
      return subtask.id;
    }),
  );

  const stopped = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - stopped;
  const failures = results
    .map((r, i) => (r.status === "rejected" ? `${toCancel[i]!.subtask.id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` : null))
    .filter((x): x is string => x !== null);

  let summary = `✅ ${stopped} sessão(ões) parada(s).`;
  if (failed > 0) {
    summary += `\n⚠️ ${failed} falharam:\n` + failures.map((f) => `  - ${f}`).join("\n");
  }
  await testsPostComment(taskId, summary);
}

// ─── Resposta a perguntas via menção ─────────────────────────

interface SubtaskTestInfo {
  id: string;
  name: string;
  status: string;
  sessionId?: string;
  active?: ActiveTest;
  reportSummary?: string;
}

interface TaskTestContext {
  parentTaskId: string;
  parentTaskName: string;
  parentStatus: string;
  totalSubtasks: number;
  running: number;
  completed: number;
  errored: number;
  awaitingReview: number;
  subtasks: SubtaskTestInfo[];
}

async function gatherTaskTestContext(taskId: string): Promise<TaskTestContext> {
  let task = await testsGetTask(taskId);
  if (task.parent) {
    task = await testsGetTask(task.parent);
  }
  const parentId = task.id;

  const subtasks = await testsGetSubtasks(parentId);
  const activeForTask = getActiveTestsSnapshot().filter((a) => a.parentTaskId === parentId);

  let running = 0;
  let completed = 0;
  let errored = 0;
  let awaitingReview = 0;
  const subtaskInfos: SubtaskTestInfo[] = [];

  for (const sub of subtasks) {
    const status = sub.status.status.toLowerCase();
    const sessionId = getSessionIdFromTask(sub);
    const activeEntry = sessionId ? activeForTask.find((a) => a.subtaskId === sub.id) : undefined;

    let reportSummary: string | undefined;
    const reportRaw = getCustomFieldValue(sub, "relatório (json)") ??
      getCustomFieldValue(sub, "relatorio (json)") ??
      getCustomFieldValue(sub, "relatório json") ??
      getCustomFieldValue(sub, "relatorio json");
    if (typeof reportRaw === "string" && reportRaw.length > 0) {
      reportSummary = reportRaw.length > 1500
        ? reportRaw.slice(0, 1500) + "...[truncado]"
        : reportRaw;
    }

    subtaskInfos.push({
      id: sub.id,
      name: sub.name,
      status,
      sessionId,
      active: activeEntry,
      reportSummary,
    });

    if (activeEntry) running++;
    if (status === "aprovado" || status === "reprovado") completed++;
    if (status === "erro") errored++;
    if (status === "aguardando revisão" || status === "aguardando revisao") awaitingReview++;
  }

  return {
    parentTaskId: parentId,
    parentTaskName: task.name,
    parentStatus: task.status.status,
    totalSubtasks: subtasks.length,
    running,
    completed,
    errored,
    awaitingReview,
    subtasks: subtaskInfos,
  };
}

const QA_SYSTEM_INSTRUCTION = `Você responde perguntas sobre uma bateria de testes automatizados.
Use APENAS os dados do CONTEXTO. Se algo não está no contexto, diga "não tenho essa informação".
Responda em PT-BR, direto e conciso, sem introduções tipo "Olá!".
Use bullets curtos quando listar subtasks. Não invente dados.`;

const MAX_QA_CONTEXT_CHARS = 8000;

/**
 * Responde a uma pergunta livre sobre os testes de uma task.
 * Coleta contexto da task (subtasks, sessões ativas, relatórios concluídos),
 * passa pro LLM e posta a resposta como comentário.
 */
export async function answerTestQuestion(
  taskId: string,
  question: string,
  requestedBy: string,
): Promise<void> {
  const context = await gatherTaskTestContext(taskId);

  const contextJson = JSON.stringify(context, null, 2);
  const contextForLLM = contextJson.length > MAX_QA_CONTEXT_CHARS
    ? contextJson.slice(0, MAX_QA_CONTEXT_CHARS) + "\n...[contexto truncado]"
    : contextJson;

  const userPrompt = [
    QA_SYSTEM_INSTRUCTION,
    "",
    "CONTEXTO:",
    contextForLLM,
    "",
    `PERGUNTA (de @${requestedBy}):`,
    question,
    "",
    "Sua resposta:",
  ].join("\n");

  console.log(`[testes] 🧠 Respondendo pergunta na task ${taskId} (contexto ${contextForLLM.length} chars)`);
  const agent = getTestesAgent();
  const response = await agent.generate(userPrompt);
  const answer = (typeof response.text === "string" ? response.text : String(response.text)).trim();

  if (!answer) {
    await testsPostComment(taskId, "Não consegui formular uma resposta. Tenta reformular a pergunta.");
    return;
  }

  await testsPostComment(taskId, answer);
}

// ─── Main Orchestration ─────────────────────────────────────

/**
 * Orquestra a bateria de testes completa pra uma task-mãe.
 * Chamado pelo webhook handler quando status muda pra "Em Preparação".
 */
export async function runTestBattery(parentTaskId: string): Promise<void> {
  const env = getEnv();

  // 1. Ler task-mãe
  let parentTask: ClickUpTask;
  try {
    parentTask = await testsGetTask(parentTaskId);
  } catch (err) {
    console.error(`[testes] Task ${parentTaskId} não encontrada:`, err);
    return;
  }

  // 2. Validar campos mínimos
  // Prompt vem da descrição da task (sem limite de caracteres)
  const prompt = parentTask.description?.trim() || undefined;
  const agentNumber = (getCustomFieldValue(parentTask, "número do agente") ??
    getCustomFieldValue(parentTask, "numero do agente")) as string | undefined;

  const missingFields: string[] = [];
  if (!prompt) missingFields.push("Descrição da task (é onde vai o prompt do agente)");
  if (!agentNumber || agentNumber.trim().length === 0) missingFields.push('"Número do agente"');

  if (missingFields.length > 0) {
    console.log(`[testes] Missing fields: ${missingFields.join(", ")}`);
    await testsPostComment(parentTaskId,
      `Faltam informações pra rodar os testes:\n\n${missingFields.map((f) => `- ${f} tá vazio`).join("\n")}\n\nPreenche e manda de novo pra preparação.`);
    await testsUpdateTaskStatus(parentTaskId, "backlog de testes");
    return;
  }

  console.log(`[testes] All required fields present. Prompt length: ${(prompt as string).length}, AgentNumber: ${agentNumber}`);

  const rawMessages = getCustomFieldValue(parentTask, "mensagens por conversa");
  const messagesPerConversation = typeof rawMessages === "number" ? rawMessages :
    typeof rawMessages === "string" ? parseInt(rawMessages, 10) : 10;

  const project = readProjectField(parentTask);
  console.log(`[testes] project field: ${project ?? "(não preenchido)"}`);

  // 3. Parsear e estruturar cenários + instâncias (texto livre → JSON via LLM)
  console.log(`[testes] Calling parseAndStructureFields for task ${parentTaskId}...`);
  const parsed = await parseAndStructureFields(parentTask, parentTaskId);
  console.log(`[testes] parseAndStructureFields returned:`, parsed ? `{ scenarios: ${parsed.scenarios.length}, instances: ${parsed.instances.length} }` : "null");
  if (!parsed) {
    console.log(`[testes] parseAndStructureFields returned null, moving to backlog`);
    await testsUpdateTaskStatus(parentTaskId, "backlog de testes");
    return;
  }

  const { scenarios, instances } = parsed;

  console.log(`[testes] scenarios.length = ${scenarios.length}`);
  if (scenarios.length === 0) {
    console.log(`[testes] scenarios array is empty, aborting`);
    await testsPostComment(parentTaskId, "Não consegui identificar nenhum cenário no texto. Descreve os cenários que quer testar e manda de novo.");
    await testsUpdateTaskStatus(parentTaskId, "backlog de testes");
    return;
  }

  // Comentar os cenários interpretados
  let scenariosSummary = `CENÁRIOS IDENTIFICADOS\n`;
  scenariosSummary += `${"-".repeat(50)}\n\n`;
  scenarios.forEach((s, i) => {
    scenariosSummary += `${i + 1}. ${s.nome}\n`;
    scenariosSummary += `   ${s.descricao.slice(0, 100)}${s.descricao.length > 100 ? "..." : ""}\n`;
    if (s.mensagens) scenariosSummary += `   (${s.mensagens} mensagens)\n`;
    scenariosSummary += `\n`;
  });
  scenariosSummary += `Instâncias: ${instances.map((i) => i.nome).join(", ")}`;

  await testsPostComment(parentTaskId, scenariosSummary);

  // 4. Extrair assignees e datas da task-mãe pra propagar nas subtasks
  const parentAssignees = parentTask.assignees?.map((a) => a.id) ?? [];
  const parentDueDate = parentTask.due_date ?? null;
  const parentStartDate = parentTask.start_date ?? null;

  console.log(`[testes] Parent task assignees: ${parentAssignees.length > 0 ? parentAssignees.join(", ") : "none"}`);

  // 5. Criar subtasks (ou reusar existentes se já foram criadas)
  console.log(`[testes] Criando ${scenarios.length} subtasks pra task ${parentTaskId}...`);
  const subtaskContexts: SubtaskContext[] = [];

  // Buscar subtasks existentes pra evitar duplicatas
  let existingSubtasks: ClickUpTask[] = [];
  try {
    existingSubtasks = await testsGetSubtasks(parentTaskId);
    console.log(`[testes] Encontradas ${existingSubtasks.length} subtasks existentes`);
  } catch (err) {
    console.warn(`[testes] Não conseguiu listar subtasks existentes:`, err);
  }

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!;
    const instance = instances[i % instances.length]!;

    try {
      // Verificar se a subtask já existe (por nome único)
      const expectedSubtaskName = `[Cenário ${i + 1}/${scenarios.length}] ${scenario.nome}`;
      let subtask;

      // Procurar subtask existente com o mesmo nome
      const existingSubtask = existingSubtasks.find((s) => s.name === expectedSubtaskName);

      if (existingSubtask) {
        console.log(`[testes] Subtask já existe: ${existingSubtask.id} (${expectedSubtaskName}), pulando criação`);
        subtask = existingSubtask;
      } else {
        // Criar nova subtask
        subtask = await testsCreateSubtask({
          listId: env.CLICKUP_LIST_TESTES,
          name: expectedSubtaskName,
          description: scenario.descricao,
          parentTaskId,
          status: "backlog de testes",
          assignees: parentAssignees,
          due_date: parentDueDate,
          start_date: parentStartDate,
        });
        console.log(`[testes] Subtask criada: ${subtask.id}`);
      }

      const instanceFieldId = getCustomFieldId(parentTask, "instância atribuída") ??
        getCustomFieldId(parentTask, "instancia atribuida");
      if (instanceFieldId) {
        await testsUpdateCustomField(subtask.id, instanceFieldId, instance.nome);
      }

      subtaskContexts.push({
        subtaskId: subtask.id,
        parentTaskId,
        scenario,
        instance,
        messageCount: messagesPerConversation,
        project,
      });
    } catch (err) {
      console.error(`[testes] Erro ao criar/reusar subtask ${i + 1}:`, err);
      await testsPostComment(parentTaskId,
        `⚠️ Erro ao processar subtask "${scenario.nome}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const assignmentMsg = parentAssignees.length > 0
    ? ` Responsáveis copiados da task-mãe.`
    : ` (Preencha responsáveis e datas na task-mãe pra copiar nas subtasks)`;

  await testsPostComment(parentTaskId,
    `Criei ${subtaskContexts.length} subtasks, distribuídas em ${instances.length} instância(s).${assignmentMsg}`);

  if (subtaskContexts.length === 0) {
    await testsPostComment(parentTaskId, "Nenhuma subtask criou com sucesso. Verifica os dados e tenta de novo.");
    await testsUpdateTaskStatus(parentTaskId, "erro");
    return;
  }

  // Mudar task-mãe pra "Em Execução"
  await testsUpdateTaskStatus(parentTaskId, "em execução");

  // 6. Agrupar subtasks por instância pra serializar dentro de cada uma
  //    Paralelo ENTRE instâncias, sequencial DENTRO da mesma instância
  const instanceQueues = new Map<string, SubtaskContext[]>();
  for (const ctx of subtaskContexts) {
    const key = ctx.instance.nome;
    const queue = instanceQueues.get(key) ?? [];
    queue.push(ctx);
    instanceQueues.set(key, queue);
  }

  console.log(`[testes] Disparando ${subtaskContexts.length} testes (${instanceQueues.size} instância(s), sequencial por instância)...`);
  await testsPostComment(parentTaskId,
    `Iniciando ${subtaskContexts.length} testes em ${instanceQueues.size} instância(s). Cenários na mesma instância rodam um de cada vez.`);

  const subtaskResults: SubtaskResult[] = [];

  // Cada instância processa sua fila sequencialmente, mas instâncias rodam em paralelo
  async function processInstanceQueue(queue: SubtaskContext[]): Promise<SubtaskResult[]> {
    console.log(`[testes] processInstanceQueue starting with ${queue.length} subtasks`);
    const results: SubtaskResult[] = [];
    const testTimeoutMs = env.TESTES_TEST_TIMEOUT_MS; // Configurável via .env

    for (const ctx of queue) {
      console.log(`[testes] Processing subtask ${ctx.subtaskId} for scenario "${ctx.scenario.nome}"`);

      // Dispatch (status será atualizado durante SSE)
      try {
        ctx.sessionId = await dispatchTest(ctx, prompt as string, agentNumber as string, messagesPerConversation);
        console.log(`[testes] Dispatch succeeded for ${ctx.subtaskId}, sessionId: ${ctx.sessionId}`);
      } catch (err) {
        console.error(`[testes] Dispatch failed for ${ctx.subtaskId}:`, err instanceof Error ? err.message : String(err));
        await testsPostComment(ctx.subtaskId,
          `Falha ao disparar teste: ${err instanceof Error ? err.message : String(err)}`);
        await testsUpdateTaskStatus(ctx.subtaskId, "erro");
        results.push({
          subtaskId: ctx.subtaskId,
          scenarioName: ctx.scenario.nome,
          status: "erro",
          error: "Falha no dispatch",
        });
        continue;
      }

      // Aguardar conclusão com polling
      try {
        console.log(`[testes] Waiting for test completion for ${ctx.subtaskId}... (timeout: ${testTimeoutMs / 1000}s)`);

        // Usar Promise.race para implementar timeout geral
        const pollPromise = waitForTestCompletion(ctx, prompt as string);
        const timeoutPromise = new Promise<SubtaskResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Teste expirou após ${testTimeoutMs / 1000}s sem conclusão`)), testTimeoutMs)
        );

        const result = await Promise.race([pollPromise, timeoutPromise]);
        console.log(`[testes] Test completed for ${ctx.subtaskId}, status: ${result.status}`);
        results.push(result);
      } catch (err) {
        console.error(`[testes] Test polling failed for ${ctx.subtaskId}:`, err instanceof Error ? err.message : String(err));
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Parar o teste no testa-ai se ainda estiver rodando
        if (ctx.sessionId) {
          try {
            await stopTest(ctx.sessionId);
            console.log(`[testes] Parou sessão ${ctx.sessionId} due to error`);
          } catch (stopErr) {
            console.warn(`[testes] Falha ao parar sessão ${ctx.sessionId}:`, stopErr);
          }
        }

        await testsPostComment(ctx.subtaskId,
          `⏱️ Teste não completou em tempo hábil (${testTimeoutMs / 1000}s). ${errorMsg}`);
        await testsUpdateTaskStatus(ctx.subtaskId, "erro");

        results.push({
          subtaskId: ctx.subtaskId,
          scenarioName: ctx.scenario.nome,
          status: "erro",
          error: errorMsg,
        });
      }
    }
    console.log(`[testes] processInstanceQueue returning ${results.length} results`);
    return results;
  }

  const queueResults = await Promise.allSettled(
    [...instanceQueues.values()].map((queue) => processInstanceQueue(queue)),
  );

  for (const result of queueResults) {
    if (result.status === "fulfilled") {
      subtaskResults.push(...result.value);
    }
  }

  const successCount = subtaskResults.filter((r) => r.status !== "erro").length;
  const errorCount = subtaskResults.filter((r) => r.status === "erro").length;
  if (errorCount > 0) {
    await testsPostComment(parentTaskId,
      `Testes finalizados: ${successCount} ok, ${errorCount} com erro.`);
  }

  // 8. Consolidar relatório
  console.log(`[testes] Todas subtasks terminaram. Consolidando relatório...`);
  await generateConsolidatedReport(parentTaskId, parentTask.name, subtaskResults);
}

// ─── Case Data Extraction ───────────────────────────────────

function extractCaseData(scenarioDescription: string): Record<string, unknown> {
  const caseData: Record<string, unknown> = {};

  // Unescape newlines and other escape sequences
  const unescaped = scenarioDescription
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");

  // Extract patterns like **Campo:** valor
  const fieldPattern = /\*\*([^:*]+):\*?\s*([^\n*]+)/g;
  let match;
  while ((match = fieldPattern.exec(unescaped)) !== null) {
    const fieldName = match[1]!.trim().toLowerCase().replace(/\s+/g, "_");
    const fieldValue = match[2]!.trim();

    // Try to parse as number if it looks like one
    const numValue = parseInt(fieldValue, 10);
    caseData[fieldName] = isNaN(numValue) ? fieldValue : numValue;
  }

  // If no structured fields found, return empty object
  if (Object.keys(caseData).length === 0) {
    console.log(`[testes] ⚠️  No structured case data found in scenario`);
    console.log(`[testes] First 200 chars of scenario: ${unescaped.slice(0, 200)}`);
  } else {
    console.log(`[testes] ✅ Extracted case data: ${JSON.stringify(caseData)}`);
  }

  return caseData;
}

// ─── Dispatch ───────────────────────────────────────────────

async function dispatchTest(
  ctx: SubtaskContext,
  agentPrompt: string,
  agentWhatsappNumber: string,
  defaultMessageCount: number,
): Promise<string> {
  const env = getEnv();
  const caseData = extractCaseData(ctx.scenario.descricao);

  // Sempre usa o valor do campo "Mensagens por conversa" da task-mãe (ctx.messageCount).
  // Ignora ctx.scenario.mensagens (extraído pelo LLM do texto do cenário) pra
  // garantir que todos os cenários usem o mesmo número, independente do que
  // aparece na descrição ou da quantidade de instâncias.
  const messageCount = ctx.messageCount;
  const messageCountSource = `task-mãe "Mensagens por conversa" (${ctx.messageCount})${
    ctx.scenario.mensagens !== undefined ? `, ignorando scenario.mensagens=${ctx.scenario.mensagens}` : ""
  }`;

  const payload: TestaAiStartPayload = {
    agentWhatsappNumber,
    agentPrompt,
    messageCount,
    customScenario: ctx.scenario.descricao,
    externalRef: `clickup-${ctx.subtaskId}`,
    evolutionApiUrl: ctx.instance.url ?? env.EVOLUTION_API_URL,
    evolutionInstanceName: ctx.instance.nome,
    evolutionApiKey: ctx.instance.key ?? env.EVOLUTION_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    ...(Object.keys(caseData).length > 0 && { caseData }),
    ...(ctx.project && { project: ctx.project }),
  };

  console.log(`[testes] 📩 Enviando pro testa-ai: messageCount=${messageCount} (fonte: ${messageCountSource}), project=${ctx.project ?? "(nenhum)"}, cenario="${ctx.scenario.nome}", subtask=${ctx.subtaskId}`);

  if (Object.keys(caseData).length > 0) {
    console.log(`[testes] ✅ Payload includes caseData: CPF=${caseData.cpf}, Nome=${caseData.nome}, Contrato=${caseData.contrato}`);
  } else {
    console.log(`[testes] ⚠️  Payload has NO caseData (empty object)`);
  }
  const sessionId = await startTest(payload);

  const task = await testsGetTask(ctx.subtaskId);
  const sessionFieldId = getCustomFieldId(task, "sessão testa-ai") ??
    getCustomFieldId(task, "sessao testa-ai");
  if (sessionFieldId) {
    await testsUpdateCustomField(ctx.subtaskId, sessionFieldId, sessionId);
  }

  return sessionId;
}

// ─── LLM Enrichment: Análise aprofundada do relatório ─────────

const ENRICHMENT_PROMPT = `Você é um analista sênior de qualidade de agentes conversacionais de IA. Recebe o relatório bruto de um teste automatizado e deve produzir uma análise APROFUNDADA e ACIONÁVEL.

Gere a análise em seções com títulos claros. Não repita o que já tá no resumo bruto — CONTEXTUALIZE, INTERPRETE e ACIONE.

Estrutura obrigatória (em português, texto puro, sem markdown):

EXPECTATIVAS DO CENÁRIO
--------------------------------------------------
Liste 3-5 comportamentos que o agente DEVERIA ter exibido nesse cenário, derivados do prompt dele e da descrição do caso. Seja específico — cite o que estava pedido.

DESVIOS OBSERVADOS
--------------------------------------------------
Para cada desvio comportamental relevante, descreva: (1) o que deveria ter acontecido, (2) o que parece ter acontecido segundo o resumo, (3) o impacto no cliente/negócio. Máximo 5 desvios, ordenados por gravidade.

INTERPRETAÇÃO DE DESEMPENHO
--------------------------------------------------
Analise os números de tempo (média, mediana, max, timeouts) CONTEXTUALIZADOS. Não só repita — explique o que esses números significam pra experiência do cliente. Use comparação com padrões de atendimento (ex: média humana é ~5-15s).

CAUSAS PROVÁVEIS
--------------------------------------------------
Hipóteses do que no PROMPT ou na CONFIGURAÇÃO do agente causou as falhas. Seja concreto: "a instrução X pode estar conflitando com Y", "falta de mecanismo de fallback", "prompt muito longo", etc.

AÇÕES RECOMENDADAS
--------------------------------------------------
Lista priorizada de 3-5 mudanças CONCRETAS no prompt/config do agente. Cada ação deve ser acionável (ex: "adicionar cláusula X no prompt", "reduzir temperatura", "separar o sistema em 2 agentes"). Nada genérico.

NOTAS FINAIS
--------------------------------------------------
1-2 parágrafos com observações gerais, pontos de atenção pra revisão humana, ou riscos que não encaixam nas seções acima.

REGRAS:
- Seja direto, nada de floreio.
- Cite detalhes específicos do caso (CPF, nome, valores) quando relevante.
- Se não houver informação suficiente pra uma seção, escreva "Sem dados suficientes." e siga adiante.
- Nunca invente fatos que não estão no relatório bruto.`;

async function enrichReportWithLLM(
  report: TestaAiReport,
  scenario: TestScenario,
  agentPrompt: string,
  caseData: Record<string, unknown>,
): Promise<string | null> {
  try {
    const agent = getTestesAgent();

    const context = [
      `## Prompt do agente testado (sistema):`,
      agentPrompt.slice(0, 8000),
      ``,
      `## Cenário de teste:`,
      `Nome: ${scenario.nome}`,
      `Descrição: ${scenario.descricao}`,
      ``,
      Object.keys(caseData).length > 0
        ? `## Dados do caso:\n${Object.entries(caseData).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
        : `## Dados do caso: (nenhum)`,
      ``,
      `## Relatório bruto do testa-ai:`,
      `Veredicto: ${report.verdict}`,
      report.score !== undefined ? `Score: ${report.score}/10` : ``,
      report.hallucinations !== undefined ? `Alucinações detectadas: ${report.hallucinations}` : ``,
      report.summary ? `\nResumo:\n${report.summary}` : ``,
      report.issues && report.issues.length > 0
        ? `\nIssues reportadas:\n${report.issues.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}`
        : ``,
      report.recommendations && report.recommendations.length > 0
        ? `\nRecomendações iniciais:\n${report.recommendations.map((r, idx) => `${idx + 1}. ${r}`).join("\n")}`
        : ``,
      report.responseTimeAnalysis
        ? `\nMétricas de desempenho:\n${Object.entries(report.responseTimeAnalysis).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
        : ``,
    ]
      .filter((l) => l !== "")
      .join("\n");

    const userPrompt = `${ENRICHMENT_PROMPT}\n\n---\n\n${context}\n\n---\n\nGere a análise agora.`;
    console.log(`[testes] 🧠 Enriquecendo relatório com LLM (${userPrompt.length} chars)...`);

    const response = await agent.generate(userPrompt);
    const text = typeof response.text === "string" ? response.text : String(response.text);

    if (!text || text.trim().length === 0) {
      console.warn(`[testes] ⚠️  LLM retornou texto vazio na análise aprofundada`);
      return null;
    }

    console.log(`[testes] ✅ Análise aprofundada gerada (${text.length} chars)`);
    return text.trim();
  } catch (err) {
    console.warn(`[testes] ⚠️  Falha ao enriquecer relatório:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Polling: Aguarda conclusão do teste ──────────────────────

async function waitForTestCompletion(ctx: SubtaskContext, agentPrompt: string): Promise<SubtaskResult> {
  const startTime = new Date();
  const externalRef = `clickup-${ctx.subtaskId}`;

  registerActiveTest({
    subtaskId: ctx.subtaskId,
    parentTaskId: ctx.parentTaskId,
    sessionId: ctx.sessionId!,
    scenarioName: ctx.scenario.nome,
    expectedMessages: ctx.messageCount,
    startedAt: startTime.toISOString(),
  });

  try {
    // Fazer polling até completar ou erro
    const expectedMessages = ctx.messageCount;
    const pollResult = await pollTestStatus(
      ctx.sessionId!,
      externalRef,
      async (status) => {
        console.log(`[testes] 📊 subtask=${ctx.subtaskId} status=${status.status} messagesRemaining=${status.messagesRemaining ?? "?"} expected=${expectedMessages ?? "?"}`);
        if (status.status === "running") {
          await testsUpdateTaskStatus(ctx.subtaskId, "em execução");
        }
      },
      (status) => {
        updateActiveTest(ctx.subtaskId, {
          lastStatus: status.status,
          messagesRemaining: status.messagesRemaining,
          lastPollAt: new Date().toISOString(),
        });
      },
    );

    // Só há relatório quando a sessão completou. Em `error`/`stopped` o endpoint
    // /report retorna 404, então abortamos com mensagem clara.
    if (pollResult.status !== "completed") {
      throw new Error(`Teste encerrado sem relatório (status: ${pollResult.status})`);
    }

    // Teste completou, buscar relatório
    const report = await getTestReport(ctx.sessionId!);
    console.log(`[testes] ✅ Report recebido para ${ctx.subtaskId}`);

    // Enriquecer análise com LLM (não-bloqueante em caso de falha)
    const caseDataForEnrichment = extractCaseData(ctx.scenario.descricao);
    const deepAnalysis = await enrichReportWithLLM(report, ctx.scenario, agentPrompt, caseDataForEnrichment);

    const endTime = new Date();
    const executionTimeMs = endTime.getTime() - startTime.getTime();
    const executionTimeSec = (executionTimeMs / 1000).toFixed(2);

    // Gerar relatório detalhado
    const verdictPT = report.verdict === "APROVADO" ? "✅ APROVADO" :
      report.verdict === "REPROVADO" ? "❌ REPROVADO" : "⚠️ NECESSITA REVISÃO";

    let summary = `📊 RELATÓRIO DETALHADO DO TESTE\n`;
    summary += `${"=".repeat(70)}\n\n`;

    summary += `1. INFORMAÇÕES GERAIS DO TESTE\n`;
    summary += `${"-".repeat(70)}\n`;
    summary += `Cenário: ${ctx.scenario.nome}\n`;
    summary += `Data/Hora: ${startTime.toLocaleString("pt-BR")}\n`;
    summary += `Tempo de Execução: ${executionTimeSec}s\n`;
    summary += `Instância: ${ctx.instance.nome}\n`;
    summary += `Sessão ID: ${ctx.sessionId}\n\n`;

    summary += `2. RESULTADO FINAL\n`;
    summary += `${"-".repeat(70)}\n`;
    summary += `Veredicto: ${verdictPT}\n`;
    if (report.score !== undefined) {
      summary += `Pontuação: ${report.score}/10 (${((report.score / 10) * 100).toFixed(1)}%)\n`;
    }
    summary += `\n`;

    if (report.summary) {
      summary += `3. RESUMO DA ANÁLISE\n`;
      summary += `${"-".repeat(70)}\n`;
      summary += `${report.summary}\n\n`;
    }

    if (report.hallucinations !== undefined) {
      summary += `4. QUALIDADE DO ATENDIMENTO\n`;
      summary += `${"-".repeat(70)}\n`;
      summary += `Alucinações Detectadas: ${report.hallucinations}\n`;
      const qualityScore = Math.max(0, 100 - (report.hallucinations * 10));
      summary += `Índice de Qualidade: ${qualityScore.toFixed(1)}%\n\n`;
    }

    if (report.issues && report.issues.length > 0) {
      summary += `5. PROBLEMAS ENCONTRADOS\n`;
      summary += `${"-".repeat(70)}\n`;
      report.issues.forEach((i, idx) => {
        summary += `${idx + 1}. ${i}\n`;
      });
      summary += `\n`;
    }

    if (report.recommendations && report.recommendations.length > 0) {
      summary += `6. RECOMENDAÇÕES E AÇÕES\n`;
      summary += `${"-".repeat(70)}\n`;
      report.recommendations.forEach((r, idx) => {
        summary += `${idx + 1}. ${r}\n`;
      });
      summary += `\n`;
    }

    if (deepAnalysis) {
      summary += `7. ANÁLISE APROFUNDADA (IA)\n`;
      summary += `${"-".repeat(70)}\n`;
      summary += `${deepAnalysis}\n\n`;
    }

    if (report.responseTimeAnalysis) {
      summary += `8. ANÁLISE DE DESEMPENHO\n`;
      summary += `${"-".repeat(70)}\n`;
      const rtAnalysis = report.responseTimeAnalysis as Record<string, unknown>;
      for (const [key, value] of Object.entries(rtAnalysis)) {
        summary += `${key}: ${value}\n`;
      }
      summary += `\n`;
    }

    summary += `9. CONCLUSÃO\n`;
    summary += `${"-".repeat(70)}\n`;
    if (report.verdict === "APROVADO") {
      summary += `✅ Este teste foi APROVADO com sucesso.\n`;
      summary += `O agente respondeu corretamente aos cenários propostos.\n`;
    } else if (report.verdict === "REPROVADO") {
      summary += `❌ Este teste foi REPROVADO.\n`;
      summary += `Foram identificados problemas significativos que precisam de correção.\n`;
    } else {
      summary += `⚠️ Este teste NECESSITA DE REVISÃO HUMANA.\n`;
      summary += `Resultado inconclusivo. Análise manual recomendada.\n`;
    }
    summary += `\n${"=".repeat(70)}\n`;

    // Salvar no campo customizado
    const task = await testsGetTask(ctx.subtaskId);
    const reportFieldId = getCustomFieldId(task, "relatório (json)") ??
      getCustomFieldId(task, "relatorio (json)") ??
      getCustomFieldId(task, "relatório json") ??
      getCustomFieldId(task, "relatorio json");
    if (reportFieldId) {
      await testsUpdateCustomField(ctx.subtaskId, reportFieldId, summary);
    }

    await testsPostComment(ctx.subtaskId, summary);

    // Determinar status final
    let finalStatus: SubtaskResult["status"] = "aguardando revisão";
    switch (report.verdict) {
      case "APROVADO":
        finalStatus = "aprovado";
        break;
      case "REPROVADO":
        finalStatus = "reprovado";
        break;
    }

    await testsUpdateTaskStatus(ctx.subtaskId, finalStatus);

    return {
      subtaskId: ctx.subtaskId,
      scenarioName: ctx.scenario.nome,
      status: finalStatus,
      report,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[testes] Erro ao aguardar conclusão para ${ctx.subtaskId}:`, err);

    // Tentar parar o teste
    if (ctx.sessionId) {
      try {
        await stopTest(ctx.sessionId);
        console.log(`[testes] Teste ${ctx.sessionId} parado`);
      } catch (stopErr) {
        console.warn(`[testes] Falha ao parar teste ${ctx.sessionId}:`, stopErr);
      }
    }

    await testsPostComment(ctx.subtaskId, `⏱️ Erro ao aguardar teste: ${errorMsg}`);
    await testsUpdateTaskStatus(ctx.subtaskId, "erro");

    return {
      subtaskId: ctx.subtaskId,
      scenarioName: ctx.scenario.nome,
      status: "erro",
      error: errorMsg,
    };
  } finally {
    unregisterActiveTest(ctx.subtaskId);
  }
}

// ─── Consolidated Report ────────────────────────────────────

async function generateConsolidatedReport(
  parentTaskId: string,
  parentTaskName: string,
  results: SubtaskResult[],
): Promise<void> {
  const approved = results.filter((r) => r.status === "aprovado");
  const rejected = results.filter((r) => r.status === "reprovado");
  const review = results.filter((r) => r.status === "aguardando revisão");
  const errored = results.filter((r) => r.status === "erro");

  const scores = results
    .map((r) => r.report?.score)
    .filter((s): s is number => typeof s === "number");
  const avgScore = scores.length > 0
    ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    : "N/A";

  let overallVerdict: string;
  let overallVerdictPT: string;
  if (rejected.length > 0) {
    overallVerdict = "REPROVADO";
    overallVerdictPT = "❌ Reprovado";
  } else if (approved.length === results.length) {
    overallVerdict = "APROVADO";
    overallVerdictPT = "✅ Aprovado";
  } else {
    overallVerdict = "REVISAR";
    overallVerdictPT = "⚠️ Necessita Revisão";
  }

  const allIssues: string[] = [];
  for (const r of results) {
    if (r.report?.issues) allIssues.push(...r.report.issues);
  }
  const issueCounts = new Map<string, number>();
  for (const issue of allIssues) {
    issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
  }
  const recurringIssues = [...issueCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  const allRecommendations = new Set<string>();
  for (const r of results) {
    if (r.report?.recommendations) {
      for (const rec of r.report.recommendations) allRecommendations.add(rec);
    }
  }

  let report = `📊 RELATÓRIO CONSOLIDADO — ${parentTaskName}\n`;
  report += `${"=".repeat(70)}\n\n`;

  report += `SUMÁRIO EXECUTIVO\n`;
  report += `${"-".repeat(70)}\n`;
  report += `Total de cenários: ${results.length}\n`;
  report += `✅ Aprovados: ${approved.length}\n`;
  report += `❌ Reprovados: ${rejected.length}\n`;
  report += `⚠️  Necessita revisão: ${review.length}\n`;
  report += `Erros: ${errored.length}\n`;
  report += `Nota média: ${avgScore}/10\n`;
  report += `Veredicto geral: ${overallVerdictPT}\n\n`;

  report += `DETALHES POR CENÁRIO\n`;
  report += `${"-".repeat(70)}\n`;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const statusIcon = r.status === "aprovado" ? "✅" : r.status === "reprovado" ? "❌" : r.status === "erro" ? "⚠️" : "🔄";
    report += `\n${statusIcon} [Cenário ${i + 1}/${results.length}] ${r.scenarioName}\n`;

    if (r.report) {
      if (r.report.score !== undefined) report += `  Nota: ${r.report.score}/10\n`;
      if (r.report.hallucinations !== undefined) report += `  Alucinações: ${r.report.hallucinations}\n`;
      if (r.report.summary) report += `  Resumo: ${r.report.summary}\n`;
      if (r.report.issues?.length) report += `  Problemas: ${r.report.issues.join("; ")}\n`;
    }
    if (r.error) report += `  Erro: ${r.error}\n`;
  }

  if (recurringIssues.length > 0) {
    report += `\nPROBLEMAS RECORRENTES\n`;
    report += `${"-".repeat(70)}\n`;
    for (const [issue, count] of recurringIssues) {
      report += `• ${issue} (${count}/${results.length} cenários)\n`;
    }
  }

  if (allRecommendations.size > 0) {
    report += `\nRECOMENDAÇÕES\n`;
    report += `${"-".repeat(70)}\n`;
    for (const rec of allRecommendations) {
      report += `• ${rec}\n`;
    }
  }

  await testsPostComment(parentTaskId, report);

  // Salvar relatório consolidado como texto no campo customizado (não JSON)
  const parentTask = await testsGetTask(parentTaskId);
  const consolidatedFieldId = getCustomFieldId(parentTask, "relatório consolidado (json)") ??
    getCustomFieldId(parentTask, "relatorio consolidado (json)") ??
    getCustomFieldId(parentTask, "relatório consolidado json");
  if (consolidatedFieldId) {
    await testsUpdateCustomField(parentTaskId, consolidatedFieldId, report);
  }

  await testsUpdateTaskStatus(parentTaskId, "aguardando revisão");

  console.log(`[testes] ✅ Relatório consolidado gerado pra task ${parentTaskId}: ${overallVerdict}`);
}
