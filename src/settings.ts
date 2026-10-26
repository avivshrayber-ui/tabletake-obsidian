import { PluginSettingTab, Setting, Notice } from 'obsidian';
import { DEFAULT_OPTIONS, type Options } from './core';
import type TableTakePlugin from './main';
import { BUY_URL } from './pro';
import { isRtl, t } from './i18n';
import type { Messages } from './i18n/en';
export interface TableTakeSettings extends Options { autoConvert: boolean; pasteNoticeCount: number; licenseKey: string }
export const DEFAULT_SETTINGS: TableTakeSettings = { ...DEFAULT_OPTIONS, autoConvert: true, pasteNoticeCount: 0, licenseKey: '' };

export function outputControls(container: HTMLElement, options: Options, pro: boolean, change: () => void, unlock: () => void): void {
  const row = (key: keyof Options, paid = false) => {
    const setting = new Setting(container).setName(t(key));
    if (paid && !pro) {
      setting.nameEl.createSpan({ cls: 'tabletake-pro-badge', text: t('pro') });
      const link = setting.descEl.createEl('a', { text: t('unlock'), href: '#' });
      link.addEventListener('click', event => { event.preventDefault(); unlock(); });
    }
    return setting;
  };
  function select<K extends keyof Options>(key: K, values: readonly string[], paid = false): void {
    row(key, paid).addDropdown(dropdown => {
      for (const value of values) dropdown.addOption(value, t(value as keyof Messages));
      dropdown.setValue(String(options[key])).setDisabled(paid && !pro).onChange(value => {
        options[key] = value as Options[K]; change();
      });
    });
  }
  select('merge', ['repeat', 'blank', 'sheets', 'html'], true);
  select('dates', ['keep', 'iso', 'custom'], true);
  row('dateFormat', true).addText(text => text.setValue(options.dateFormat).setDisabled(!pro).onChange(value => { options.dateFormat = value; change(); }));
  select('dateOrder', ['auto', 'DMY', 'MDY', 'YMD'], true);
  for (const key of ['keepAlign', 'autoNumberAlign', 'inline', 'pad', 'trimEmpty'] as const) {
    const paid = key === 'keepAlign' || key === 'inline';
    row(key, paid).addToggle(toggle => toggle.setValue(paid && !pro ? false : options[key]).setDisabled(paid && !pro).onChange(value => { options[key] = value; change(); }));
  }
  select('headerRow', ['auto', 'first', 'none']);
}
export class TableTakeSettingTab extends PluginSettingTab {
  constructor(private plugin: TableTakePlugin) { super(plugin.app, plugin); }
  display(): void {
    const { containerEl } = this;
    containerEl.empty(); containerEl.addClass('tabletake-settings'); containerEl.dir = isRtl() ? 'rtl' : 'ltr';
    containerEl.createEl('h2', { text: t('general') });
    const save = () => { void this.plugin.saveSettings().catch(() => new Notice(t('saveError'))); };
    new Setting(containerEl).setName(t('autoConvert')).addToggle(toggle => toggle.setValue(this.plugin.settings.autoConvert).onChange(value => { this.plugin.settings.autoConvert = value; save(); }));
    containerEl.createEl('h2', { text: t('output') });
    outputControls(containerEl, this.plugin.settings, this.plugin.pro.isPro(), save, () => licence.scrollIntoView());
    const licence = containerEl.createEl('h2', { text: t('licence') });
    containerEl.createEl('p', { text: this.plugin.pro.error ? t('error', { message: this.plugin.pro.error }) : t(this.plugin.pro.isPro() ? 'active' : 'free') });
    let key = this.plugin.settings.licenseKey;
    new Setting(containerEl).setName(t('key')).addText(text => {
      text.inputEl.type = 'password'; text.setValue(key).onChange(value => { key = value; });
    }).addButton(button => button.setButtonText(t('activate')).onClick(async () => {
      button.setDisabled(true); await this.plugin.pro.activate(key); this.display();
    }));
    if (this.plugin.pro.isPro()) new Setting(containerEl).addButton(button => button.setButtonText(t('deactivate')).onClick(async () => {
      button.setDisabled(true); await this.plugin.pro.deactivate(); this.display();
    }));
    new Setting(containerEl).addButton(button => button.setButtonText(t('buy')).onClick(() => { window.open(BUY_URL, '_blank', 'noopener'); }));
    containerEl.createEl('p', { text: t('disclosure') });
  }
}
