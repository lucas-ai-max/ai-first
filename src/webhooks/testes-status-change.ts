import { getTask } from "../tools/clickup-mcp.js";
import { runTestBattery } from "../agents/testes-agent.js";

// ─── Debounce: ignora eventos duplicados dentro de 10s ──────
const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 10_000;

function isDuplicate(taskId: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(taskId);
  if (last && now - last < DEBOUNCE_MS) {
    return true;
  }
  recentEvents.set(taskId, now);
  if (recentEvents.size > 100) {
    for (const [key, time] of recentEvents) {
      if (now - time > DEBOUNCE_MS * 2) {
        recentEvents.delete(key);
      }
    }
  }
  return false;
}

// ─── Tipos do webhook ClickUp ───────────────────────────────

interface ClickUpWebhookPayload {
  event: string;
  task_id: string;
  history_items: Array<{
    field?: string;
    after?: { status?: string };
    before?: { status?: string };
  }>;
}

// ─── Handler principal ──────────────────────────────────────

export async function handleTestesWebhook(payload: ClickUpWebhookPayload): Promise<void> {
  // 1. Validar evento
  if (payload.event !== "taskStatusUpdated") {
    console.log(`[testes] Evento ignorado: ${payload.event}`);
    return;
  }

  const taskId = payload.task_id;

  // 2. Verificar se o novo status é "Em Preparação"
  const statusChange = payload.history_items.find((h) => h.field === "status");
  const newStatus = statusChange?.after?.status?.toLowerCase();

  if (newStatus !== "em preparação" && newStatus !== "em preparacao") {
    console.log(`[testes] Status "${newStatus}" ignorado (só dispara em "Em Preparação").`);
    return;
  }

  // 3. Debounce
  if (isDuplicate(taskId)) {
    console.log(`[testes] Evento duplicado pra task ${taskId}, ignorando.`);
    return;
  }

  // 4. Ignorar subtasks (só tasks-mãe disparam a bateria)
  try {
    const task = await getTask(taskId);
    if (task.parent) {
      console.log(`[testes] Task ${taskId} é subtask, ignorando.`);
      return;
    }
  } catch {
    console.log(`[testes] Não conseguiu ler task ${taskId}, ignorando.`);
    return;
  }

  console.log(`[testes] 🚀 Task ${taskId} mudou pra "Em Preparação". Iniciando bateria de testes...`);

  try {
    await runTestBattery(taskId);
  } catch (err) {
    console.error(`[testes] ❌ Erro fatal ao executar bateria pra task ${taskId}:`, err);
    try {
      const { postComment, updateTaskStatus } = await import("../tools/clickup-mcp.js");
      const errorDetail = err instanceof Error ? err.message : String(err);
      await postComment(taskId, `Erro inesperado ao processar a bateria: ${errorDetail}`);
      await updateTaskStatus(taskId, "erro");
    } catch {
      // Se nem o comentário de erro funcionar, só loga
    }
  }
}
