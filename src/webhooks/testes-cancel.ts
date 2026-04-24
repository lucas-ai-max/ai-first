import { cancelTestsForTask } from "../agents/testes-agent.js";
import { postComment, getClickUpToken } from "../tools/clickup-mcp.js";

const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 10_000;

function isDuplicate(taskId: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(taskId);
  if (last && now - last < DEBOUNCE_MS) return true;
  recentEvents.set(taskId, now);
  if (recentEvents.size > 100) {
    for (const [key, time] of recentEvents) {
      if (now - time > DEBOUNCE_MS * 2) recentEvents.delete(key);
    }
  }
  return false;
}

interface CommentWebhookPayload {
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

// Aceita variações do mention (@testes, @agente de testes, @agente-de-testes)
// desde que venha junto com #cancelar no mesmo comentário.
const MENTION_REGEX = /@(?:testes|agente[\s\-_]+de[\s\-_]+testes)/i;
const CANCEL_TAG_REGEX = /#cancelar/i;

export async function handleTestesCancelWebhook(payload: CommentWebhookPayload): Promise<void> {
  if (payload.event !== "taskCommentPosted") {
    console.log(`[testes-cancel] Evento ignorado: ${payload.event}`);
    return;
  }

  const commentData = payload.history_items[0]?.comment;
  if (!commentData) {
    console.log(`[testes-cancel] Evento sem dados de comentário, ignorando.`);
    return;
  }

  const text = commentData.text_content ?? "";
  const hasCancelTag = CANCEL_TAG_REGEX.test(text);
  const hasMention = MENTION_REGEX.test(text);

  if (!hasCancelTag || !hasMention) {
    if (hasCancelTag || hasMention) {
      // Só um dos dois — loga pra diagnóstico, não aciona
      console.log(`[testes-cancel] Comentário parcial (mention=${hasMention}, cancel=${hasCancelTag}), ignorando. Texto: ${text.slice(0, 200)}`);
    }
    return;
  }

  // Sem loop-prevention por user.id: a regex exige #cancelar + @testes/@agente de testes,
  // combinação que o próprio bot nunca gera nas mensagens de confirmação.

  const taskId = payload.task_id;
  if (isDuplicate(taskId)) {
    console.log(`[testes-cancel] Evento duplicado pra task ${taskId}, ignorando.`);
    return;
  }

  console.log(`[testes-cancel] 🛑 Cancelamento solicitado pra task ${taskId} por @${commentData.user.username}`);

  try {
    await cancelTestsForTask(taskId, commentData.user.username);
    console.log(`[testes-cancel] ✅ Cancelamento concluído pra task ${taskId}`);
  } catch (err) {
    console.error(`[testes-cancel] ❌ Erro ao cancelar testes pra task ${taskId}:`, err);
    try {
      const msg = `⚠️ Erro ao cancelar testes: ${err instanceof Error ? err.message : String(err)}`;
      await postComment(taskId, msg, getClickUpToken(true));
    } catch {
      // se nem o comentário funcionar, só loga
    }
  }
}
