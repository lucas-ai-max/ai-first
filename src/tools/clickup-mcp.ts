import { MCPConfiguration } from "@mastra/mcp";
import { getEnv } from "../config/env.js";

let _mcp: MCPConfiguration | undefined;

export function getClickUpMCP(): MCPConfiguration {
  if (!_mcp) {
    const env = getEnv();
    _mcp = new MCPConfiguration({
      id: "clickup",
      servers: {
        clickup: {
          url: new URL(env.CLICKUP_MCP_URL),
          requestInit: {
            headers: {
              Authorization: `Bearer ${env.CLICKUP_API_TOKEN}`,
            },
          },
        },
      },
    });
  }
  return _mcp;
}

/**
 * Retorna as tools do ClickUp MCP prontas pra uso com o Mastra Agent.
 */
export async function getClickUpTools() {
  const mcp = getClickUpMCP();
  const tools = await mcp.getTools();
  return tools;
}

// ────────────────────────────────────────────────────────────
// Helpers diretos via ClickUp REST API
// O agente de triagem usa estes helpers diretamente ao invés
// de delegar pro LLM via MCP tools, garantindo controle total.
// ────────────────────────────────────────────────────────────

const BASE_URL = "https://api.clickup.com/api/v2";
const BASE_URL_V3 = "https://api.clickup.com/api/v3";

export async function clickupFetch(path: string, options: RequestInit = {}, token?: string): Promise<unknown> {
  const env = getEnv();
  const authToken = token || env.CLICKUP_API_TOKEN;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: authToken,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function clickupFetchV3(path: string, options: RequestInit = {}, token?: string): Promise<unknown> {
  const env = getEnv();
  const authToken = token || env.CLICKUP_API_TOKEN;
  const res = await fetch(`${BASE_URL_V3}${path}`, {
    ...options,
    headers: {
      Authorization: authToken,
      "Content-Type": "application/json",
      accept: "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp API v3 ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  assignees: Array<{ id: number; username: string }>;
  due_date: string | null;
  start_date: string | null;
  parent: string | null;
  custom_fields: Array<{
    id: string;
    name: string;
    type: string;
    value?: unknown;
    type_config?: { options?: Array<{ id: string; name: string; label: string }> };
  }>;
}

export interface ClickUpComment {
  id: string;
  comment_text: string;
  user: { id: number; username: string };
  date: string;
}

export async function getTask(taskId: string, token?: string): Promise<ClickUpTask> {
  return clickupFetch(`/task/${taskId}?include_subtasks=false`, {}, token) as Promise<ClickUpTask>;
}

export async function getTaskComments(taskId: string, token?: string): Promise<ClickUpComment[]> {
  const data = (await clickupFetch(`/task/${taskId}/comment`, {}, token)) as {
    comments: ClickUpComment[];
  };
  return data.comments;
}

export async function postComment(taskId: string, commentText: string, token?: string): Promise<void> {
  await clickupFetch(`/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: commentText }),
  }, token);
}

export async function updateCustomField(
  taskId: string,
  fieldId: string,
  value: unknown,
  token?: string,
): Promise<void> {
  await clickupFetch(`/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    body: JSON.stringify({ value }),
  }, token);
}

export async function updateTaskStatus(taskId: string, status: string, token?: string): Promise<void> {
  await clickupFetch(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  }, token);
}

export interface CreateSubtaskParams {
  listId: string;
  name: string;
  description: string;
  parentTaskId: string;
  status: string;
  assignees?: number[];
  due_date?: string | null;
  start_date?: string | null;
}

export async function createSubtask(params: CreateSubtaskParams, token?: string): Promise<ClickUpTask> {
  const body: Record<string, unknown> = {
    name: params.name,
    description: params.description,
    parent: params.parentTaskId,
    status: params.status,
  };
  if (params.assignees && params.assignees.length > 0) {
    body.assignees = params.assignees;
  }
  if (params.due_date) {
    body.due_date = Number(params.due_date);
  }
  if (params.start_date) {
    body.start_date = Number(params.start_date);
  }
  return clickupFetch(`/list/${params.listId}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  }, token) as Promise<ClickUpTask>;
}

export async function getSubtasks(taskId: string, token?: string): Promise<ClickUpTask[]> {
  const data = (await clickupFetch(`/task/${taskId}?include_subtasks=true`, {}, token)) as
    ClickUpTask & { subtasks?: ClickUpTask[] };
  return data.subtasks ?? [];
}

/**
 * Lê o valor de um custom field pelo nome (case-insensitive).
 */
export function getCustomFieldValue(task: ClickUpTask, fieldName: string): unknown {
  const field = task.custom_fields.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
  );
  return field?.value;
}

/**
 * Encontra o ID de um custom field pelo nome.
 */
export function getCustomFieldId(task: ClickUpTask, fieldName: string): string | undefined {
  const field = task.custom_fields.find(
    (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
  );
  return field?.id;
}

/**
 * Retorna o token de autenticação apropriado.
 * Para o agente de testes, usa CLICKUP_API_TOKEN_TESTES se disponível.
 * Caso contrário, usa o token padrão (triagem).
 */
export function getClickUpToken(useTestesToken: boolean = false): string {
  const env = getEnv();
  if (useTestesToken && env.CLICKUP_API_TOKEN_TESTES) {
    return env.CLICKUP_API_TOKEN_TESTES;
  }
  return env.CLICKUP_API_TOKEN;
}
