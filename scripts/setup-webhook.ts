/**
 * Script para gerenciar webhooks do ClickUp.
 *
 * Uso:
 *   npx tsx scripts/setup-webhook.ts              # Listar, deletar antigos e criar novos
 *   npx tsx scripts/setup-webhook.ts list         # Apenas listar webhooks existentes
 *   npx tsx scripts/setup-webhook.ts delete <id>  # Deletar webhook por ID
 *   npx tsx scripts/setup-webhook.ts create       # Apenas criar todos os webhooks
 *   npx tsx scripts/setup-webhook.ts add-cancel   # Criar APENAS o webhook de cancelamento
 *
 * Registra os webhooks necessários para os agentes:
 * - /webhook/triagem → taskCommentPosted na lista Bugs e Incidentes
 * - /webhook/testes-status-change → taskStatusUpdated na lista Testes e QA
 * - /webhook/testes-cancel → taskCommentPosted na lista Testes e QA (comando @testes #cancelar)
 */

import "dotenv/config";

const CLICKUP_API = "https://api.clickup.com/api/v2";

interface WebhookConfig {
  endpoint: string;
  events: string[];
  listId: string;
  description: string;
}

async function deleteWebhook(webhookId: string): Promise<boolean> {
  const token = process.env["CLICKUP_API_TOKEN"];

  if (!token) {
    console.error("❌ Faltam variáveis: CLICKUP_API_TOKEN");
    return false;
  }

  console.log(`🗑️  Deletando webhook: ${webhookId}`);

  const res = await fetch(`${CLICKUP_API}/webhook/${webhookId}`, {
    method: "DELETE",
    headers: {
      Authorization: token,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Erro ao deletar webhook: ${res.status} ${body}`);
    return false;
  }

  console.log(`✅ Webhook deletado com sucesso!`);
  return true;
}

async function createWebhook(config: WebhookConfig): Promise<void> {
  const token = process.env["CLICKUP_API_TOKEN"];
  const teamId = process.env["CLICKUP_TEAM_ID"];
  const ngrokUrl = process.env["NGROK_URL"];

  if (!token || !teamId || !ngrokUrl) {
    console.error("❌ Faltam variáveis: CLICKUP_API_TOKEN, CLICKUP_TEAM_ID, NGROK_URL");
    process.exit(1);
  }

  const webhookUrl = `${ngrokUrl}${config.endpoint}`;

  console.log(`\n📡 Registrando webhook: ${config.description}`);
  console.log(`   URL: ${webhookUrl}`);
  console.log(`   Eventos: ${config.events.join(", ")}`);
  console.log(`   Lista: ${config.listId}`);

  const res = await fetch(`${CLICKUP_API}/team/${teamId}/webhook`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: webhookUrl,
      events: config.events,
      // Nota: ClickUp filtra por workspace, não por lista no webhook.
      // A filtragem por lista é feita no handler.
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Erro ao criar webhook: ${res.status} ${body}`);
    return;
  }

  const data = await res.json();
  console.log(`✅ Webhook criado com sucesso! ID: ${(data as { id: string }).id}`);
}

async function listWebhooks(): Promise<void> {
  const token = process.env["CLICKUP_API_TOKEN"];
  const teamId = process.env["CLICKUP_TEAM_ID"];

  if (!token || !teamId) {
    console.error("❌ Faltam variáveis: CLICKUP_API_TOKEN, CLICKUP_TEAM_ID");
    process.exit(1);
  }

  const res = await fetch(`${CLICKUP_API}/team/${teamId}/webhook`, {
    headers: { Authorization: token },
  });

  if (!res.ok) {
    console.error(`❌ Erro ao listar webhooks: ${res.status}`);
    return;
  }

  const data = (await res.json()) as { webhooks: Array<{ id: string; endpoint: string; events: string[] }> };
  console.log(`\n📋 Webhooks existentes (${data.webhooks.length}):`);
  for (const wh of data.webhooks) {
    console.log(`   - ${wh.id}: ${wh.endpoint} [${wh.events.join(", ")}]`);
  }
}

async function deleteOldWebhooks(): Promise<void> {
  // IDs dos webhooks antigos com ngrok anterior (d082-138-97-241-70)
  const oldWebhookIds = [
    "5b376ad5-fbfa-49ad-aa9a-ffa532ea0b7e", // /webhook/triagem (d082)
    "68ba8495-0703-44ef-83cf-d4793237d4da", // /webhook/testes-status-change (d082)
  ];

  console.log("\n🔄 Deletando webhooks antigos...\n");
  for (const id of oldWebhookIds) {
    await deleteWebhook(id);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const arg = process.argv[3];
  const listId_bugs = process.env["CLICKUP_LIST_BUGS"] ?? "901113587342";
  const listId_testes = process.env["CLICKUP_LIST_TESTES"] ?? "901113588686";

  console.log("🔧 Setup de Webhooks — Flow IA Agents\n");

  // Processar comandos
  if (command === "list") {
    await listWebhooks();
    return;
  }

  if (command === "delete" && arg) {
    await deleteWebhook(arg);
    return;
  }

  if (command === "create") {
    // Apenas criar novos webhooks
    await createWebhook({
      endpoint: "/webhook/triagem",
      events: ["taskCommentPosted"],
      listId: listId_bugs,
      description: "Agente Triagem — taskCommentPosted em Bugs e Incidentes",
    });

    await createWebhook({
      endpoint: "/webhook/testes-status-change",
      events: ["taskStatusUpdated"],
      listId: listId_testes,
      description: "Agente Testes — taskStatusUpdated em Testes e QA",
    });

    await createWebhook({
      endpoint: "/webhook/testes-cancel",
      events: ["taskCommentPosted"],
      listId: listId_testes,
      description: "Agente Testes — taskCommentPosted em Testes e QA (cancelamento)",
    });

    console.log("\n✅ Webhooks criados com sucesso!");
    return;
  }

  if (command === "add-cancel") {
    await createWebhook({
      endpoint: "/webhook/testes-cancel",
      events: ["taskCommentPosted"],
      listId: listId_testes,
      description: "Agente Testes — taskCommentPosted em Testes e QA (cancelamento)",
    });
    console.log("\n✅ Webhook de cancelamento registrado!");
    return;
  }

  // Fluxo completo: listar, deletar antigos e criar novos
  await listWebhooks();
  await deleteOldWebhooks();

  console.log("\n📡 Criando novos webhooks...");
  await createWebhook({
    endpoint: "/webhook/triagem",
    events: ["taskCommentPosted"],
    listId: listId_bugs,
    description: "Agente Triagem — taskCommentPosted em Bugs e Incidentes",
  });

  await createWebhook({
    endpoint: "/webhook/testes-status-change",
    events: ["taskStatusUpdated"],
    listId: listId_testes,
    description: "Agente Testes — taskStatusUpdated em Testes e QA",
  });

  await createWebhook({
    endpoint: "/webhook/testes-cancel",
    events: ["taskCommentPosted"],
    listId: listId_testes,
    description: "Agente Testes — taskCommentPosted em Testes e QA (cancelamento)",
  });

  console.log("\n✅ Setup completo!");
  console.log("⚠️  Lembre-se: a filtragem por lista é feita no handler, não no webhook.");
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
