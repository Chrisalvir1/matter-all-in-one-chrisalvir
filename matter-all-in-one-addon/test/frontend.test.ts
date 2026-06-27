import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const frontendPath = new URL('../src/frontend/', import.meta.url);

describe('frontend accessibility contract', () => {
  it('keeps inactive dialogs out of the accessibility tree', async () => {
    const html = await readFile(new URL('index.html', frontendPath), 'utf8');
    expect(html).toMatch(/id="device-modal"[^>]*hidden/);
    expect(html).toMatch(/id="settings-modal"[^>]*hidden/);
    expect(html).toMatch(/id="confirm-modal"[^>]*hidden/);
  });

  it('synchronizes modal visibility with its hidden state', async () => {
    const script = await readFile(new URL('script.js', frontendPath), 'utf8');
    const stylesheet = await readFile(new URL('style.css', frontendPath), 'utf8');
    expect(script).toContain('modal.hidden = !open;');
    expect(stylesheet).toContain('.modal-backdrop[hidden] { display: none; }');
  });
});
