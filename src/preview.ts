import { Component, MarkdownRenderer, Modal } from 'obsidian';
import { applyTier, toMarkdown, type Grid, type Options } from './core';
import type TableTakePlugin from './main';
import { outputControls } from './settings';
import { isRtl, t } from './i18n';
export class PreviewModal extends Modal {
  private options: Options;
  private renderComponent: Component | null = null;
  private revision = 0;
  private closed = false;
  constructor(private plugin: TableTakePlugin, private grid: Grid, private insert: (markdown: string) => void) {
    super(plugin.app); this.options = applyTier(plugin.settings, plugin.pro.isPro());
  }
  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass('tabletake-modal'); this.modalEl.dir = isRtl() ? 'rtl' : 'ltr';
    this.titleEl.setText(t('preview'));
    const columns = this.contentEl.createDiv({ cls: 'tabletake-columns' });
    const controls = columns.createDiv({ cls: 'tabletake-options' });
    const preview = columns.createDiv({ cls: 'tabletake-preview' });
    preview.createEl('h3', { text: t('source') });
    const source = preview.createEl('pre', { cls: 'tabletake-source' });
    preview.createEl('h3', { text: t('rendered') });
    const rendered = preview.createDiv();
    const update = async () => {
      const revision = ++this.revision;
      const md = this.markdown(); source.setText(md);
      this.renderComponent?.unload();
      const component = new Component(); component.load(); this.renderComponent = component;
      const stage = createDiv();
      try { await MarkdownRenderer.render(this.app, md, stage, '', component); }
      catch { stage.setText(t('renderError')); }
      if (!this.closed && revision === this.revision) { rendered.empty(); rendered.appendChild(stage); }
      else component.unload();
    };
    outputControls(controls, this.options, this.plugin.pro.isPro(), () => { void update(); }, () => { this.close(); this.plugin.openSettings(); });
    const actions = this.contentEl.createDiv({ cls: 'tabletake-actions' });
    actions.createEl('button', { text: t('cancel') }).addEventListener('click', () => this.close());
    actions.createEl('button', { text: t('insert'), cls: 'mod-cta' }).addEventListener('click', () => this.commit());
    this.scope.register([], 'Enter', event => {
      if (event.isComposing || (event.target instanceof HTMLElement && event.target.closest('button, a, select'))) return true;
      event.preventDefault(); this.commit(); return false;
    });
    void update();
  }
  private markdown(): string { return toMarkdown(this.grid, applyTier(this.options, this.plugin.pro.isPro())); }
  private commit(): void { if (this.closed) return; this.insert(this.markdown()); this.close(); }
  onClose(): void { this.closed = true; this.revision++; this.renderComponent?.unload(); this.contentEl.empty(); }
}
