import { getEnv } from "../config/env.js";

export interface TeamMember {
  alias: string;
  match: string[];
}

let _equipe: TeamMember[] | undefined;

export function getEquipe(): TeamMember[] {
  if (!_equipe) {
    const raw = getEnv().REPORTS_TEAM_ALIASES;
    _equipe = raw
      .split("|")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [alias, matches] = entry.split(":");
        const matchList = (matches ?? "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);
        return {
          alias: (alias ?? "").trim(),
          match: matchList.length > 0 ? matchList : [(alias ?? "").trim()],
        };
      })
      .filter((m) => m.alias);
  }
  return _equipe;
}

export function extrairNomesAssignees(assignees: unknown): string {
  if (!assignees) return "";
  if (typeof assignees === "string") return assignees;
  if (Array.isArray(assignees)) {
    return assignees
      .map((u) => {
        if (u && typeof u === "object" && "username" in u) {
          return String((u as { username: unknown }).username ?? "");
        }
        return String(u);
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(assignees);
}

export function identificarDono(assignees: unknown): TeamMember | null {
  const responsaveis = extrairNomesAssignees(assignees).toLowerCase();
  if (!responsaveis) return null;
  const equipe = getEquipe();
  return (
    equipe.find((membro) => membro.match.some((termo) => responsaveis.includes(termo.toLowerCase()))) ?? null
  );
}
