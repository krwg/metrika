

type Handler = (payload: any) => void | Promise<void>;

const handlers = new Map<string, Set<Handler>>();
const recent: Array<{ at: string; event: string; payload?: any }> = [];
const RECENT_MAX = 200;

export function on(event: string, handler: Handler) {
  const key = String(event || '*');
  if (!handlers.has(key)) handlers.set(key, new Set());
  handlers.get(key)!.add(handler);
  return () => off(key, handler);
}

export function off(event: string, handler: Handler) {
  handlers.get(String(event))?.delete(handler);
}

export async function emit(event: string, payload?: any) {
  const name = String(event || 'unknown');
  recent.push({ at: new Date().toISOString(), event: name, payload });
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
  const list = [
    ...(handlers.get(name) || []),
    ...(handlers.get('*') || []),
  ];
  for (const h of list) {
    try {
      await h(payload);
    } catch (e) {
      console.warn(`[Metrika] eventBus handler error (${name}):`, e);
    }
  }
}

export function listRecentEvents(limit = 50) {
  return recent.slice(-Math.min(200, Math.max(1, limit))).reverse();
}

export function listEventNames() {
  return [...handlers.keys()].filter((k) => k !== '*').sort();
}
