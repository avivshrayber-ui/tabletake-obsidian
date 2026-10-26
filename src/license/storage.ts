export interface LicenseStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export function memoryStorageAdapter(): LicenseStorage {
  const values = new Map<string, string>();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async remove(key) { values.delete(key); },
  };
}
export interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function localStorageAdapter(storage?: WebStorage): LicenseStorage {
  const target = storage ?? (globalThis as unknown as { localStorage?: WebStorage }).localStorage;
  if (!target) throw new Error('localStorage is unavailable; provide a storage adapter');
  return {
    async get(key) { return target.getItem(key); },
    async set(key, value) { target.setItem(key, value); },
    async remove(key) { target.removeItem(key); },
  };
}
export interface ChromeStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, string>): Promise<void>;
  remove(key: string): Promise<void>;
}
export function chromeStorageAdapter(area?: ChromeStorageArea): LicenseStorage {
  const target = area ?? (globalThis as unknown as { chrome?: { storage?: { local?: ChromeStorageArea } } }).chrome?.storage?.local;
  if (!target) throw new Error('chrome.storage.local is unavailable; request the storage permission');
  return {
    async get(key) { const value = (await target.get(key))[key]; return typeof value === 'string' ? value : null; },
    async set(key, value) { await target.set({ [key]: value }); },
    async remove(key) { await target.remove(key); },
  };
}
