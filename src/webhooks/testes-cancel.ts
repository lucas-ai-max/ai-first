import { getEnv } from "../config/env.js";
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

const CANCEL_REGEX = /(@testes[\s\S]*?#cancelar)|(#cancelar[\s\S]*?@testes)/i;

export async function handleTestesCancelWebhook(payload: CommentWebhookPayload): Promise<void> {
  const env = getEnv();

  if (payload.event !== "taskCommentPosted") {
    console.log(`[testes-cancel] Evento ignorado: ${payload.event}`);
    return;
  }

  const commentData = payload.history_items[0]?.comment;
  if (!commentData) {
    console.log(`[testes-cancel] Evento sem dados de comentário, ignorando.`);
    return;
  }

  if (!CANCEL_REGEX.test(commentData.text_content)) {
    return;
  }

  if (String(commentData.user.id) === env.CLICKUP_AGENT_USER_ID) {
    console.log(`[testes-cancel] Comentário do próprio agente, ignorando.`);
    return;
  }

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
