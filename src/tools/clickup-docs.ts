import { clickupFetchV3 } from "./clickup-mcp.js";
import { getEnv } from "../config/env.js";

interface DocPage {
  id: string;
  doc_id?: string;
  name: string;
  pages?: DocPage[];
}

interface PageListingResponse {
  pages?: DocPage[];
}

interface CreatePageResponse {
  id: string;
  doc_id: string;
  name: string;
}

function getReportsToken(): string {
  const env = getEnv();
  return env.CLICKUP_REPORTS_TOKEN || env.CLICKUP_API_TOKEN;
}

export async function getDocPagesTree(docId: string): Promise<DocPage[]> {
  const env = getEnv();
  const path = `/workspaces/${env.CLICKUP_REPORTS_TEAM_ID}/docs/${docId}/page_listing?max_page_depth=-1`;
  const data = (await clickupFetchV3(path, { method: "GET" }, getReportsToken())) as
    | PageListingResponse
    | DocPage[];
  if (Array.isArray(data)) return data;
  return data?.pages ?? [];
}

function findPageById(tree: DocPage[], id: string): DocPage | null {
  for (const page of tree) {
    if (page.id === id) return page;
    if (page.pages?.length) {
      const hit = findPageById(page.pages, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function findChildByName(parent: DocPage, name: string): DocPage | null {
  if (!parent.pages?.length) return null;
  const target = name.trim().toLowerCase();
  return parent.pages.find((p) => p.name.trim().toLowerCase() === target) ?? null;
}

export function getMesAnoAtual(timezone: string, now: Date = new Date()): string {
  const mes = now.toLocaleString("pt-BR", { month: "long", timeZone: timezone });
  const mesFmt = mes.charAt(0).toUpperCase() + mes.slice(1);
  const ano = parseInt(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric" }).format(now),
    10,
  );
  return `${mesFmt} - ${ano}`;
}

interface CreatePageOptions {
  docId: string;
  parentPageId: string;
  name: string;
  content?: string;
}

async function createPage(opts: CreatePageOptions): Promise<CreatePageResponse> {
  const env = getEnv();
  const body: Record<string, unknown> = {
    content_format: "text/md",
    parent_page_id: opts.parentPageId,
    name: opts.name,
  };
  if (opts.content !== undefined) body.content = opts.content;

  const path = `/workspaces/${env.CLICKUP_REPORTS_TEAM_ID}/docs/${opts.docId}/pages`;
  const created = (await clickupFetchV3(
    path,
    { method: "POST", body: JSON.stringify(body) },
    getReportsToken(),
  )) as CreatePageResponse;
  if (!created?.id) throw new Error(`Falha ao criar página: resposta sem id (${JSON.stringify(created)})`);
  return created;
}

/**
 * Garante que a página do mês corrente exista dentro da pasta-mãe informada
 * (Daily ou Weekly). Retorna a página do mês.
 */
export async function ensureMonthPage(parentPageId: string, now: Date = new Date()): Promise<DocPage> {
  const env = getEnv();
  const tree = await getDocPagesTree(env.CLICKUP_REPORTS_DOC_ID);
  const pastaMae = findPageById(tree, parentPageId);
  if (!pastaMae) {
    throw new Error(`Pasta-mãe ${parentPageId} não encontrada no doc ${env.CLICKUP_REPORTS_DOC_ID}.`);
  }

  const nomeMes = getMesAnoAtual(env.REPORTS_TIMEZONE, now);
  const existente = findChildByName(pastaMae, nomeMes);
  if (existente) return existente;

  const created = await createPage({
    docId: env.CLICKUP_REPORTS_DOC_ID,
    parentPageId,
    name: nomeMes,
  });
  return { id: created.id, doc_id: created.doc_id, name: created.name, pages: [] };
}

export async function findChildPageByName(parentPageId: string, name: string): Promise<DocPage | null> {
  const env = getEnv();
  const tree = await getDocPagesTree(env.CLICKUP_REPORTS_DOC_ID);
  const parent = findPageById(tree, parentPageId);
  if (!parent) return null;
  return findChildByName(parent, name);
}

/**
 * Cria a página filha (daily/weekly) dentro do mês. Se já existir uma com o
 * mesmo nome, retorna `existing` em vez de duplicar.
 */
export async function createReportPage(
  monthPageId: string,
  name: string,
  content: string,
): Promise<{ status: "created" | "exists"; page: DocPage }> {
  const env = getEnv();
  const existing = await findChildPageByName(monthPageId, name);
  if (existing) return { status: "exists", page: existing };

  const created = await createPage({
    docId: env.CLICKUP_REPORTS_DOC_ID,
    parentPageId: monthPageId,
    name,
    content,
  });
  return {
    status: "created",
    page: { id: created.id, doc_id: created.doc_id, name: created.name, pages: [] },
  };
}

export type { DocPage };
