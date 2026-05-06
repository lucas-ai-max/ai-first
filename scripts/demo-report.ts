import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  montarMarkdownDaily,
  montarMarkdownWeekly,
  type ReportTask,
} from "../src/reports/format.js";

// ─── Dados reais via MCP em 2026-05-06 ─────────────────────
// Lista Features (901113643861) → vazia
// Lista Tarefas (901113587340) → 5 tasks em execução/em revisão (backlog ignorado)

const features: ReportTask[] = [];

const tarefas: ReportTask[] = [
  {
    id: "868jgn1hm",
    name: "Criacao de trigger para tabela de auditoria",
    url: "https://app.clickup.com/t/868jgn1hm",
    status: "em execução",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925221536,
  },
  {
    id: "868jgn31m",
    name: "Reestruturacao do codigo para novo modelo do banco",
    url: "https://app.clickup.com/t/868jgn31m",
    status: "em revisão",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925381465,
  },
  {
    id: "868jfcp75",
    name: "Construir PWA Mobile",
    url: "https://app.clickup.com/t/868jfcp75",
    status: "em execução",
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994874,
  },
  {
    id: "868jfcp73",
    name: "Redesign visual completo da plataforma",
    url: "https://app.clickup.com/t/868jfcp73",
    status: "em revisão",
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994781,
  },
  {
    id: "868jfc8fb",
    name: "Migracao do N8N para codigo",
    url: "https://app.clickup.com/t/868jfc8fb",
    status: "em execução",
    assignees: "Lucas manoel da silva",
    date_created_ms: 1777562759347,
  },
];

const now = new Date("2026-05-06T15:00:00-03:00");

const mdDaily = montarMarkdownDaily({ features, tarefas, now });
writeFileSync("c:/tmp/daily-06-05-26.md", mdDaily, "utf-8");
console.log("=== DAILY ===\n" + mdDaily);

const mdWeekly = montarMarkdownWeekly({
  features,
  tarefas,
  intervaloLabel: "29/04 a 05/05",
  now,
});
writeFileSync("c:/tmp/weekly-29-04-a-05-05.md", mdWeekly, "utf-8");
console.log("\n=== WEEKLY ===\n" + mdWeekly);
