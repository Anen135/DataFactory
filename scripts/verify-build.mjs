import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Serve only the built artifact under a repository-style subpath.
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/algofactory/')) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(pathname.slice('/algofactory/'.length)) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => requests.push(request.url()));
  const response = await page.goto(`${origin}/algofactory/`);
  assert.equal(response.status(), 200);
  await page.locator('#game canvas').waitFor({ state: 'visible' });
  await page.locator('[data-machine="source"]').click();
  await page.waitForFunction(() => document.querySelector('#graph-count')?.textContent?.includes('1 nodes'));
  await page.reload();
  await page.locator('#game canvas').waitFor({ state: 'visible' });
  assert.match(await page.locator('#graph-count').textContent(), /1 nodes/);
  assert(requests.every(url => url.startsWith(origin)), 'Production page unexpectedly needs an external resource');
  assert.deepEqual(errors, []);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/production-subpath.png' });
  console.log('PASS: dist served under /algofactory/, Phaser canvas, editor, reload persistence, no external resources or browser errors.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
