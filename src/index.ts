import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getEnv } from "./config/env.js";
import { handleTriagemWebhook } from "./webhooks/triagem-comment.js";
import { handleTestesWebhook } from "./webhooks/testes-status-change.js";
import { handleTestesCancelWebhook } from "./webhooks/testes-cancel.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const method = req.method?.toUpperCase();

  // Health check
  if (url.pathname === "/health" && method === "GET") {
    sendJson(res, 200, { status: "ok", agents: ["triagem", "testes"] });
    return;
  }

  // ─── Webhook: Triagem ────────────────────────────────────
  if (url.pathname === "/webhook/triagem" && method === "POST") {
    // Lê o body ANTES de responder (stream precisa ser consumido)
    let payload: unknown;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body);
    } catch (err) {
      console.error("[server] Erro ao parsear body do webhook triagem:", err);
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    // Responde 200 imediatamente (RF1: não bloqueia o ClickUp)
    sendJson(res, 200, { received: true });

    // Processa em background (fire-and-forget)
    handleTriagemWebhook(payload as Parameters<typeof handleTriagemWebhook>[0]).catch((err) => {
      console.error("[server] Erro não capturado no handler de triagem:", err);
    });
    return;
  }

  // ─── Webhook: Testes ──────────────────────────────────────
  if (url.pathname === "/webhook/testes-status-change" && method === "POST") {
    let payload: unknown;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body);
    } catch (err) {
      console.error("[server] Erro ao parsear body do webhook testes:", err);
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    // Responde 200 imediatamente (RF1: não bloqueia o ClickUp)
    sendJson(res, 200, { received: true });

    // Processa em background (fire-and-forget)
    handleTestesWebhook(payload as Parameters<typeof handleTestesWebhook>[0]).catch((err) => {
      console.error("[server] Erro não capturado no handler de testes:", err);
    });
    return;
  }

  // ─── Webhook: Testes Cancel ───────────────────────────────
  if (url.pathname === "/webhook/testes-cancel" && method === "POST") {
    let payload: unknown;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body);
    } catch (err) {
      console.error("[server] Erro ao parsear body do webhook testes-cancel:", err);
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }

    sendJson(res, 200, { received: true });

    handleTestesCancelWebhook(payload as Parameters<typeof handleTestesCancelWebhook>[0]).catch((err) => {
      console.error("[server] Erro não capturado no handler de testes-cancel:", err);
    });
    return;
  }

  // 404
  sendJson(res, 404, { error: "Not found" });
}

// ─── Inicialização ──────────────────────────────────────────

async function main(): Promise<void> {
  const env = getEnv();

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("[server] Erro não tratado:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
      }
    });
  });

  server.listen(env.PORT, () => {
    console.log(`\n🚀 Flow IA Agents rodando na porta ${env.PORT}`);
    console.log(`   POST /webhook/triagem     → Agente Triagem`);
    console.log(`   POST /webhook/testes-status-change → Agente Testes`);
    console.log(`   POST /webhook/testes-cancel → Cancelamento de testes (@testes #cancelar)`);
    console.log(`   GET  /health              → Health check`);
    if (env.NGROK_URL) {
      console.log(`\n🌐 ngrok: ${env.NGROK_URL}`);
      console.log(`   Webhook triagem: ${env.NGROK_URL}/webhook/triagem`);
    }
    console.log("");
  });
}

main().catch((err) => {
  console.error("❌ Falha ao iniciar servidor:", err);
  process.exit(1);
});
