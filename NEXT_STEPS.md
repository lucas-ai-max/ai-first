# ▶️ Próximos Passos

## ✅ Configuração Concluída

O sistema está pronto! Aqui está o que foi feito:

### 🔧 Melhorias Implementadas
1. **Logging detalhado** — A cada passo, o sistema registra exatamente o que está acontecendo
2. **Validação robusta** — Cenários inválidos são filtrados e reportados com clareza
3. **Documentação completa** — Guias, templates e troubleshooting
4. **Servidor rodando** — Na porta 3002, aguardando webhooks do ClickUp

### 📚 Documentos Criados
- **TESTES_AGENT_GUIDE.md** — Guia completo de uso (leia primeiro!)
- **TASK_TEMPLATE.md** — Template exato para criar tasks
- **TROUBLESHOOTING.md** — Soluções para problemas comuns

---

## 🎯 Como Testar

### 1. Leia o Guia
```
Abra: TESTES_AGENT_GUIDE.md
Entenda o fluxo e como estruturar a task
```

### 2. Crie uma Task no ClickUp
Vá para a lista **"Testes e QA"** e crie uma nova task:

**Título:** Ex: "Teste agentes — cenários básicos"

**Descrição (obrigatório):**
```
Você é um agente de vendas. Qualifique o cliente, 
entenda a necessidade e apresente a solução.
Mantenha tom profissional.
```

**Custom Fields:**

- **"Número do agente":** `5511999990001` (seu número de teste)
- **"Cenários de teste":** (escolha UMA opção)

  **Opção A — JSON (recomendado):**
  ```json
  [
    {
      "nome": "Lead novo",
      "descricao": "Cliente iniciante, sem conhecimento prévio",
      "mensagens": 10
    }
  ]
  ```

  **Opção B — Texto livre:**
  ```
  Um cenário: Lead novo que entra sem conhecer o produto.
  Umas 10 mensagens devem ser o suficiente.
  ```

### 3. Mude o Status para "Em Preparação"

O webhook dispara automaticamente. Você verá comentários na task mostrando o progresso:

```
✅ Entendi 1 cenários
✅ Criei 1 subtasks
✅ Iniciando testes
```

### 4. Acompanhe a Execução

Na subtask criada, você verá em tempo real:
```
🔌 Conectado. Status: ready
👤 Persona gerada: João - Vendedor
Msg 1/10 - customer: Oi
Msg 1/10 - agent: Oi! Bem-vindo...
```

### 5. Veja o Relatório

Quando terminar, a task-mãe recebe um relatório consolidado:
```markdown
# Relatório Consolidado

## Sumário
- Total de cenários: 1
- Aprovados: 1
- Veredicto geral: APROVADO
```

---

## 🔍 Se Algo Dar Errado

### Erro: "Cenários de teste tá vazio"
→ Você não preencheu o custom field
→ Preencha e tente de novo

### Erro: "Não consegui entender os cenários"
→ O LLM não conseguiu parsear seu texto
→ Tente estruturar em JSON OU ser mais específico no texto

### Erro: "Falha ao disparar teste"
→ Problema com testa-ai ou número do agente
→ Verifique em TROUBLESHOOTING.md

### Relatório com 0 cenários
→ Confira TROUBLESHOOTING.md - "Problema: Relatório com 0 cenários"
→ Verifique logs: `tail -100 /tmp/server.log | grep "[testes]"`

---

## 📋 Checklist Rápido

```
□ Abri TESTES_AGENT_GUIDE.md
□ Criei task na lista "Testes e QA"
□ Preenchimento obrigatório:
  □ Descrição com prompt do agente
  □ "Número do agente" (55XXXXXXXXXXX)
  □ "Cenários de teste" (JSON ou texto)
□ Mudei status para "Em Preparação"
□ Verifiquei comentários na task
□ Acompanhei progresso das subtasks
```

---

## 🚀 Dica: Template Salvo

Salve este template nos favoritos do ClickUp para próximos testes:

```
Título: [SEUS-AGENTES] — Teste [CENÁRIOS]
Descrição: [PROMPT DO AGENTE AQUI]
Número do agente: 5511999990001
Cenários de teste: [
  {"nome": "...", "descricao": "...", "mensagens": 10}
]
Status: Em Preparação
```

---

## 📞 Suporte

Se encontrar problemas:
1. Leia TROUBLESHOOTING.md
2. Verifique os logs (servidor na porta 3002)
3. Confirme que all custom fields foram preenchidos
4. Teste com um cenário simples primeiro

---

**Status:** ✅ Pronto para usar  
**Data:** 2026-04-15  
**Servidor:** http://localhost:3002
