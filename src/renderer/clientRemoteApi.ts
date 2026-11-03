

const LS_URL = 'metrika.client.remoteUrl';
const LS_TOKEN = 'metrika.client.remoteToken';

export type RemoteConfig = { url: string; token: string };

export function loadRemoteConfig(): RemoteConfig {
  try {
    return {
      url: String(localStorage.getItem(LS_URL) || '').trim().replace(/\/+$/, ''),
      token: String(localStorage.getItem(LS_TOKEN) || '').trim(),
    };
  } catch {
    return { url: '', token: '' };
  }
}

export function saveRemoteConfig(cfg: RemoteConfig) {
  localStorage.setItem(LS_URL, String(cfg.url || '').trim().replace(/\/+$/, ''));
  localStorage.setItem(LS_TOKEN, String(cfg.token || '').trim());
}

export function clearRemoteConfig() {
  localStorage.removeItem(LS_URL);
  localStorage.removeItem(LS_TOKEN);
}

export function hasRemoteConfig(cfg = loadRemoteConfig()) {
  return Boolean(cfg.url && cfg.token);
}

async function remoteFetch(path: string, init: RequestInit = {}, cfg = loadRemoteConfig()) {
  if (!cfg.url || !cfg.token) throw new Error('Укажите URL сервера и токен портала');
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function remoteHealth(url: string) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/v1/health`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function remoteAuth(cfg: RemoteConfig) {
  const base = String(cfg.url || '').trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/v1/portal/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const remoteApi = {
  context: () => remoteFetch('/v1/portal/context'),
  threads: async () => {
    const data = await remoteFetch('/v1/portal/threads');
    return data.threads || [];
  },
  thread: (id: number) => remoteFetch(`/v1/portal/threads/${id}`),
  startThread: (body: any) => remoteFetch('/v1/portal/threads', { method: 'POST', body: JSON.stringify(body || {}) }),
  postMessage: (threadId: number, body: string, clientMsgId?: string) =>
    remoteFetch(`/v1/portal/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, client_msg_id: clientMsgId }),
    }),
  events: async (since: number, limit = 50) => {
    const data = await remoteFetch(`/v1/portal/events?since=${Number(since) || 0}&limit=${limit}`);
    return data.events || [];
  },
};
