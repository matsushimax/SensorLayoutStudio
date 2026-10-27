export function uniqueSensorName(requested: string, names: string[]): string {
  const used = new Set(['base_link', 'model', ...names]);
  if (!used.has(requested)) return requested;
  const base = requested.replace(/_\d+$/, '');
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const candidate = base.slice(0, 200 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}
