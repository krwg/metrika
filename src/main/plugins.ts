

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import * as eventBus from './eventBus';
import { getDb } from './db';
import * as registry from './registry';

export type PluginManifest = {
  id: string;
  name: string;
  version?: string;
  enabled?: boolean;
  contributes?: {
    commands?: Array<{ id: string; label: string; event?: string }>;
    reports?: Array<{ id: string; label: string }>;
    automations?: Array<{ id: string; label: string; trigger?: string }>;
  };
};

type LoadedPlugin = {
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
};

const loaded: LoadedPlugin[] = [];
const commandHandlers = new Map<string, () => any>();

function pluginsRoot() {
  try {
    const session = registry.getSession();
    const orgId = session?.organization?.id;
    if (orgId) {
      const dir = path.join(app.getPath('userData'), 'plugins', `org-${orgId}`);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {  }
  const dir = path.join(app.getPath('userData'), 'plugins', 'global');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readMeta(key: string, fallback = '') {
  try {
    return String((getDb().prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as any)?.value ?? fallback);
  } catch {
    return fallback;
  }
}

function writeMeta(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO schema_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function disabledSet(): Set<string> {
  try {
    const raw = readMeta('setting:plugins.disabled', '[]');
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function listPlugins(): LoadedPlugin[] {
  return loaded.map((p) => ({ ...p, manifest: { ...p.manifest } }));
}

export function listPluginCommands() {
  return loaded
    .filter((p) => p.enabled)
    .flatMap((p) => (p.manifest.contributes?.commands || []).map((c) => ({
      ...c,
      plugin_id: p.manifest.id,
      plugin_name: p.manifest.name,
    })));
}

export function reloadPlugins() {
  loaded.length = 0;
  commandHandlers.clear();
  const root = pluginsRoot();
  const disabled = disabledSet();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    entries = [];
  }

  const builtin: PluginManifest = {
    id: 'metrika.builtin.sample',
    name: 'Метрика · встроенный пример',
    version: '0.5',
    contributes: {
      commands: [
        { id: 'builtin.ping', label: 'Шина: ping', event: 'plugin.ping' },
        { id: 'builtin.stock.summary', label: 'Сводка остатков (событие)', event: 'plugin.stock.summary' },
      ],
      reports: [{ id: 'builtin.recent_events', label: 'Недавние события шины' }],
    },
  };
  loaded.push({ manifest: builtin, dir: root, enabled: !disabled.has(builtin.id) });
  commandHandlers.set('builtin.ping', () => {
    void eventBus.emit('plugin.ping', { at: new Date().toISOString() });
    return { ok: true, event: 'plugin.ping' };
  });
  commandHandlers.set('builtin.stock.summary', () => {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(DISTINCT item_id) AS items, COALESCE(SUM(quantity), 0) AS qty
      FROM inventory WHERE quantity != 0
    `).get() as any;
    void eventBus.emit('plugin.stock.summary', row);
    return { ok: true, ...row };
  });

  for (const name of entries) {
    const dir = path.join(root, name);
    const manifestPath = path.join(dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginManifest;
      if (!manifest?.id || !manifest?.name) continue;
      const enabled = !disabled.has(manifest.id);
      loaded.push({ manifest, dir, enabled });
      for (const cmd of manifest.contributes?.commands || []) {
        if (!cmd.id) continue;
        commandHandlers.set(cmd.id, () => {
          if (cmd.event) void eventBus.emit(cmd.event, { plugin_id: manifest.id, command: cmd.id });

          const mainJs = path.join(dir, 'main.js');
          if (fs.existsSync(mainJs)) {
            try {

              const mod = require(mainJs);
              if (typeof mod?.runCommand === 'function') return mod.runCommand(cmd.id, { eventBus, getDb });
            } catch (e) {
              console.warn('[Metrika] plugin main.js failed:', e);
            }
          }
          return { ok: true, plugin_id: manifest.id, command: cmd.id };
        });
      }
    } catch (e) {
      console.warn('[Metrika] bad plugin manifest', name, e);
    }
  }

  writeMeta('setting:plugins.root', root);
  void eventBus.emit('plugins.reloaded', { count: loaded.length, root });
  return listPlugins();
}

export function setPluginEnabled(pluginId: string, enabled: boolean) {
  const id = String(pluginId || '');
  const set = disabledSet();
  if (enabled) set.delete(id);
  else set.add(id);
  writeMeta('setting:plugins.disabled', JSON.stringify([...set]));
  return reloadPlugins();
}

export function runPluginCommand(commandId: string) {
  const fn = commandHandlers.get(String(commandId || ''));
  if (!fn) throw new Error('Команда плагина не найдена');
  return fn();
}

export function getPluginsRoot() {
  return pluginsRoot();
}

export function ensurePluginsLoaded() {
  if (!loaded.length) reloadPlugins();
  return listPlugins();
}
