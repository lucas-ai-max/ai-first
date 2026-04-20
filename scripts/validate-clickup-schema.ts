/**
 * Script para validar que os custom fields necessários existem no ClickUp.
 * Uso: npx tsx scripts/validate-clickup-schema.ts
 *
 * Verifica se as listas têm os campos esperados pelos agentes.
 */

import "dotenv/config";

const CLICKUP_API = "https://api.clickup.com/api/v2";

interface ExpectedField {
  name: string;
  type: string;
  required: boolean;
  agent: string;
}

const EXPECTED_FIELDS_BUGS: ExpectedField[] = [
  { name: "Severidade", type: "drop_down", required: true, agent: "Triagem" },
  { name: "Módulo", type: "drop_down", required: true, agent: "Triagem" },
  { name: "Canal de origem", type: "drop_down", required: false, agent: "Triagem" },
  { name: "Dados de paciente?", type: "checkbox", required: true, agent: "Triagem" },
];

async function validateList(listId: string, listName: string, expectedFields: ExpectedField[]): Promise<boolean> {
  const token = process.env["CLICKUP_API_TOKEN"];
  if (!token) {
    console.error("❌ CLICKUP_API_TOKEN não definido");
    process.exit(1);
  }

  console.log(`\n📋 Validando lista: ${listName} (${listId})`);

  const res = await fetch(`${CLICKUP_API}/list/${listId}/field`, {
    headers: { Authorization: token },
  });

  if (!res.ok) {
    console.error(`❌ Erro ao buscar campos da lista: ${res.status}`);
    return false;
  }

  const data = (await res.json()) as { fields: Array<{ name: string; type: string; id: string }> };
  const existingFields = new Map(data.fields.map((f) => [f.name.toLowerCase(), f]));

  let allOk = true;

  for (const expected of expectedFields) {
    const existing = existingFields.get(expected.name.toLowerCase());
    if (!existing) {
      const icon = expected.required ? "❌" : "⚠️";
      console.log(`   ${icon} Campo "${expected.name}" não encontrado (${expected.agent})`);
      if (expected.required) allOk = false;
    } else if (existing.type !== expected.type) {
      console.log(`   ⚠️  Campo "${expected.name}" existe mas tipo é "${existing.type}" (esperado: "${expected.type}")`);
    } else {
      console.log(`   ✅ Campo "${expected.name}" (${existing.type}) — ID: ${existing.id}`);
    }
  }

  // Listar campos extras pra referência
  console.log(`\n   Todos os campos da lista:`);
  for (const field of data.fields) {
    console.log(`   - ${field.name} (${field.type}) — ID: ${field.id}`);
  }

  return allOk;
}

async function main(): Promise<void> {
  console.log("🔍 Validação de Schema ClickUp — Flow IA Agents");

  const listBugs = process.env["CLICKUP_LIST_BUGS"] ?? "901113587342";

  const bugsOk = await validateList(listBugs, "Bugs e Incidentes", EXPECTED_FIELDS_BUGS);

  console.log("\n" + "─".repeat(50));
  if (bugsOk) {
    console.log("✅ Todos os campos obrigatórios existem!");
  } else {
    console.log("❌ Campos obrigatórios faltando. Crie-os no ClickUp antes de iniciar o agente.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
