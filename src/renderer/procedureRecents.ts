const KEY = 'metrika.procedureRecents';
const MAX = 6;

export function loadRecentProcedures(orgId?: number | null): string[] {
  try {
    const raw = localStorage.getItem(`${KEY}.${orgId || 0}`);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentProcedure(orgId: number | null | undefined, procedureId: string) {
  if (!procedureId) return;
  const key = `${KEY}.${orgId || 0}`;
  const next = [procedureId, ...loadRecentProcedures(orgId).filter((id) => id !== procedureId)].slice(0, MAX);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {  }
  return next;
}
