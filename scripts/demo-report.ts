import "dotenv/config";
import { writeFileSync } from "node:fs";
import {
  montarMarkdownDaily,
  montarMarkdownWeekly,
  type ReportTask,
} from "../src/reports/format.js";

// Simula 07/05/26 14:00 BRT
const now = new Date("2026-05-07T17:00:00Z");

// Hoje 07/05; ontem 06/05; semana passada 30/04 a 06/05
// inicioHoje (BRT) = 07/05 00:00 BRT = 07/05 03:00 UTC
// fimSemanaAtual = 14/05 BRT = 14/05 03:00 UTC

const tarefas: ReportTask[] = [
  // ─ IGOR ─
  {
    id: "868jgn1hm",
    name: "Criacao de trigger para tabela de auditoria",
    url: "https://app.clickup.com/t/868jgn1hm",
    status: "em execução",
    status_color: "#ffc53d",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925221536,
    due_date: "1778223600000", // 08/05 (programada esta semana)
  },
  {
    id: "868jgn31m",
    name: "Reestruturacao do codigo para novo modelo do banco",
    url: "https://app.clickup.com/t/868jgn31m",
    status: "em revisão",
    status_color: "#0091ff",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777925381465,
    due_date: null,
  },
  {
    id: "868jgn2t3",
    name: "Reestruturacao de logs dos microservicos",
    url: "https://app.clickup.com/t/868jgn2t3",
    status: "Concluída ontem",
    status_color: "#008844",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777563000000,
    due_date: "1777964400000",
  },
  {
    id: "868jfc54h",
    name: "Seguranca",
    url: "https://app.clickup.com/t/868jfc54h",
    status: "em execução",
    status_color: "#ffc53d",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777563994000,
    due_date: "1778828400000", // futuro distante (não programada esta semana)
  },
  {
    id: "868jgqn6x",
    name: "Testes unitarios",
    url: "https://app.clickup.com/t/868jgqn6x",
    status: "backlog",
    status_color: "#8d8d8d",
    assignees: "Igor Vilas Boas",
    date_created_ms: 1777936706849,
    due_date: null,
  },
  // ─ LÉO ─
  {
    id: "868jfcp75",
    name: "Construir PWA Mobile",
    url: "https://app.clickup.com/t/868jfcp75",
    status: "em execução",
    status_color: "#ffc53d",
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994874,
    due_date: "1777532400000", // 30/04 — atrasada
  },
  {
    id: "868jfcp73",
    name: "Redesign visual completo da plataforma",
    url: "https://app.clickup.com/t/868jfcp73",
    status: "em revisão",
    status_color: "#0091ff",
    assignees: "Leonardo Lima",
    date_created_ms: 1777563994781,
    due_date: "1776927600000", // atrasada
  },
  {
    id: "868jfcp74",
    name: "Redesign: Landing Page",
    url: "https://app.clickup.com/t/868jfcp74",
    status: "Concluída na semana",
    status_color: "#008844",
    assignees: "Leonardo Lima",
    date_created_ms: 1777563000000,
    due_date: null,
  },
  // ─ LUCAS ─
  {
    id: "868jfc8fb",
    name: "Migracao do N8N para codigo",
    url: "https://app.clickup.com/t/868jfc8fb",
    status: "em execução",
    status_color: "#ffc53d",
    assignees: "Lucas manoel da silva",
    date_created_ms: 1777562759347,
    due_date: "1778223600000",
  },
  // ─ PORTO ─
  {
    id: "868jfc54j",
    name: "Fase 3 - COGS",
    url: "https://app.clickup.com/t/868jfc54j",
    status: "backlog",
    status_color: "#8d8d8d",
    assignees: "Felipe Porto",
    date_created_ms: 1777563000000,
    due_date: "1778223600000", // 08/05
  },
];

const features: ReportTask[] = [];

const mdDaily = montarMarkdownDaily({ features, tarefas, now });
writeFileSync("c:/tmp/daily-novo.md", mdDaily, "utf-8");
console.log("=== DAILY ===\n" + mdDaily);

const mdWeekly = montarMarkdownWeekly({
  features,
  tarefas,
  intervaloLabel: "30/04 a 06/05",
  now,
});
writeFileSync("c:/tmp/weekly-novo.md", mdWeekly, "utf-8");
console.log("\n=== WEEKLY ===\n" + mdWeekly);
