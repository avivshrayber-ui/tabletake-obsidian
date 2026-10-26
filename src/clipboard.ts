export async function readClipboard(): Promise<{ html: string | null; text: string | null }> {
  let html: string | null = null, text: string | null = null;
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
    }
  } catch { /* Permissions and platform support vary. */ }
  if (!text) { try { text = await navigator.clipboard.readText(); } catch { /* Unavailable. */ } }
  if (!html) {
    try {
      const desktop = window as Window & { require?: (name: string) => { clipboard?: { readHTML(): string } } };
      html = desktop.require?.('electron')?.clipboard?.readHTML() || null;
    } catch { /* Mobile and sandboxed desktop have no Electron bridge. */ }
  }
  return { html, text };
}
