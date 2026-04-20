# 👤 Como Atribuir Responsáveis e Datas

Quando o Agente Testes cria subtasks, ele copia automaticamente **responsáveis e datas** da task-mãe.

## Opção A: Com Responsáveis (Recomendado)

### Antes de mover para "Em Preparação":

1. **Abra a task-mãe**
2. **Clique no campo "Responsável"** (lado direito)
3. **Selecione quem vai revisar** (pode ser múltiplas pessoas)
4. **(Opcional) Preencha datas:**
   - Data de início (quando começa)
   - Data de vencimento (quando termina)
5. **Mude status para "Em Preparação"**

### Resultado:
- ✅ Todas as subtasks herdaram os responsáveis
- ✅ Todas as subtasks herdaram as datas
- ✅ Comentário na task diz: "Responsáveis copiados da task-mãe"

---

## Opção B: Sem Responsáveis (Atribui Depois)

Se você **não preencher responsáveis** na task-mãe:

1. **Crie a task** (sem responsável)
2. **Mude para "Em Preparação"**
3. **Subtasks são criadas vazias**
4. **Depois você atribui manualmente**

### Resultado:
- ✅ Subtasks criadas normalmente
- ❌ Campo "Responsável" vazio
- 📝 Comentário avisa: "(Preencha responsáveis na task-mãe pra copiar)"

---

## Como Preencher Responsáveis no ClickUp

### Método 1: Via campo de "Responsável"
```
1. Abra a task
2. Procure o campo "Responsável" (lado direito)
3. Clique no avatar/nome
4. Digite nome ou email
5. Selecione da lista
```

### Método 2: Via comentário @mention
```
Não funciona pra atribuir — use o campo Responsável
```

---

## Datas: Como Funciona

### Data de Vencimento (Due Date)
```
Field: "Data de vencimento"
Copia para: Todas as subtasks
Quando usar: Quando precisa de deadline pra revisão
```

### Data de Início (Start Date)
```
Field: "Data de início"
Copia para: Todas as subtasks
Quando usar: Quando quero que as subtasks apareçam no calendário de uma data específica
```

---

## Exemplo Prático

### Cenário: Criar teste de 3 cenários

1. **Crie task-mãe:**
   - Título: "Teste agentes Q2"
   - Descrição: Seu prompt
   - Número do agente: 5511999999999
   - Cenários: [cenário 1, cenário 2, cenário 3]

2. **Atribua responsáveis:**
   - Responsável: @lucas (revisor)
   - Data de vencimento: 2026-05-01
   - Data de início: 2026-04-15

3. **Mude para "Em Preparação"**

4. **Resultado:**
   ```
   Subtask 1: [Cenário 1/3] ...
     Responsável: @lucas
     Data de vencimento: 2026-05-01
     Data de início: 2026-04-15
   
   Subtask 2: [Cenário 2/3] ...
     Responsável: @lucas
     Data de vencimento: 2026-05-01
     Data de início: 2026-04-15
   
   Subtask 3: [Cenário 3/3] ...
     Responsável: @lucas
     Data de vencimento: 2026-05-01
     Data de início: 2026-04-15
   ```

---

## FAQ

**P: Posso atribuir múltiplas pessoas?**
R: Sim! Clique em "Responsável" e adicione várias pessoas.

**P: Posso mudar responsáveis depois?**
R: Sim! Edite cada subtask manualmente ou a task-mãe (não vai atualizar retroativamente).

**P: O que acontece se a task-mãe não tiver responsável?**
R: As subtasks são criadas sem responsável. Você atribui depois manualmente.

**P: Preciso preencher datas?**
R: Não, é opcional. Funciona sem datas também.

**P: Como atualizar responsáveis de todas as subtasks de uma vez?**
R: Infelizmente ClickUp não suporta edição em massa. Você edita cada subtask individualmente ou a task-mãe (antes de disparar).

---

## Troubleshooting

### Subtasks criadas mas responsável vazio

**Causa:** A task-mãe não tinha responsável quando foi movida.

**Solução:**
1. Edite a task-mãe e preencha "Responsável"
2. Edite cada subtask e preencha "Responsável" manualmente

### Responsáveis não foram copiados

**Causa:** Pode ser um bug do ClickUp MCP.

**Solução:**
1. Verifique logs: `tail -100 /tmp/server.log | grep "assignees"`
2. Se os logs mostram que foram copiados, o problema é do ClickUp
3. Preencha manualmente as subtasks

### Datas estão erradas

**Causa:** ClickUp pode estar interpretando o timezone diferente.

**Solução:**
1. Edite a task-mãe e confirme as datas
2. Mude de novo para "Em Preparação" pra recriar (ou delete e recrie)

---

**Recomendação:** Use **Opção A** (com responsáveis pré-atribuídos). Assim você tem melhor rastreamento de quem vai revisar o quê.

**Data:** 2026-04-15
