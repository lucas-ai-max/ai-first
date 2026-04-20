import { getEnv } from "../config/env.js";
import * as http from "node:http";
import * as https from "node:https";

// ─── HTTP Agent com Keep-Alive ──────────────────────────────

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

function getAgent(url: string): http.Agent | https.Agent {
  return url.startsWith("https") ? httpsAgent : httpAgent;
}

// ─── Types ──────────────────────────────────────────────────

export interface TestaAiStartPayload {
  agentWhatsappNumber: string;
  agentPrompt: string;
  messageCount: number;
  customScenario: string;
  externalRef: string;
  evolutionApiUrl: string;
  evolutionInstanceName: string;
  evolutionApiKey: string;
  openaiApiKey: string;
  caseData?: Record<string, unknown>;
}

export interface TestaAiStartResponse {
  sessionId: string;
}


export interface TestaAiReport {
  verdict: "APROVADO" | "REPROVADO" | "NECESSITA AJUSTES" | string;
  score?: number;
  hallucinations?: number;
  issues?: string[];
  recommendations?: string[];
  summary?: string;
  responseTimeAnalysis?: Record<string, unknown>;
}

// ─── HTTP Client ────────────────────────────────────────────

/**
 * Dispara um teste no testa-ai. Retorna o sessionId.
 * Timeout configurável via TESTES_DISPATCH_TIMEOUT_MS (default 10s).
 */
export async function startTest(payload: TestaAiStartPayload): Promise<string> {
  const env = getEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.TESTES_DISPATCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${env.TESTA_AI_BASE_URL}/api/test/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.TESTA_AI_API_KEY && { "Authorization": `Bearer ${env.TESTA_AI_API_KEY}` }),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      agent: getAgent(env.TESTA_AI_BASE_URL),
    } as any);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`testa-ai POST /api/test/start ${res.status}: ${body}`);
    }

    const data = (await res.json()) as TestaAiStartResponse;
    return data.sessionId;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Para um teste em execução no testa-ai.
 */
export async function stopTest(sessionId: string): Promise<void> {
  const env = getEnv();
  const res = await fetch(`${env.TESTA_AI_BASE_URL}/api/test/${sessionId}/stop`, {
    method: "POST",
    headers: env.TESTA_AI_API_KEY ? { "Authorization": `Bearer ${env.TESTA_AI_API_KEY}` } : {},
    agent: getAgent(env.TESTA_AI_BASE_URL),
  } as any);
  if (!res.ok) {
    console.warn(`[testa-ai] Falha ao parar sessão ${sessionId}: ${res.status}`);
  }
}

// ─── Polling Client ─────────────────────────────────────────

export interface TestStatus {
  status: "pending" | "configuring_webhook" | "running" | "generating_report" | "completed" | "stopped" | "error";
  messagesRemaining?: number;
}

/**
 * Faz polling do status do teste até completar ou dar erro.
 * O timeout é controlado externamente pelo chamador (Promise.race).
 * Este polling roda continuamente até que o teste complete ou falhe.
 */
export async function pollTestStatus(
  sessionId: string,
  externalRef: string,
  onStatusChange?: (status: TestStatus) => Promise<void>,
): Promise<TestStatus> {
  const env = getEnv();
  const pollIntervalMs = 60000; // Poll a cada 60s

  let lastStatus: TestStatus | null = null;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (true) {
    try {
      const res = await fetch(
        `${env.TESTA_AI_BASE_URL}/api/test/list?externalRef=${encodeURIComponent(externalRef)}`,
        {
          headers: env.TESTA_AI_API_KEY ? { "Authorization": `Bearer ${env.TESTA_AI_API_KEY}` } : {},
          agent: getAgent(env.TESTA_AI_BASE_URL),
        } as any,
      );

      if (!res.ok) {
        throw new Error(`Polling failed: ${res.status}`);
      }

      const data = (await res.json()) as { sessions: Array<{ status: string; messagesRemaining: number }> };

      if (!data.sessions || data.sessions.length === 0) {
        throw new Error("Session not found");
      }

      const session = data.sessions[0]!;
      const status: TestStatus = {
        status: session.status as TestStatus["status"],
        messagesRemaining: session.messagesRemaining,
      };

      // Reset de erros consecutivos quando conseguir conectar
      consecutiveErrors = 0;

      // Chamar callback se status mudou
      if (onStatusChange && lastStatus?.status !== status.status) {
        console.log(`[testa-ai] Status changed to: ${status.status}`);
        await onStatusChange(status);
      }
      lastStatus = status;

      // Teste completou
      if (status.status === "completed") {
        console.log(`[testa-ai] Test ${sessionId} completed`);
        return status;
      }

      // Teste falhou
      if (status.status === "error" || status.status === "stopped") {
        console.error(`[testa-ai] Test ${sessionId} failed with status: ${status.status}`);
        return status;
      }

      // Ainda rodando, aguarda antes do próximo poll
      await sleep(pollIntervalMs);
    } catch (err) {
      consecutiveErrors++;
      const delayMs = Math.pow(2, consecutiveErrors - 1) * 1000; // Backoff: 1s, 2s, 4s

      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`[testa-ai] Polling failed after ${maxConsecutiveErrors} retries for ${sessionId}:`, err);
        throw err;
      }

      console.warn(
        `[testa-ai] Polling error for ${sessionId} (retry ${consecutiveErrors}/${maxConsecutiveErrors}), retrying in ${delayMs}ms:`,
        err instanceof Error ? err.message : String(err),
      );
      await sleep(delayMs);
    }
  }
}

/**
 * Obtém o relatório completo de um teste.
 */
export async function getTestReport(sessionId: string): Promise<TestaAiReport> {
  const env = getEnv();
  const res = await fetch(`${env.TESTA_AI_BASE_URL}/api/test/${sessionId}/report`, {
    headers: env.TESTA_AI_API_KEY ? { "Authorization": `Bearer ${env.TESTA_AI_API_KEY}` } : {},
    agent: getAgent(env.TESTA_AI_BASE_URL),
  } as any);

  if (!res.ok) {
    throw new Error(`Failed to get report: ${res.status}`);
  }

  const report = (await res.json()) as TestaAiReport;
  return report;
}

// ─── Helpers ────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
