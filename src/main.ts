import { Notice, Plugin, type Editor } from 'obsidian';
import { applyTier, expand, parseClipboard, parseHtmlTable, parseMarkdownTable, toMarkdown } from './core';
import { readClipboard } from './clipboard';
import { padTable, tableRange } from './editor-utils';
import { PreviewModal } from './preview';
import { ProManager } from './pro';
import { DEFAULT_SETTINGS, TableTakeSettingTab, type TableTakeSettings } from './settings';
import { t } from './i18n';

export default class TableTakePlugin extends Plugin {
  settings: TableTakeSettings = { ...DEFAULT_SETTINGS };
  data: Record<string, unknown> & { license: Record<string, string> } = { license: {} };
  pro!: ProManager;
  private saves: Promise<void> = Promise.resolve();
  async onload(): Promise<void> {
    await this.loadSettings();
    this.pro = new ProManager(this); await this.pro.load();
    this.addSettingTab(new TableTakeSettingTab(this));
    this.registerEvent(this.app.workspace.on('editor-paste', (evt, editor) => {
      if (!this.settings.autoConvert || evt.defaultPrevented) return;
      const html = evt.clipboardData?.getData('text/html') || null;
      const text = evt.clipboardData?.getData('text/plain') || null;
      if (!parseHtmlTable(html ?? '') && !text?.includes('\t')) return;
      const grid = parseClipboard(html, text);
      if (!grid) return;
      const cells = expand(grid);
      if (cells.length < 2 || (cells[0]?.length ?? 0) < 2) return;
      const md = toMarkdown(grid, applyTier(this.settings, this.pro.isPro()));
      evt.preventDefault(); this.insert(editor, md);
      if (this.settings.pasteNoticeCount < 3) {
        this.settings.pasteNoticeCount++; new Notice(t('pasted'));
        void this.saveSettings().catch(() => new Notice(t('saveError')));
      }
    }));
    this.addCommand({ id: 'paste-table', name: t('paste'), editorCallback: editor => { void this.paste(editor, false); } });
    this.addCommand({ id: 'paste-table-preview', name: t('previewCommand'), editorCallback: editor => { void this.paste(editor, true); } });
    this.addCommand({ id: 'reformat-table', name: t('reformat'), editorCallback: editor => {
      if (!this.pro.isPro()) { new Notice(t('proRequired')); return; }
      const range = tableRange(editor.getValue().split('\n'), editor.getCursor().line);
      const grid = range && parseMarkdownTable(editor.getRange(range.from, range.to));
      if (!grid || !range) { new Notice(t('noTable')); return; }
      editor.replaceRange(toMarkdown(grid, applyTier(this.settings, this.pro.isPro())), range.from, range.to);
    } });
    this.addCommand({ id: 'selection-to-table', name: t('selection'), editorCallback: editor => {
      const grid = parseClipboard(null, editor.getSelection());
      if (!grid) { new Notice(t('noTable')); return; }
      this.insert(editor, toMarkdown(grid, applyTier(this.settings, this.pro.isPro())));
    } });
  }
  private async paste(editor: Editor, preview: boolean): Promise<void> {
    const { html, text } = await readClipboard();
    const grid = parseClipboard(html, text);
    if (!grid) { new Notice(t('noTable')); return; }
    if (preview) new PreviewModal(this, grid, md => this.insert(editor, md)).open();
    else this.insert(editor, toMarkdown(grid, applyTier(this.settings, this.pro.isPro())));
  }
  private insert(editor: Editor, markdown: string): void {
    const from = editor.getCursor('from'), to = editor.getCursor('to');
    const document = editor.getValue();
    editor.replaceSelection(padTable(markdown, document.slice(0, editor.posToOffset(from)), document.slice(editor.posToOffset(to))));
  }
  async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    const record = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded as Record<string, unknown> : {};
    const license: Record<string, string> = {};
    if (record.license && typeof record.license === 'object') {
      for (const [key, value] of Object.entries(record.license)) if (typeof value === 'string') license[key] = value;
    }
    this.data = { ...record, license };
    this.settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof TableTakeSettings)[]) {
      if (typeof record[key] === typeof DEFAULT_SETTINGS[key]) Object.assign(this.settings, { [key]: record[key] });
    }
    const choices = { merge: ['repeat', 'blank', 'sheets', 'html'], dates: ['keep', 'iso', 'custom'], dateOrder: ['auto', 'DMY', 'MDY', 'YMD'], headerRow: ['auto', 'first', 'none'] };
    for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
      if (!choices[key].includes(this.settings[key])) Object.assign(this.settings, { [key]: DEFAULT_SETTINGS[key] });
    }
    this.settings.pasteNoticeCount = Number.isFinite(this.settings.pasteNoticeCount) ? Math.max(0, Math.floor(this.settings.pasteNoticeCount)) : 0;
  }
  saveSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify({ ...this.data, ...this.settings }));
    const run = this.saves.then(() => this.saveData(snapshot));
    this.saves = run.catch(() => {}); return run;
  }
  openSettings(): void {
    const app = this.app as typeof this.app & { setting?: { open(): void; openTabById(id: string): void } };
    app.setting?.open(); app.setting?.openTabById(this.manifest.id);
  }
}
