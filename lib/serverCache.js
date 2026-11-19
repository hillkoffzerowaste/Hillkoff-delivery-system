// Tiny per-instance cache for read-heavy report routes. Several people opening the same report within
// a couple of minutes share one Firestore read instead of each reading the same documents again.
// Requests in flight for the same key are shared too. `fresh` (the refresh button) always re-reads.
const store = new Map();
const MAX_ENTRIES = 50;

export async function cachedRead(key, ttlMs, read, { fresh = false, now = Date.now } = {}) {
  const hit = store.get(key);
  if (!fresh && hit && (hit.pending || now() - hit.at < ttlMs)) return hit.pending || hit.value;
  const pending = read();
  store.set(key, { pending, at: now() });
  try {
    const value = await pending;
    store.set(key, { value, at: now() });
    if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
    return value;
  } catch (error) {
    if (store.get(key)?.pending === pending) store.delete(key);
    throw error;
  }
}


// Test hook: empty the cache.
export function resetCachedReads() {
  store.clear();
}
