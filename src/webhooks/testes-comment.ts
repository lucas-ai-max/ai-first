import { cancelTestsForTask, answerTestQuestion } from "../agents/testes-agent.js";
import { postComment, getClickUpToken } from "../tools/clickup-mcp.js";

const recentEvents = new Map<string, number>();
const DEBOUNCE_MS = 10_000;

function isDuplicate(taskId: string, kind: string): boolean {
  const key = `${kind}:${taskId}`;
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEBOUNCE_MS) return true;
  recentEvents.set(key, now);
  if (recentEvents.size > 200) {
    for (const [k, time] of recentEvents) {
      if (now - time > DEBOUNCE_MS * 2) recentEvents.delete(k);
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

// Aceita variações: @testes, @agente de testes, @agente-de-testes
const MENTION_REGEX = /@(?:testes|agente[\s\-_]+de[\s\-_]+testes)/i;
const CANCEL_TAG_REGEX = /#cancelar/i;

function stripMentionAndTags(text: string): string {
  return text
    .replace(MENTION_REGEX, "")
    .replace(/#cancelar/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function handleTestesCommentWebhook(payload: CommentWebhookPayload): Promise<void> {
  if (payload.event !== "taskCommentPosted") {
    console.log(`[testes-comment] Evento ignorado: ${payload.event}`);
    return;
  }

  const commentData = payload.history_items[0]?.comment;
  if (!commentData) {
    console.log(`[testes-comment] Evento sem dados de comentário, ignorando.`);
    return;
  }

  const text = commentData.text_content ?? "";
  if (!MENTION_REGEX.test(text)) {
    return; // sem mention, ignora silenciosamente
  }

  const taskId = payload.task_id;
  const username = commentData.user.username;

  // Branch 1: cancelamento
  if (CANCEL_TAG_REGEX.test(text)) {
    if (isDuplicate(taskId, "cancel")) {
      console.log(`[testes-comment] Cancel duplicado pra task ${taskId}, ignorando.`);
      return;
    }
    console.log(`[testes-comment] 🛑 Cancelamento solicitado pra task ${taskId} por @${username}`);
    try {
      await cancelTestsForTask(taskId, username);
      console.log(`[testes-comment] ✅ Cancelamento concluído pra task ${taskId}`);
    } catch (err) {
      console.error(`[testes-comment] ❌ Erro ao cancelar testes pra task ${taskId}:`, err);
      try {
        const msg = `⚠️ Erro ao cancelar testes: ${err instanceof Error ? err.message : String(err)}`;
        await postComment(taskId, msg, getClickUpToken(true));
      } catch {
        // se nem o comentário funcionar, só loga
      }
    }
    return;
  }

  // Branch 2: pergunta livre
  if (isDuplicate(taskId, "question")) {
    console.log(`[testes-comment] Pergunta duplicada pra task ${taskId}, ignorando.`);
    return;
  }
  const question = stripMentionAndTags(text) || "Resuma o estado atual dos testes dessa task.";
  console.log(`[testes-comment] ❓ Pergunta de @${username} na task ${taskId}: "${question.slice(0, 200)}"`);
  try {
    await answerTestQuestion(taskId, question, username);
    console.log(`[testes-comment] ✅ Resposta postada pra task ${taskId}`);
  } catch (err) {
    console.error(`[testes-comment] ❌ Erro ao responder pergunta na task ${taskId}:`, err);
    try {
      const msg = `⚠️ Não consegui responder: ${err instanceof Error ? err.message : String(err)}`;
      await postComment(taskId, msg, getClickUpToken(true));
    } catch {
      // ignorar
    }
  }
}
