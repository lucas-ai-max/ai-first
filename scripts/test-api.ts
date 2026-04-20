/**
 * Script para testar a conexão com a API testa-ai
 * Uso: npx tsx scripts/test-api.ts
 */

import "dotenv/config";

async function testTestaAiAPI() {
  const baseUrl = process.env["TESTA_AI_BASE_URL"];
  const apiKey = process.env["TESTA_AI_API_KEY"];

  console.log("🔍 Testando API testa-ai...\n");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`API Key: ${apiKey ? "✓ Configurada" : "❌ Não configurada"}\n`);

  if (!baseUrl) {
    console.error("❌ TESTA_AI_BASE_URL não está definida no .env");
    process.exit(1);
  }

  // Test 1: Verificar se servidor está respondendo
  console.log("Test 1: Verificando se o servidor está respondendo...");
  try {
    const res = await fetch(`${baseUrl}/health`, {
      timeout: 5000,
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  ✅ Servidor está respondendo\n`);
  } catch (err) {
    console.log(`  ❌ Erro: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  → Verifique se a URL está correta: ${baseUrl}\n`);
  }

  // Test 2: Testar endpoint de start com payload inválido
  console.log("Test 2: Testando endpoint /api/test/start...");
  try {
    const testPayload = {
      agentWhatsappNumber: "+5511999999999",
      agentPrompt: "Teste de conexão",
      messageCount: 1,
      customScenario: "Teste",
      externalRef: "test-cli",
      evolutionApiUrl: "http://test",
      evolutionInstanceName: "test",
      evolutionApiKey: "test",
      openaiApiKey: "test",
    };

    const res = await fetch(`${baseUrl}/api/test/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { "Authorization": `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(testPayload),
      timeout: 5000,
    });

    const body = await res.text();
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${body.slice(0, 200)}`);

    if (res.ok) {
      console.log(`  ✅ Endpoint está funcional\n`);
    } else if (res.status === 401 || res.status === 403) {
      console.log(`  ⚠️  Erro de autenticação (${res.status})`);
      console.log(`  → Verifique a API Key no .env\n`);
    } else {
      console.log(`  ⚠️  Servidor respondeu com erro ${res.status}`);
      console.log(`  → Verifique o payload ou o servidor\n`);
    }
  } catch (err) {
    console.log(`  ❌ Erro: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Test 3: Verificar variáveis de environment
  console.log("Test 3: Verificando variáveis de environment...");
  const vars = {
    TESTA_AI_BASE_URL: process.env["TESTA_AI_BASE_URL"],
    TESTA_AI_API_KEY: process.env["TESTA_AI_API_KEY"] ? "✓" : "❌",
    EVOLUTION_API_URL: process.env["EVOLUTION_API_URL"],
    EVOLUTION_API_KEY: process.env["EVOLUTION_API_KEY"] ? "✓" : "❌",
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"] ? "✓" : "❌",
  };

  for (const [key, value] of Object.entries(vars)) {
    const status = typeof value === "string" && value.includes("❌") ? "❌" : "✓";
    console.log(`  ${status} ${key}: ${typeof value === "string" ? (value === "✓" || value === "❌" ? value : "configurada") : value}`);
  }

  console.log("\n✅ Diagnóstico concluído");
}

testTestaAiAPI().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
