const busters = new Set<() => void>();

export function registerLeaderboardCacheBuster(fn: () => void): () => void {
  busters.add(fn);
  return () => busters.delete(fn);
}

export function bustLeaderboardCaches(): void {
  for (const fn of busters) {
    try { fn(); } catch { /* swallow */ }
  }
}
