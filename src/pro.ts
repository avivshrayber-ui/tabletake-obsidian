import { createLicenseClient, LicenseApiError, type Entitlement } from './license/client';
import type { LicenseStorage } from './license/storage';
import type TableTakePlugin from './main';
import { t } from './i18n';

export const LICENSE_CONFIG = {
  baseUrl: 'https://license.earthloomholdings.com', product: 'tabletake', plan: 'lifetime',
  issuer: 'earthloom-license', publicKeys: [{ kid: 'REPLACE_KID', x: 'REPLACE_X' }],
};
export const BUY_URL = 'https://earthloom-legal.pages.dev/apps/tabletake/';
export const activationIsLive = LICENSE_CONFIG.publicKeys.length > 0 &&
  LICENSE_CONFIG.publicKeys.every(key => !key.kid.includes('REPLACE_') && !key.x.includes('REPLACE_'));
export function licenseError(err: unknown): string {
  const code = err instanceof LicenseApiError ? err.code : err instanceof Error ? err.message : '';
  if (/device.*limit|too_many_devices|activation_limit/i.test(code)) return t('deviceLimit');
  if (/inactive|revoked|expired/i.test(code)) return t('inactive');
  if (/invalid|not_found|bad_signature|wrong_|key/i.test(code)) return t('invalidKey');
  return t('network');
}
export function pluginStorage(plugin: TableTakePlugin): LicenseStorage {
  return {
    async get(key) { return plugin.data.license[key] ?? null; },
    async set(key, value) { plugin.data.license[key] = value; await plugin.saveSettings(); },
    async remove(key) { delete plugin.data.license[key]; await plugin.saveSettings(); },
  };
}
export class ProManager {
  private client;
  private entitlement: Entitlement | null = null;
  private dev = false;
  error = '';
  constructor(private plugin: TableTakePlugin) {
    this.client = createLicenseClient({ ...LICENSE_CONFIG, storage: pluginStorage(plugin) });
  }
  isPro(): boolean {
    return this.dev || !!(this.entitlement?.valid && this.entitlement.plan === LICENSE_CONFIG.plan &&
      this.entitlement.expiresAt !== null && Date.now() / 1000 < this.entitlement.expiresAt + 300);
  }
  async load(): Promise<void> {
    this.dev = await this.plugin.app.vault.adapter.exists('.tabletake-dev-pro').catch(() => false);
    // Verify the saved token locally before starting any background refresh.
    const storageKey = 'license-kit:' + LICENSE_CONFIG.baseUrl + ':' + LICENSE_CONFIG.product;
    try {
      let state = JSON.parse(this.plugin.data.license[storageKey] ?? 'null');
      if (!state || typeof state.device !== 'string' || !state.device) {
        state = { device: crypto.randomUUID() };
        await pluginStorage(this.plugin).set(storageKey, JSON.stringify(state));
      }
      if (state?.token) this.entitlement = await this.client.verifyToken(state.token);
    } catch { /* Invalid local records cannot unlock Pro. */ }
    if (activationIsLive) void this.client.getEntitlement().then(value => {
      this.entitlement = value;
      if (!value.valid && value.reason !== 'no_license') this.error = licenseError(new Error(value.reason));
    }).catch(err => { this.error = licenseError(err); });
  }
  async activate(key: string): Promise<void> {
    if (!activationIsLive) { this.error = t('soon'); return; }
    try {
      this.entitlement = await this.client.activate(key.trim());
      this.plugin.settings.licenseKey = key.trim();
      await this.plugin.saveSettings();
      this.error = '';
    } catch (err) { this.error = licenseError(err); }
  }
  async deactivate(): Promise<void> {
    try {
      await this.client.deactivate();
      this.entitlement = null;
      this.plugin.settings.licenseKey = '';
      await this.plugin.saveSettings();
      this.error = '';
    } catch (err) { this.error = licenseError(err); }
  }
}

