/**
 * Termos que disparam a flag LGPD (dados de paciente).
 *
 * Regra de cautela (PRD RF5): em caso de dúvida, SEMPRE marcar a flag.
 * Falso positivo é melhor que falso negativo em compliance.
 *
 * Cada termo é case-insensitive e deve ser buscado com e sem acentos.
 * A função `matchesLgpdTerms` cuida da normalização.
 */
export const LGPD_TERMS: readonly string[] = [
  "paciente",
  "prontuário",
  "prontuario",
  "cpf",
  "exame",
  "laudo",
  "prescrição",
  "prescricao",
  "diagnóstico",
  "diagnostico",
  "histórico médico",
  "historico medico",
  "receita",
  "anamnese",
  "consulta",
  "atendimento",
  "leito",
  "internação",
  "internacao",
  "dados sensíveis",
  "dados sensiveis",
  "lgpd",
  "hipaa",
  "saúde",
  "saude",
] as const;

/**
 * Normaliza texto removendo acentos e convertendo pra minúsculo.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Retorna os termos LGPD encontrados no texto.
 * Busca case-insensitive e accent-insensitive.
 */
export function matchesLgpdTerms(text: string): string[] {
  const normalizedText = normalize(text);
  const matched: string[] = [];

  for (const term of LGPD_TERMS) {
    const normalizedTerm = normalize(term);
    if (normalizedText.includes(normalizedTerm)) {
      // Retorna o termo original (com acentos) pra exibição
      if (!matched.includes(term)) {
        matched.push(term);
      }
    }
  }

  return matched;
}
