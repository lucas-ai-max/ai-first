# Troubleshooting: Agente Testes

## Problema: "Relatório consolidado com 0 cenários"

Se o Agente Testes gerar um relatório com 0 cenários (0 aprovados, 0 reprovados, veredicto "APROVADO"), significa que:

1. ❌ A parseAndStructureFields conseguiu extrair cenários (senão teria retornado erro antes)
2. ❌ Mas algo deu errado durante a execução dos testes

### Causas possíveis:

#### A. O campo "Cenários de teste" está vazio

**Sintomas:**
- Comentário na task: `"O campo "Cenários de teste" tá vazio"`

**Solução:**
1. Abra a task
2. Vá para o custom field **"Cenários de teste"**
3. Preencha com JSON estruturado OU texto livre (o LLM estrutura para você)
4. Mude de novo para "Em Preparação"

#### B. Os cenários foram parseados mas estão inválidos

**Sintomas:**
- Comentário: `"Faltam algumas informações"` com lista de problemas
- Exemplo: `"Cenário 1: está sem nome"`, `"Cenário 2: está sem descrição"`

**Solução:**
Verifique se TODOS os cenários têm:
- ✅ `nome`: Título curto, não-vazio
- ✅ `descricao`: Descrição detalhada, não-vazio

Se usar **JSON**, certifique-se que está válido:
```json
[
  {
    "nome": "Lead frio",
    "descricao": "Cliente novo, sem contexto"
  }
]
```

Se usar **texto livre**, seja específico:
```
Cenário 1: Lead frio — Cliente novo que entra sem saber sobre o produto.
Cenário 2: Objeção de preço — Cliente acha caro e quer desconto.
```

#### C. Falha ao criar subtasks

**Sintomas:**
- Comentário: `"⚠️ Erro ao criar subtask..."`
- Seguido por: `"Nenhuma subtask criou com sucesso"`

**Solução:**
1. Verifique se o **list_id** em `.env` está correto (`CLICKUP_LIST_TESTES`)
2. Verifique se você tem permissão de escrita na lista "Testes e QA"
3. Verifique o erro específico no comentário

#### D. Falha ao disparar testes

**Sintomas:**
- Comentário na subtask: `"Falha ao disparar teste: ..."`
- Causas comuns:
  - `"url is required"` → Falta URL de testa-ai (TESTA_AI_BASE_URL em .env)
  - `"Invalid WhatsApp number"` → Número do agente tem formato errado
  - `"Connection refused"` → testa-ai não está respondendo

**Solução:**
1. Verifique o número do agente (deve ser 55 + DDD + número, ex: 5511999990001)
2. Verifique se testa-ai está rodando (`TESTA_AI_BASE_URL` em .env)
3. Verifique se o número tem permissão para testar (não é bloqueado)
4. Veja logs de testa-ai para mais detalhes

#### E. Timeout SSE (Streaming Server-Sent Events)

**Sintomas:**
- Comentário na subtask: `"Timeout SSE"`
- Significa que o teste demorou mais de 5 minutos sem enviar eventos

**Solução:**
1. Verifique internet/firewall (a conexão SSE pode estar sendo bloqueada)
2. Reduza o número de mensagens (`mensagens` no cenário ou `mensagens por conversa`)
3. Verifique logs de testa-ai para ver se o teste está realmente rodando
4. Tente de novo — pode ser problema transitório

#### F. Erro: "LLM não retornou JSON válido"

**Sintomas:**
- Comentário: `"Não consegui entender os cenários que você escreveu"`

**Solução:**
Reescreva o texto dos cenários de forma mais estruturada. Exemplo:

**Ruim:**
```
Testar objeção, preço, cliente insatisfeito, etc
```

**Bom:**
```
Cenário 1: Cliente com objeção sobre cobertura
Preciso testar se o agente consegue esclarecer os termos da política

Cenário 2: Cliente achando o preço caro
O agente deve apresentar alternativas e negociar sem dar desconto inicial

Cenário 3: Cliente insatisfeito com atendimento anterior
O agente deve recuperar a confiança e entender o problema real
```

## Verificação Rápida

Antes de disparar o teste, verifique:

```checklist
- [ ] Descrição da task contém o prompt do agente (não-vazio)
- [ ] Campo "Número do agente" preenchido (formato: 55XXXXXXXXXXX)
- [ ] Campo "Cenários de teste" preenchido (JSON ou texto claro)
- [ ] Cada cenário tem `nome` e `descrição` preenchidos
- [ ] (Opcional) Campo "Instâncias evolution" preenchido com `numero` e `key`
- [ ] Status está sendo mudado para "Em Preparação"
- [ ] Servidor testa-ai está rodando e respondendo
```

## Debug: Verificar Logs

Se algo der errado, verifique os logs do servidor:

```bash
# Logs do Agente Testes
tail -f /tmp/server.log | grep "\[testes\]"

# Logs completos com contexto
tail -100 /tmp/server.log | grep -A 5 -B 5 "Erro\|Error\|erro"
```

**Linhas importantes para procurar:**
```
[testes] rawScenarios type:                   ← mostra se cenários foram encontrados
[testes] Cenários em texto livre, usando LLM ← mostra se o LLM foi usado
[testes] LLM parse successful                 ← mostra se o LLM conseguiu parsear
[testes] scenarios.length =                   ← quantidade de cenários extraídos
[testes] Criando X subtasks                   ← quantidade de subtasks criadas
[testes] Disparando X testes                  ← inicío da fase de execução
```

## Escalação

Se o problema persistir:

1. **Copie os logs** (grep `[testes]` do server.log)
2. **Anote a task ID** do ClickUp
3. **Descreva o erro** exato que viu no comentário da task
4. Procure ajuda com esses dados

---

**Última atualização:** 2026-04-15
