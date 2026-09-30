(function (scope) {
  const walls = [2, 3, 4, 6, 7, 8, 12, 13, 14];
  const defaults = () => ({ version: 1, lang: 'en', level: 0, score: 0, misses: 0, hinted: false, solved: false, selection: null, order: [], pos: 0, path: [0], moves: 0, complete: false });
  function validate(raw) {
    const d = defaults();
    if (!raw || raw.version !== 1) return d;
    for (const [key, max] of [['level', 9], ['score', 1000], ['misses', 10000], ['pos', 15], ['moves', 10000]]) {
      if (!Number.isInteger(raw[key]) || raw[key] < 0 || raw[key] > max) return d;
    }
    if (walls.includes(raw.pos) || !['en', 'ar'].includes(raw.lang)) return d;
    if (!Array.isArray(raw.order) || raw.order.length > 3 || new Set(raw.order).size !== raw.order.length || raw.order.some(v => !['A', 'B', 'C'].includes(v))) return d;
    if (!Array.isArray(raw.path) || raw.path.length < 1 || raw.path.length > 10001 || raw.path[0] !== 0 || raw.path[raw.path.length - 1] !== raw.pos) return d;
    if (raw.path.some((v, i) => !Number.isInteger(v) || v < 0 || v > 15 || walls.includes(v) || (i && !canMove(raw.path[i-1], v - raw.path[i-1])))) return d;
    for (const key of ['hinted', 'solved', 'complete']) if (typeof raw[key] !== 'boolean') return d;
    if (raw.complete && (raw.level !== 9 || !raw.solved)) return d;
    if (raw.selection !== null && (!Number.isInteger(raw.selection) || raw.selection < 0 || raw.selection > 3)) return d;
    return { ...d, ...raw };
  }
  function canMove(pos, delta) {
    if (![1, -1, 4, -4].includes(delta)) return false;
    const next = pos + delta;
    return next >= 0 && next < 16 && !walls.includes(next) && !(delta === 1 && pos % 4 === 3) && !(delta === -1 && pos % 4 === 0);
  }
  function points(misses, hinted) { return Math.max(10, 100 - misses * 20 - (hinted ? 30 : 0)); }
  const api = { defaults, validate, canMove, points, walls };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.LogicSparkCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
