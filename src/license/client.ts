import type { LicenseStorage } from './storage.js';
export { memoryStorageAdapter } from './storage.js';
export type { LicenseStorage } from './storage.js';
export type InvalidReason = 'no_license' | 'expired' | 'bad_signature' | 'wrong_product' | 'wrong_device' | 'revoked' | 'inactive';
export interface Entitlement {
  valid: boolean; reason?: InvalidReason; plan: string | null; kind: 'subscription' | 'lifetime' | null;
  status: string | null; expiresAt: number | null; refreshAfter: number | null; periodEnd: number | null;
}
export interface PublicKey { kid: string; x: string }
export interface VerifyOptions {
  product: string; issuer: string; device: string; publicKeys: readonly PublicKey[];
  /** Milliseconds since Unix epoch, like Date.now. Token timestamps are seconds. */
  now?: () => number;
}
export interface ClientOptions extends Omit<VerifyOptions, 'device'> {
  baseUrl: string; storage: LicenseStorage; fetch?: typeof fetch;
  /** Defaults to 10 seconds; expired refreshes must not hang forever. */
  timeoutMs?: number;
}
export const invalidEntitlement = (reason: InvalidReason): Entitlement => ({
  valid: false, reason, plan: null, kind: null, status: null, expiresAt: null, refreshAfter: null, periodEnd: null,
});
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
export async function verifyEntitlementToken(token: string, opts: VerifyOptions): Promise<Entitlement> {
  try {
    if (typeof token !== 'string' || token.length > 16384) return invalidEntitlement('bad_signature');
    const parts = token.split('.');
    if (parts.length !== 3) return invalidEntitlement('bad_signature');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (header.alg !== 'EdDSA' || typeof header.kid !== 'string' || header.crit !== undefined) return invalidEntitlement('bad_signature');
    const selected = opts.publicKeys.filter(k => k.kid === header.kid);
    if (selected.length !== 1) return invalidEntitlement('bad_signature');
    const key = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: selected[0].x }, { name: 'Ed25519' }, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) return invalidEntitlement('bad_signature');
    const p = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor((opts.now ?? Date.now)() / 1000);
    if (!p || p.iss !== opts.issuer || typeof p.sub !== 'string' || !p.sub || typeof p.pln !== 'string' ||
      !['subscription', 'lifetime'].includes(p.knd) || !['active', 'trialing', 'past_due', 'cancelled', 'expired', 'revoked'].includes(p.sts) ||
      ![p.iat, p.rfr, p.exp].every(Number.isSafeInteger) || p.exp <= p.iat || p.rfr < p.iat || p.iat > now + 300 ||
      !(p.pend === null || Number.isSafeInteger(p.pend))) return invalidEntitlement('bad_signature');
    if (p.prd !== opts.product) return invalidEntitlement('wrong_product');
    if (p.dev !== opts.device) return invalidEntitlement('wrong_device');
    const entitlement: Entitlement = {
      valid: true, plan: p.pln, kind: p.knd, status: p.sts, expiresAt: p.exp, refreshAfter: p.rfr, periodEnd: p.pend,
    };
    if (p.sts === 'revoked') return { ...entitlement, valid: false, reason: 'revoked' };
    if (p.sts === 'expired') return { ...entitlement, valid: false, reason: 'inactive' };
    if (now >= p.exp + 300) return { ...entitlement, valid: false, reason: 'expired' };
    return entitlement;
  } catch { return invalidEntitlement('bad_signature'); }
}
interface State { device: string; key?: string; token?: string; denied?: 'inactive' | 'revoked' }
export class LicenseApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); this.name = 'LicenseApiError'; }
}
export function createLicenseClient(opts: ClientOptions) {
  const storageKey = 'license-kit:' + opts.baseUrl.replace(/\/$/, '') + ':' + opts.product;
  const base = opts.baseUrl.replace(/\/$/, '');
  const fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const now = opts.now ?? Date.now;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn); queue = run.catch(() => {}); return run;
  };
  const save = (state: State) => opts.storage.set(storageKey, JSON.stringify(state));
  async function state(): Promise<State> {
    const raw = await opts.storage.get(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.device === 'string' && parsed.device.length > 0 && parsed.device.length <= 128) return parsed;
      } catch { /* Recover a corrupted local record with a fresh device. */ }
    }
    const fresh = { device: crypto.randomUUID() }; await save(fresh); return fresh;
  }
  const verify = (token: string, device: string) => verifyEntitlementToken(token, { ...opts, device });
  async function request(path: string, init: RequestInit): Promise<{ token?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
    try {
      const requestInit = { ...init, signal: controller.signal, credentials: 'omit' as const, cache: 'no-store' as const };
      const response = await fetcher(base + path, requestInit);
      let body: any;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok) throw new LicenseApiError(typeof body.error === 'string' ? body.error : 'request_failed', response.status);
      return body;
    } finally { clearTimeout(timeout); }
  }
  return {
    activate(key: string): Promise<Entitlement> {
      return serial(async () => {
        const s = await state();
        const response = await request('/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: opts.product, key, device: s.device }) });
        const entitlement = await verify(response.token ?? '', s.device);
        if (!entitlement.valid) throw new LicenseApiError(entitlement.reason ?? 'bad_signature', 502);
        await save({ device: s.device, key, token: response.token });
        return entitlement;
      });
    },
    getEntitlement(): Promise<Entitlement> {
      return serial(async () => {
        const s = await state();
        if (!s.token) return invalidEntitlement(s.denied ?? 'no_license');
        const entitlement = await verify(s.token, s.device);
        if (entitlement.refreshAfter === null || Math.floor(now() / 1000) < entitlement.refreshAfter || !s.key) return entitlement;
        try {
          const response = await request('/entitlement?product=' + encodeURIComponent(opts.product) + '&device=' + encodeURIComponent(s.device), { method: 'GET', headers: { Authorization: 'License ' + s.key } });
          const refreshed = await verify(response.token ?? '', s.device);
          if (!refreshed.valid) return verify(s.token, s.device);
          await save({ ...s, token: response.token, denied: undefined });
          return refreshed;
        } catch (error) {
          if (error instanceof LicenseApiError && (error.status === 403 || error.code === 'inactive' || error.code === 'revoked')) {
            const reason = error.code === 'revoked' ? 'revoked' : 'inactive';
            await save({ device: s.device, key: s.key, denied: reason });
            return invalidEntitlement(reason);
          }
          // Check time again: a slow refresh may cross the token's expiry.
          return verify(s.token, s.device);
        }
      });
    },
    deactivate(): Promise<void> {
      return serial(async () => {
        const s = await state();
        if (s.key) await request('/deactivate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: opts.product, key: s.key, device: s.device }) });
        await save({ device: s.device });
      });
    },
    async verifyToken(token: string): Promise<Entitlement> {
      const raw = await opts.storage.get(storageKey);
      try {
        const stored = JSON.parse(raw ?? 'null');
        if (!stored || typeof stored.device !== 'string') return invalidEntitlement('wrong_device');
        return verify(token, stored.device);
      } catch { return invalidEntitlement('wrong_device'); }
    },
  };
}
