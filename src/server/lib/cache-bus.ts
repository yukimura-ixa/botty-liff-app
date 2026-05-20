type Buster = (key: string) => void;

const busters = new Map<string, Set<Buster>>();

export function registerBuster(topic: string, fn: Buster): () => void {
  let set = busters.get(topic);
  if (!set) {
    set = new Set();
    busters.set(topic, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

export function bust(topic: string, key = ""): void {
  const [base, ...rest] = topic.split(":");
  const subKey = rest.join(":") || key;
  const set = busters.get(base);
  if (!set) return;
  for (const fn of set) {
    try { fn(subKey); } catch { /* swallow */ }
  }
}
