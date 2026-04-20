import { getEnv } from "../config/env.js";
import { matchesLgpdTerms } from "../config/lgpd-terms.js";
import {
  getTask,
  getTaskComments,
  postComment,
  updateCustomField,
  updateTaskStatus,
  type ClickUpTask,
  type ClickUpComment,
} from "../tools/clickup-mcp.js";
import {
  runTriagem,
  formatTriagemComment,
  type TriagemResult,
} from "../agents/triagem-agent.js";

// ─── Debounce: ignora eventos duplicados dentro de 10s (RK4) ────
const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 10_000;

function isDuplicate(taskId: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(taskId);
  if (last && now - last < DEBOUNCE_MS) {
    return true;
  }
  recentEvents.set(taskId, now);
  // Limpa entradas antigas periodicamente
  if (recentEvents.size > 100) {
    for (const [key, time] of recentEvents) {
      if (now - time > DEBOUNCE_MS * 2) {
        recentEvents.delete(key);
      }
    }
  }
  return false;
}

// ─── Tipos do webhook ClickUp ────────────────────────────────────

interface ClickUpWebhookPayload {
  event: string;
  task_id: string;
  history_items: Array<{
    comment?: {
      id: string;
      text_content: string;
      user: { id: number; username: string };
    };
  }>;
}

// ─── Handler principal ──────────────────────────────────────────

export async function handleTriagemWebhook(payload: ClickUpWebhookPayload): Promise<void> {
  const env = getEnv();

  // 1. Validar evento
  if (payload.event !== "taskCommentPosted") {
    console.log(`[triagem] Evento ignorado: ${payload.event}`);
    return;
  }

  const taskId = payload.task_id;
  const commentData = payload.history_items[0]?.comment;
  if (!commentData) {
    console.log(`[triagem] Evento sem dados de comentário, ignorando.`);
    return;
  }

  // 2. Verificar se contém @triagem (case-insensitive)
  if (!commentData.text_content.toLowerCase().includes("@triagem")) {
    console.log(`[triagem] Comentário sem @triagem, ignorando.`);
    return;
  }

  // 3. Ignorar comentários do próprio agente (evita loop — RK2)
  if (String(commentData.user.id) === env.CLICKUP_AGENT_USER_ID) {
    console.log(`[triagem] Comentário do próprio agente, ignorando.`);
    return;
  }

  // 4. Debounce (RK4)
  if (isDuplicate(taskId)) {
    console.log(`[triagem] Evento duplicado pra task ${taskId}, ignorando.`);
    return;
  }

  console.log(`[triagem] Processando triagem pra task ${taskId}...`);

  try {
    // 5. Ler contexto completo da task (RF2)
    let task: ClickUpTask;
    try {
      task = await getTask(taskId);
    } catch (err) {
      // Task deletada entre webhook e leitura — para silenciosamente
      console.log(`[triagem] Task ${taskId} não encontrada (possivelmente deletada). Parando.`);
      return;
    }

    // 6. Verificar se pertence à lista de Bugs (RF1)
    // Nota: idealmente verificar pelo list_id do payload, mas o ClickUp webhook
    // inclui o task_id. Verificamos pelo custom field ou via API.

    const comments = await getTaskComments(taskId);

    // Preparar contexto dos comentários (excluindo os do próprio agente pra não duplicar)
    const commentContext = comments
      .filter((c: ClickUpComment) => String(c.user.id) !== env.CLICKUP_AGENT_USER_ID)
      .map((c: ClickUpComment) => ({
        author: c.user.username,
        text: c.comment_text,
      }));

    // Extrair valores atuais dos custom fields
    const currentFields: Record<string, string> = {};
    for (const field of task.custom_fields) {
      if (field.value !== undefined && field.value !== null) {
        currentFields[field.name] = String(field.value);
      }
    }

    // 7. Executar triagem via LLM (RF3–RF6)
    let result = await runTriagem(
      task.name,
      task.description,
      commentContext,
      currentFields,
    );

    // 8. Double-check LGPD via regex (defesa em profundidade — RNF2: 100% recall)
    const fullText = `${task.name} ${task.description} ${comments.map((c: ClickUpComment) => c.comment_text).join(" ")}`;
    const lgpdMatches = matchesLgpdTerms(fullText);

    if (lgpdMatches.length > 0 && !result.dados_paciente) {
      // LLM perdeu — forçar flag LGPD (segurança extra)
      console.warn(`[triagem] ⚠️ LLM não detectou LGPD mas regex encontrou: ${lgpdMatches.join(", ")}. Forçando flag.`);
      result = {
        ...result,
        severidade: "P0",
        severidade_forcada_lgpd: true,
        dados_paciente: true,
        lgpd_termos_encontrados: lgpdMatches,
        dev_sugerido: `@${env.TRIAGEM_BACKEND_DEV}`,
      };
    }

    // Também completar termos caso LLM tenha marcado mas perdeu algum
    if (result.dados_paciente && lgpdMatches.length > result.lgpd_termos_encontrados.length) {
      result.lgpd_termos_encontrados = lgpdMatches;
    }

    // 9. Preencher custom fields (RF7)
    await fillCustomFields(taskId, task, result);

    // 10. Postar comentário estruturado (RF9)
    const comment = formatTriagemComment(result);
    await postComment(taskId, comment);

    // 11. Mudar status (RF10)
    await handleStatusChange(taskId, task, result);

    console.log(`[triagem] ✅ Triagem concluída pra task ${taskId}: ${result.severidade} / ${result.modulo ?? "?"} / confiança ${result.confianca}`);
  } catch (err) {
    // RNF5: falha → comentário de erro
    console.error(`[triagem] ❌ Erro ao processar task ${taskId}:`, err);
    try {
      const errorMsg =
        `Deu erro ao tentar triagear essa task. Faz a triagem manual por enquanto.\n\n` +
        `Erro: ${err instanceof Error ? err.message : String(err)}\n\n` +
        `Quando resolver, manda um \`@triagem\` de novo.`;
      await postComment(taskId, errorMsg);
    } catch {
      console.error(`[triagem] Falha ao postar comentário de erro pra task ${taskId}`);
    }
  }
}

// ─── Preencher custom fields ────────────────────────────────────

async function fillCustomFields(
  taskId: string,
  task: ClickUpTask,
  result: TriagemResult,
): Promise<void> {
  const fieldMap = new Map<string, string>();
  for (const field of task.custom_fields) {
    fieldMap.set(field.name.toLowerCase(), field.id);
  }

  // Severidade — dropdown ou text
  const severidadeFieldId = fieldMap.get("severidade");
  if (severidadeFieldId) {
    const field = task.custom_fields.find((f) => f.id === severidadeFieldId);
    const option = field?.type_config?.options?.find(
      (o) => o.name === result.severidade || o.label === result.severidade,
    );
    if (option) {
      await updateCustomField(taskId, severidadeFieldId, option.id);
    } else {
      await updateCustomField(taskId, severidadeFieldId, result.severidade);
    }
  }

  // Módulo
  const moduloFieldId = fieldMap.get("módulo") ?? fieldMap.get("modulo");
  if (moduloFieldId && result.modulo) {
    const field = task.custom_fields.find((f) => f.id === moduloFieldId);
    const option = field?.type_config?.options?.find(
      (o) => o.name === result.modulo || o.label === result.modulo,
    );
    if (option) {
      await updateCustomField(taskId, moduloFieldId, option.id);
    } else {
      await updateCustomField(taskId, moduloFieldId, result.modulo);
    }
  }

  // Canal de origem
  const canalFieldId = fieldMap.get("canal de origem") ?? fieldMap.get("canal");
  if (canalFieldId && result.canal) {
    const field = task.custom_fields.find((f) => f.id === canalFieldId);
    const option = field?.type_config?.options?.find(
      (o) => o.name === result.canal || o.label === result.canal,
    );
    if (option) {
      await updateCustomField(taskId, canalFieldId, option.id);
    } else {
      await updateCustomField(taskId, canalFieldId, result.canal);
    }
  }

  // Dados de paciente? — checkbox
  const lgpdFieldId =
    fieldMap.get("dados de paciente?") ??
    fieldMap.get("dados de paciente") ??
    fieldMap.get("lgpd");
  if (lgpdFieldId) {
    await updateCustomField(taskId, lgpdFieldId, result.dados_paciente);
  }
}

// ─── Status change logic ────────────────────────────────────────

async function handleStatusChange(
  taskId: string,
  task: ClickUpTask,
  result: TriagemResult,
): Promise<void> {
  const currentStatus = task.status.status.toLowerCase();

  // RF11: em baixa confiança, não muda status
  if (result.confianca === "Baixa") {
    console.log(`[triagem] Confiança baixa — status mantido em "${task.status.status}"`);
    return;
  }

  // RF10: só muda de Inbox → Em Análise
  if (currentStatus === "inbox" || currentStatus === "to do") {
    await updateTaskStatus(taskId, "em análise");
    console.log(`[triagem] Status alterado: ${task.status.status} → Em Análise`);
  } else {
    console.log(`[triagem] Status mantido: ${task.status.status} (não é Inbox)`);
  }
}
