export type WindowEntry = {
  id: string;
  title: string;
  minimized: boolean;
  restore: () => void;
  minimize: () => void;
  focus: () => void;
  close: () => void;
};

type Listener = () => void;

type Store = {
  windows: Map<string, WindowEntry>;
  listeners: Set<Listener>;
  version: number;
};

const globalKey = '__metrikaWindowRegistry__';

function getStore(): Store {
  const root = globalThis as typeof globalThis & { [globalKey]?: Store };
  if (!root[globalKey]) {
    root[globalKey] = {
      windows: new Map(),
      listeners: new Set(),
      version: 0,
    };
  }
  return root[globalKey]!;
}

function notify() {
  const store = getStore();
  store.version += 1;
  store.listeners.forEach((fn) => {
    try { fn(); } catch {  }
  });
}

export function subscribeWindows(listener: Listener) {
  const store = getStore();
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
}

export function getWindowsVersion() {
  return getStore().version;
}

export function listWindows(): WindowEntry[] {
  return Array.from(getStore().windows.values());
}

export function registerWindow(entry: WindowEntry) {
  getStore().windows.set(entry.id, entry);
  notify();
}

export function updateWindow(id: string, patch: Partial<Pick<WindowEntry, 'title' | 'minimized'>>) {
  const store = getStore();
  const current = store.windows.get(id);
  if (!current) return;
  store.windows.set(id, { ...current, ...patch });
  notify();
}

export function unregisterWindow(id: string) {
  const store = getStore();
  if (!store.windows.delete(id)) return;
  notify();
}
