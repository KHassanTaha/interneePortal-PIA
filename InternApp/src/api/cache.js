import AsyncStorage from '@react-native-async-storage/async-storage';

// Read-side offline cache.
// GET responses are stored per authenticated user so accounts never leak into
// each other. Keys look like `cache:{userId}:{url}`; a bounded "recent" list
// lets us revalidate the last-visited screens when connectivity returns.

const PREFIX = 'cache';
const RECENT_KEY = '__recent__';
const RECENT_LIMIT = 40;

let cacheUserId = null;

export function setCacheUser(userId) {
  cacheUserId = userId == null ? null : String(userId);
}

export function getCacheUser() {
  return cacheUserId;
}

const namespace = () => `${PREFIX}:${cacheUserId || 'anon'}`;

export function buildKey(url) {
  return `${namespace()}:${url}`;
}

export async function cacheWrite(key, data) {
  if (!data) return;
  try {
    const entry = {data, fetchedAt: Date.now()};
    await AsyncStorage.setItem(key, JSON.stringify(entry));

    // Track the most recently cached URLs for background revalidation.
    const recentRaw = await AsyncStorage.getItem(`${namespace()}:${RECENT_KEY}`);
    let recent = [];
    try {
      recent = recentRaw ? JSON.parse(recentRaw) : [];
    } catch {
      recent = [];
    }
    recent = recent.filter(r => r.key !== key);
    recent.unshift({key, fetchedAt: Date.now()});
    recent = recent.slice(0, RECENT_LIMIT);
    await AsyncStorage.setItem(`${namespace()}:${RECENT_KEY}`, JSON.stringify(recent));
  } catch {
    /* cache failures must never break the request */
  }
}

// Returns {data, fetchedAt, stale} or null when nothing is cached.
export async function cacheRead(key, ttlMs = 5 * 60 * 1000) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !('data' in entry)) return null;
    const stale = Date.now() - (entry.fetchedAt || 0) > ttlMs;
    return {data: entry.data, fetchedAt: entry.fetchedAt, stale};
  } catch {
    return null;
  }
}

export async function cacheRemove(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export async function getRecentKeys() {
  try {
    const raw = await AsyncStorage.getItem(`${namespace()}:${RECENT_KEY}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Fires a fresh GET per recently-cached URL to keep offline data warm.
// Never throws; purely best-effort background revalidation.
export async function revalidateRecent(client) {
  const recent = await getRecentKeys();
  const urls = recent.map(r => r.url).filter(Boolean);
  await Promise.allSettled(
    urls.map(url =>
      client
        .get(url, {skipCache: true})
        .catch(() => {}),
    ),
  );
}

export async function clearUserCache(userId) {
  try {
    const scope = `${PREFIX}:${String(userId)}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(scope));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}