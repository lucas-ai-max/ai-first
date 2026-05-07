import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  montarMarkdownDaily,
  montarMarkdownWeekly,
  type ReportTask,
} from "../src/reports/format.js";

// ─── Snapshot real via MCP (07/05/26): inclui agora os 9 backlog + 6 ativos ─

const features: ReportTask[] = [];

const tarefas: ReportTask[] = [
  // em execução (#ffc53d - amarelo)
  {
    id: "868jgn1hm",
    name: "Criacao de trigger para tabela de auditoria",
    url: "https://app.clickup.com/t/868jgn1hm",
    status: { status: "em execução", color: "#ffc53d" },
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925221536,
  },
  {
    id: "868jfcp75",
    name: "Construir PWA Mobile",
    url: "https://app.clickup.com/t/868jfcp75",
    status: { status: "em execução", color: "#ffc53d" },
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994874,
  },
  {
    id: "868jfc8fb",
    name: "Migracao do N8N para codigo",
    url: "https://app.clickup.com/t/868jfc8fb",
    status: { status: "em execução", color: "#ffc53d" },
    assignees: "Lucas manoel da silva",
    date_created_ms: 1777562759347,
  },
  {
    id: "868jfc54h",
    name: "Seguranca",
    url: "https://app.clickup.com/t/868jfc54h",
    status: { status: "em execução", color: "#ffc53d" },
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777563994000,
  },
  // em revisão (#0091ff - azul)
  {
    id: "868jgn31m",
    name: "Reestruturacao do codigo para novo modelo do banco",
    url: "https://app.clickup.com/t/868jgn31m",
    status: { status: "em revisão", color: "#0091ff" },
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925381465,
  },
  {
    id: "868jfcp73",
    name: "Redesign visual completo da plataforma",
    url: "https://app.clickup.com/t/868jfcp73",
    status: { status: "em revisão", color: "#0091ff" },
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994781,
  },
  // backlog (cinza)
  {
    id: "868jgqn6x",
    name: "Testes unitarios",
    url: "https://app.clickup.com/t/868jgqn6x",
    status: { status: "backlog", color: "#87909e" },
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777920000000,
  },
  {
    id: "868jgqmnw",
    name: "Go to live",
    url: "https://app.clickup.com/t/868jgqmnw",
    status: { status: "backlog", color: "#87909e" },
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777920000000,
  },
  {
    id: "868jfc547",
    name: "Fase 0 - Fundacao",
    url: "https://app.clickup.com/t/868jfc547",
    status: { status: "backlog", color: "#87909e" },
    assignees: "Felipe Porto",
    date_created_ms: 1777563000000,
  },
  {
    id: "868jfc549",
    name: "Fase 2 - Stripe",
    url: "https://app.clickup.com/t/868jfc549",
    status: { status: "backlog", color: "#87909e" },
    assignees: "Felipe Porto",
    date_created_ms: 1777563000000,
  },
];

const now = new Date("2026-05-07T15:00:00-03:00");

const mdDaily = montarMarkdownDaily({ features, tarefas, now });
writeFileSync("c:/tmp/daily-07-05-26.md", mdDaily, "utf-8");
console.log("=== DAILY ===\n" + mdDaily);

const mdWeekly = montarMarkdownWeekly({
  features,
  tarefas,
  intervaloLabel: "30/04 a 06/05",
  now,
});
writeFileSync("c:/tmp/weekly-07-05-26.md", mdWeekly, "utf-8");
console.log("\n=== WEEKLY ===\n" + mdWeekly);
