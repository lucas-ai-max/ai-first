import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1"),

  CLICKUP_API_TOKEN: z.string().min(1), // Token para Agente Triagem
  CLICKUP_API_TOKEN_TESTES: z.string().optional(), // Token para Agente Testes (opcional, usa CLICKUP_API_TOKEN se não definido)
  CLICKUP_TEAM_ID: z.string().min(1),
  CLICKUP_MCP_URL: z.string().url().default("https://mcp.clickup.com/mcp"),

  CLICKUP_LIST_BUGS: z.string().default("901113587342"),
  CLICKUP_LIST_TESTES: z.string().default("901113588686"),
  CLICKUP_AGENT_USER_ID: z.string().min(1),

  TRIAGEM_BACKEND_DEV: z.string().default("igor"),
  TRIAGEM_FRONTEND_DEV: z.string().default("porto"),

  // Testes Agent
  TESTA_AI_BASE_URL: z.string().url().default("http://localhost:3001"),
  TESTA_AI_API_KEY: z.string().default(""),
  EVOLUTION_API_URL: z.string().default(""),
  EVOLUTION_API_KEY: z.string().default(""),
  TESTES_REVIEWER: z.string().default("lucas"),
  TESTES_SSE_TIMEOUT_MS: z.coerce.number().default(300_000), // 5 min
  TESTES_TEST_TIMEOUT_MS: z.coerce.number().default(600_000), // 10 min — tempo máximo por teste
  TESTES_MESSAGE_BATCH_SIZE: z.coerce.number().default(3),
  TESTES_MAX_PARALLEL_SESSIONS: z.coerce.number().default(20),
  TESTES_DISPATCH_TIMEOUT_MS: z.coerce.number().default(10_000),

  PORT: z.coerce.number().default(3002),
  NGROK_URL: z.string().optional(),

  // Reports / Daily & Weekly Flow
  CLICKUP_REPORTS_TEAM_ID: z.string().default("9011731314"),
  CLICKUP_REPORTS_FEATURES_LIST: z.string().default("901113643861"),
  CLICKUP_REPORTS_TAREFAS_LIST: z.string().default("901113587340"),
  CLICKUP_REPORTS_DOC_ID: z.string().default("8cj86vj-93731"),
  CLICKUP_REPORTS_DAILY_PARENT_ID: z.string().default("8cj86vj-77071"),
  CLICKUP_REPORTS_WEEKLY_PARENT_ID: z.string().default("8cj86vj-77191"),
  CLICKUP_REPORTS_TOKEN: z.string().optional(),
  REPORTS_ACTIVE_STATUSES: z.string().default("em execução,em revisão"),
  REPORTS_TEAM_ALIASES: z
    .string()
    .default("Lucas:Lucas,Luc|Porto:Porto,Felipe|Guilherme:Guilherme,Gui|Igor:Igor,Vilas Boas|Léo:Leonardo,Leo,Léo"),
  DAILY_CRON: z.string().default("0 9 * * 2-5"),
  WEEKLY_CRON: z.string().default("0 9 * * 1"),
  REPORTS_TIMEZONE: z.string().default("America/Sao_Paulo"),
  REPORTS_ENABLED: z.coerce.boolean().default(true),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_METRICS_TABLE: z.string().default("metricas_diarias"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error("❌ Variáveis de ambiente inválidas:");
      console.error(result.error.format());
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
