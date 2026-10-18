import { expect, test } from '@playwright/test';
import { CASINO_PORT } from '../playwright.config';

test('health answers with the running version', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true, status: 'open' });
});

test('the page loads, spins once and settles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The Content-Security-Policy must not block anything the page needs.
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  const hud = page.getByRole('region', { name: 'Game controls' });
  const balance = hud.locator('.balance .value');
  // Tokens, four decimals, Dutch style (the euro value sits next to it).
  await expect(balance).toHaveText(/^[\d.]+,\d{4} tok$/, { timeout: 30_000 });
  await expect(hud.locator('.balance .worth')).toHaveText(/^worth €\s[\d.]+,\d{2}$/);
  const before = await balance.textContent();

  const spin = page.getByRole('button', { name: 'Spin' });
  await expect(spin).toBeEnabled();
  await spin.click();
  // The server took the bet: the balance moves straight away.
  await expect(balance).not.toHaveText(before ?? '', { timeout: 15_000 });
  // Answer any bonus prompts until the round has been shown in full.
  await expect(async () => {
    const choice = page.locator('.action-bar button').first();
    if (await choice.isVisible()) await choice.click();
    await expect(spin).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 100_000 });

  expect(errors).toEqual([]);
});

test('a visitor without a session is sent through the casino to sign in', async ({ page }) => {
  const toCasino = page.waitForRequest((req) => req.url() === 'http://127.0.0.1:9/play/lowrider');
  await page.goto(`http://127.0.0.1:${CASINO_PORT}/`).catch(() => undefined);
  await toCasino;
});

test('the page runs under a strict Content-Security-Policy', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
});

test('the page carries the casino bar loader the conformance check looks for', async ({ request }) => {
  const res = await request.get(`http://127.0.0.1:${CASINO_PORT}/`);
  const html = await res.text();
  expect(html).toContain('<script src="http://127.0.0.1:9/bar.js" data-game="lowrider"></script>');
  expect(html).not.toContain('/bar?game=');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("script-src 'self' http://127.0.0.1:9");
  expect(csp).toContain('frame-src http://127.0.0.1:9');
});
