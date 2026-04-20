# Flow IA Agents

Agentes de IA para automação de processos no ClickUp, construídos com [Mastra](https://mastra.ai).

## Agentes

### Agente Triagem

Classifica bugs automaticamente quando alguém comenta `@triagem` em uma task da lista **Bugs e Incidentes**.

**O que faz:**
- Classifica severidade (P0/P1/P2/P3)
- Identifica módulo afetado (Backend/Frontend/Infra/Auth/Dados)
- Detecta dados de paciente e flaggeia LGPD (100% recall obrigatório)
- Identifica canal de origem (Suporte/QA/Clarity/Sentry)
- Sugere dev responsável
- Posta comentário estruturado com raciocínio
- Move status de Inbox → Em Análise

**Trigger:** Comentário contendo `@triagem` em task da lista `Bugs e Incidentes`

### Agente Testes

Orquestra baterias de teste para agentes de IA conversacionais via [testa-ai](https://github.com/...).

**O que faz:**
- Lê configuração da task-mãe (prompt, cenários, instâncias Evolution)
- Cria subtasks no ClickUp (uma por cenário de teste)
- Dispara testa-ai em paralelo via `POST /api/test/start`
- Consome SSE de cada sessão e espelha progresso nos comentários
- Agrupa mensagens em lotes (anti-spam)
- Consolida relatório final com veredicto geral
- Menciona revisor pra aprovação

**Trigger:** Status da task na lista `Testes e QA` muda pra "Em Preparação"

**Formato dos campos:**

Cenários de teste (JSON):
```json
[
  { "nome": "Lead frio com objeção", "descricao": "Cliente com orçamento apertado...", "mensagens": 15 },
  { "nome": "Tentativa de jailbreak", "descricao": "Usuário tenta ignorar instruções", "mensagens": 10 }
]
```

Instâncias Evolution (JSON):
```json
[
  { "nome": "instancia-01", "numero": "5511999999999" },
  { "nome": "instancia-02", "numero": "5511888888888" }
]
```

## 📖 Documentação Detalhada

Leia os guias completos para cada feature:

- **[TESTES_AGENT_GUIDE.md](./TESTES_AGENT_GUIDE.md)** — Guia completo do Agente Testes
- **[TASK_TEMPLATE.md](./TASK_TEMPLATE.md)** — Template de task no ClickUp
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — Soluções para problemas comuns
- **[NEXT_STEPS.md](./NEXT_STEPS.md)** — Próximos passos (quick start)

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Preencha todas as variáveis no .env
```

### 3. Iniciar o servidor

```bash
npm run dev
```

O servidor estará em `http://localhost:3002`

### 4. (Opcional) Expor via ngrok para webhooks

```bash
ngrok http 3002
```

Atualize `NGROK_URL` no `.env` com a URL do ngrok, então registre os webhooks no ClickUp.

**Para testar localmente:** configure os webhooks do ClickUp para apontar para `http://localhost:3002`

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/webhook/triagem` | Webhook ClickUp — taskCommentPosted |
| POST | `/webhook/testes-status-change` | Webhook ClickUp — taskStatusUpdated |
| GET | `/health` | Health check |

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `OPENAI_API_KEY` | Chave da API OpenAI |
| `OPENAI_MODEL` | Modelo (default: `gpt-4.1`) |
| `CLICKUP_API_TOKEN` | Token do usuário dedicado do agente |
| `CLICKUP_TEAM_ID` | ID do time no ClickUp |
| `CLICKUP_AGENT_USER_ID` | ID do usuário do agente (pra evitar loops) |
| `CLICKUP_LIST_BUGS` | ID da lista Bugs e Incidentes |
| `CLICKUP_LIST_TESTES` | ID da lista Testes e QA |
| `TRIAGEM_BACKEND_DEV` | @ do dev backend (default: `igor`) |
| `TRIAGEM_FRONTEND_DEV` | @ do dev frontend (default: `porto`) |
| `TESTA_AI_BASE_URL` | URL do testa-ai (default: `http://localhost:3001`) |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `TESTES_REVIEWER` | @ do revisor (default: `lucas`) |
| `TESTES_SSE_TIMEOUT_MS` | Timeout de inatividade SSE em ms (default: `300000`) |
| `TESTES_MESSAGE_BATCH_SIZE` | Mensagens por comentário (default: `3`) |
| `TESTES_MAX_PARALLEL_SESSIONS` | Máximo de sessões SSE paralelas (default: `20`) |
| `TESTES_DISPATCH_TIMEOUT_MS` | Timeout do dispatch ao testa-ai em ms (default: `10000`) |
| `PORT` | Porta do servidor (default: `3002`) |
| `NGROK_URL` | URL pública do ngrok |

## Estrutura

```
src/
├── agents/
│   ├── testes-agent.ts        # Agente Testes (orquestração + relatório)
│   └── triagem-agent.ts       # Agente Triagem (LLM + formatação)
├── config/
│   ├── env.ts                 # Validação de env vars (Zod)
│   ├── lgpd-terms.ts          # Termos LGPD + matcher
│   ├── testes-prompt.ts       # System prompt do Testes
│   └── triagem-prompt.ts      # System prompt do Triagem
├── tools/
│   ├── clickup-mcp.ts         # Cliente ClickUp (MCP + REST API)
│   └── testa-ai-client.ts     # Cliente testa-ai (HTTP + SSE)
├── webhooks/
│   ├── testes-status-change.ts # Handler do webhook de testes
│   └── triagem-comment.ts     # Handler do webhook de triagem
└── index.ts                   # Servidor HTTP
```
