# Fluxo de Status das Subtasks de Testes

## Progresso de Status

Cada subtask de teste passa pelos seguintes estados:

### ✅ Fluxo Normal (Sucesso)

```
1️⃣ backlog de testes
   ↓
2️⃣ preparando (antes de disparar o teste)
   ↓
3️⃣ em execução (durante o teste)
   ↓
4️⃣ em análise (gerando relatório)
   ↓
5️⃣ aprovado / reprovado / aguardando revisão (final)
```

### ❌ Fluxo de Erro

Se ocorrer erro em qualquer etapa:
```
backlog de testes → preparando → [ERRO DETECTADO] → erro
```

## Status Possíveis

| Status | Significado |
|--------|------------|
| `backlog de testes` | Subtask criada, aguardando início |
| `preparando` | Configurando teste, disparando no testa-ai |
| `em execução` | Teste rodando, enviando mensagens |
| `em análise` | Relatório sendo gerado/analisado |
| `aprovado` | ✅ Teste passou |
| `reprovado` | ❌ Teste falhou |
| `aguardando revisão` | ⚠️ Resultado inconclusivo, requer revisão humana |
| `erro` | 🚨 Erro durante o processo |

## Tempos Entre Transições

- **preparando → em execução**: Imediato (quando SSE conecta)
- **em análise → status final**: +1 segundo (pequeno delay visual)

## Observações

- Status são atualizados em tempo real no ClickUp
- Cada transição é registrada no histórico da task
- Em caso de timeout ou erro, a task vai direto para "erro"
