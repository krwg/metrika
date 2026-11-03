
export function greetingName(user: any, fallback = 'пользователь') {
  const display = String(user?.display_name || '').trim();
  if (display) return display;
  const first = String(user?.first_name || '').trim();
  if (first) return first;
  return String(user?.login || '').trim() || fallback;
}


export function fullName(user: any, fallback = '—') {
  const parts = [
    String(user?.last_name || '').trim(),
    String(user?.first_name || '').trim(),
    String(user?.middle_name || '').trim(),
  ].filter(Boolean);
  if (parts.length) return parts.join(' ');
  const display = String(user?.display_name || '').trim();
  if (display) return display;
  return String(user?.login || '').trim() || fallback;
}
