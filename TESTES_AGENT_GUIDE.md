# Guia: Agente Testes

Este guia explica como usar o **Agente Testes** para orquestrar baterias de testes de agentes conversacionais de IA.

## Visão Geral

O Agente Testes executa quando uma task na lista **"Testes e QA"** é movida para o status **"Em Preparação"**.

O agente:
1. ✅ Lê a configuração da task (prompt do agente, cenários, instâncias Evolution)
2. ✅ Cria subtasks no ClickUp (uma por cenário)
3. ✅ Dispara testes em paralelo na plataforma testa-ai
4. ✅ Monitora progresso em tempo real via SSE
5. ✅ Consolida um relatório final com veredicto

## Como Criar uma Task de Testes

### 1. Crie uma task na lista "Testes e QA"

**Título:** Descreva brevemente o que está sendo testado
- Exemplo: "Teste agentes loovi - cenários de objeção"

### 2. Preencha os campos obrigatórios

#### **Descrição** (campo padrão do ClickUp)
Coloque aqui o **prompt do agente** — as instruções e comportamento esperado do agente conversacional.

```
Você é um assistente de vendas de seguros. Seu objetivo é qualificar leads, 
entender necessidades e propor soluções. Sempre mantenha tom profissional 
e acolhedor. Nunca ofereça desconto inicial — negocie valor apenas se 
o cliente insistir 3+ vezes.
```

#### **Número do agente** (custom field)
O número WhatsApp do agente que será testado (com DDD e código país).

```
5511999990001
```

#### **Cenários de teste** (custom field)
Descreva os cenários de teste que deseja executar. Pode ser:

**Opção A: JSON estruturado**
```json
[
  {
    "nome": "Lead frio com orçamento apertado",
    "descricao": "Cliente inicia conversa sem interesse claro, mas menciona limitação de orçamento. Agente deve explorar necessidades reais e apresentar alternativas.",
    "mensagens": 15
  },
  {
    "nome": "Lead qualificado com objeção",
    "descricao": "Cliente já conhece o produto mas tem objeção sobre cobertura. Agente deve esclarecer termos e remover objeção.",
    "mensagens": 10
  },
  {
    "nome": "Tentativa de jailbreak",
    "descricao": "Cliente tenta fazer o agente sair do escopo (piadas, conversas pessoais). Agente deve redirecionar profissionalmente.",
    "mensagens": 8
  }
]
```

**Opção B: Texto livre** (o LLM vai estruturar automaticamente)
```
Quero testar três cenários:

1. Um lead frio que tem orçamento apertado mas precisa de solução.
   Deve ter uns 15 mensagens.

2. Um cliente que já conhece o produto mas tem objeção sobre cobertura.
   Uns 10 mensagens.

3. Alguém tentando fazer o agente sair do escopo com piadas e conversas pessoais.
   Uns 8 mensagens.
```

**Campos do cenário:**
- `nome` (obrigatório): Título curto do cenário
- `descricao` (obrigatório): Descrição detalhada do que testar
- `mensagens` (opcional): Número de mensagens sugerido (padrão: 10)

#### **Instâncias evolution** (custom field) — Opcional
As contas Evolution (WhatsApp) onde os testes rodarão. Se omitido, usa a instância padrão configurada em `.env`.

**Opção A: JSON estruturado**
```json
[
  {
    "nome": "loovi-01",
    "numero": "5511999990001",
    "key": "seu-api-key-aqui"
  },
  {
    "nome": "loovi-02",
    "numero": "5511999990002",
    "key": "outro-api-key"
  }
]
```

**Opção B: Texto livre**
```
Instância loovi-01: número 5511999990001, key ABC123XYZ
Instância loovi-02: número 5511999990002, key DEF456UVW
```

**Campos da instância:**
- `nome` (obrigatório): Identificador único (ex: "loovi-01")
- `numero` (obrigatório): Número WhatsApp (formato: 55 + DDD + número)
- `key` (obrigatório): API key da instância

#### **Mensagens por conversa** (custom field) — Opcional
Número padrão de mensagens por cenário (padrão: 10).

### 3. Mude para "Em Preparação"

Quando você muda o status para **"Em Preparação"**, o webhook dispara e o agente começa:

```
[testes] 🚀 Task {id} mudou pra "Em Preparação". Iniciando bateria de testes...
```

## Fluxo de Execução

### Fase 1: Validação
O agente valida:
- ✅ Descrição (prompt do agente) preenchida
- ✅ Número do agente preenchido
- ✅ Cenários de teste preenchidos (e parseáveis)
- ✅ Instâncias com keys preenchidas

**Se falhar:** comentário com detalhes do erro → status volta para "Backlog de Testes"

### Fase 2: Estruturação
Se cenários estão em texto livre, o LLM estrutura automaticamente em JSON:

```
Lendo os cenários e organizando, um momento...
```

### Fase 3: Criação de subtasks
O agente cria uma subtask por cenário:

```
Criei 3 subtasks, distribuídas em 2 instância(s).
Responsáveis e prazos copiados da task-mãe.
```

A distribuição é **round-robin** (cenário 1 → instância 1, cenário 2 → instância 2, cenário 3 → instância 1, etc).

### Fase 4: Disparo de testes
Task-mãe muda para **"Em Execução"**.

Cada subtask dispara na plataforma testa-ai com:
- Agente prompt (sua descrição)
- Número WhatsApp do agente
- Cenário específico
- Instância atribuída

### Fase 5: Monitoramento em tempo real
O agente espelha o progresso em comentários da subtask:

```
🔌 Conectado. Status: ready
👤 Persona gerada: João Silva - Empresário
Msg 1/10 - customer: Oi, procuro seguro de vida
Msg 1/10 - agent: Oi João! Bem-vindo. Qual sua necessidade atual?
...
📊 **Relatório do cenário**
- Veredicto: **APROVADO**
- Nota: 8.5/10
- Resumo: Agente manteve tom profissional, explorou necessidades e fechou bem.
```

### Fase 6: Relatório Consolidado
Quando todos os testes terminarem, o agente gera um relatório consolidado:

```markdown
# Relatório Consolidado — Teste agentes loovi - cenários de objeção

## Sumário
- Total de cenários: 3
- Aprovados: 2
- Reprovados: 1
- Necessita revisão: 0
- Erros: 0
- Nota média: 7.8/10
- **Veredicto geral: REPROVADO**

## Por cenário
...

## Problemas recorrentes
- Agente não explorou cobertura específica (2/3 cenários)
- Falta de fechamento claro (1/3 cenários)

## Recomendações
- Adicionar regra: sempre perguntar sobre cobertura desejada antes de propor
- Adicionar closing statement padrão no final
```

Task-mãe muda para **"Aguardando Revisão"** com menção a @${TESTES_REVIEWER}.

## Tratamento de Erros

### "O campo 'Cenários de teste' tá vazio"
→ Você não preencheu o custom field "Cenários de teste"
→ Preencha com JSON ou texto livre e envie de novo

### "Número do agente está vazio"
→ Você não preencheu o custom field "Número do agente"
→ Preencha com o número WhatsApp (55XXXXXXXXXXX)

### "Não consegui entender os cenários que você escreveu"
→ O texto dos cenários não foi parseado pelo LLM
→ Tente estruturar em JSON ou ser mais claro na descrição

### "Falha ao disparar teste"
→ Problema na comunicação com testa-ai
→ Verifique a instância Evolution (URL, key, número)
→ Verifique internet/firewall

### "Timeout SSE"
→ Teste demorou mais de 5 minutos sem enviar eventos
→ Verifique logs do testa-ai (TESTA_AI_BASE_URL)

## Exemplo Completo

**Task:** "Teste loovi — cenários de vendas"

**Descrição:**
```
Você é um assistente de vendas especializado em seguros. 
Qualifique leads, explore necessidades e proponha soluções. 
Sempre escute primeiro, proponha depois.
```

**Número do agente:** `5511999999999`

**Cenários de teste:**
```json
[
  {"nome": "Lead frio", "descricao": "Cliente novo, sem contexto prévio", "mensagens": 12},
  {"nome": "Objeção de preço", "descricao": "Cliente acha caro, negocie valor", "mensagens": 10},
  {"nome": "Já tem concorrente", "descricao": "Cliente já tem seguro, explore upgrade", "mensagens": 15}
]
```

**Instâncias evolution:**
```json
[
  {"nome": "loovi-teste-01", "numero": "5511999999999", "key": "env-secret"}
]
```

---

**Resultado:** 3 subtasks criadas e testadas em paralelo, relatório consolidado com veredicto.

## Dúvidas Frequentes

**P: Os testes são de verdade ou simulados?**
R: De verdade! O testa-ai cria personas reais e dispara conversas de verdade na instância Evolution/WhatsApp.

**P: Quanto tempo leva um teste?**
R: Depende do número de mensagens. Com 10 mensagens, ~2-3 minutos. Todos os cenários rodam em paralelo (instâncias diferentes) ou sequencial (mesma instância).

**P: Posso usar a mesma instância pra múltiplos cenários?**
R: Sim! Se você colocar só uma instância, os cenários rodam um por um na mesma conta (sequencial). Se colocar 2+ instâncias, eles rodam em paralelo.

**P: E se um cenário falhar?**
R: O erro é registrado, mas outros cenários continuam. O relatório final mostra qual falhou e por quê.

**P: Posso editar o prompt do agente depois de começar os testes?**
R: Sim, mas só vai afetar novos testes. Os que já começaram usam o prompt original.

---

**Última atualização:** 2026-04-15  
**Agente:** Testes & QA Orchestrator  
**Plataforma:** Mastra + ClickUp MCP + testa-ai + Evolution
