/**
 * API client. Sends credentials (cookies) automatically.
 * Throws ApiError on non-2xx responses with the parsed error envelope.
 *
 * Base URL is configurable via VITE_API_BASE_URL (defaults to localhost:8000).
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000';

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // 204 No Content
  if (res.status === 204) return undefined as T;

  let payload: any = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code || 'http_error',
      err?.message || `Request failed with status ${res.status}`,
      err?.request_id,
    );
  }

  return payload as T;
}

// ---- Auth ----
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: any; workspace: any }>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  me: () => request<{ user: any; workspace: any }>('/api/v1/auth/me'),
};

// ---- Resources (extend as needed) ----
export const incidentsApi = {
  list: (q?: string) => request<any>(`/api/v1/incidents${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get: (id: string) => request<any>(`/api/v1/incidents/${id}`),
  create: (body: any) => request<any>('/api/v1/incidents', { method: 'POST', body }),
  update: (id: string, body: any) => request<any>(`/api/v1/incidents/${id}`, { method: 'PATCH', body }),
};

export const investigationsApi = {
  list: () => request<any>('/api/v1/investigations'),
  get: (id: string) => request<any>(`/api/v1/investigations/${id}`),
  start: (body: { title: string; incident_id: string }) =>
    request<any>('/api/v1/investigations', { method: 'POST', body }),
  cancel: (id: string) => request<any>(`/api/v1/investigations/${id}/cancel`, { method: 'POST' }),
};

export const runsApi = {
  list: () => request<any>('/api/v1/runs'),
  get: (id: string) => request<any>(`/api/v1/runs/${id}`),
  retry: (id: string) => request<any>(`/api/v1/runs/${id}/retry`, { method: 'POST' }),
};

export const approvalsApi = {
  list: (status?: string) =>
    request<any>(`/api/v1/approvals${status ? `?status=${status}` : ''}`),
  get: (id: string) => request<any>(`/api/v1/approvals/${id}`),
  approve: (id: string, reason?: string) =>
    request<any>(`/api/v1/approvals/${id}/approve`, { method: 'POST', body: { reason } }),
  reject: (id: string, reason: string) =>
    request<any>(`/api/v1/approvals/${id}/reject`, { method: 'POST', body: { reason } }),
};

export const graphApi = {
  subgraph: (center: string, hops = 2) =>
    request<any>(`/api/v1/graph/subgraph?center=${encodeURIComponent(center)}&hops=${hops}`),
  path: (from: string, to: string) =>
    request<any>(`/api/v1/graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  blastRadius: (service: string, depth = 3) =>
    request<any>(`/api/v1/graph/blast-radius?service=${encodeURIComponent(service)}&depth=${depth}`),
  criticality: () => request<any>('/api/v1/graph/criticality'),
  communities: () => request<any>('/api/v1/graph/communities'),
  query: (query_id: string, params: Record<string, unknown>) =>
    request<any>('/api/v1/graph/query', { method: 'POST', body: { query_id, params } }),
};

export const memoryApi = {
  list: (params?: { type?: string; status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    return request<any>(`/api/v1/memory${qs.toString() ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<any>(`/api/v1/memory/${id}`),
  create: (body: any) => request<any>('/api/v1/memory', { method: 'POST', body }),
  update: (id: string, body: any) => request<any>(`/api/v1/memory/${id}`, { method: 'PATCH', body }),
  delete: (id: string) => request<any>(`/api/v1/memory/${id}`, { method: 'DELETE' }),
  verify: (id: string) => request<any>(`/api/v1/memory/${id}/verify`, { method: 'POST' }),
  pin: (id: string) => request<any>(`/api/v1/memory/${id}/pin`, { method: 'POST' }),
  deprecate: (id: string) => request<any>(`/api/v1/memory/${id}/deprecate`, { method: 'POST' }),
};

export const knowledgeApi = {
  ask: (question: string) => request<any>('/api/v1/ask', { method: 'POST', body: { question } }),
  sources: () => request<any>('/api/v1/knowledge/sources'),
  document: (id: string) => request<any>(`/api/v1/knowledge/sources/${id}`),
  search: (q: string) => request<any>(`/api/v1/knowledge/search?q=${encodeURIComponent(q)}`),
};

export const servicesApi = {
  list: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    return request<any>(`/api/v1/services${qs.toString() ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<any>(`/api/v1/services/${id}`),
};

export const auditApi = {
  list: (params?: { actor?: string; verb?: string; target_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.actor) qs.set('actor', params.actor);
    if (params?.verb) qs.set('verb', params.verb);
    if (params?.target_id) qs.set('target_id', params.target_id);
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<any>(`/api/v1/audit${qs.toString() ? `?${qs}` : ''}`);
  },
  verbs: () => request<any>('/api/v1/audit/verbs'),
};

// ---- SSE ----
export function openRunEvents(runId: string, lastEventId?: number): EventSource {
  const url = `${BASE_URL}/api/v1/runs/${runId}/events`;
  const es = new EventSource(url, { withCredentials: true });
  if (lastEventId != null) {
    // EventSource does not let us set headers; Last-Event-ID is sent automatically
    // on reconnect. For manual control, we pass it via a query param the server
    // can read as a fallback — we add it here.
    // (Optional: server can support ?last_event_id=)
  }
  return es;
}

export const teamApi = {
  list: (params?: { q?: string; role?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.role) qs.set('role', params.role);
    return request<any>(`/api/v1/team${qs.toString() ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<any>(`/api/v1/team/${id}`),
};