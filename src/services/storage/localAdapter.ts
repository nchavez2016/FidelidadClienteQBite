/**
 * Thin synchronous key-value adapter over `localStorage`.
 *
 * This is the ONLY module that touches `localStorage` directly.
 * When Supabase is wired in, services will switch to async clients
 * and this adapter can be retired (or kept for a local cache).
 */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },
};
