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
  // Whole tokens, Dutch thousands separator, no decimals (the euro value sits next to it).
  await expect(balance).toHaveText(/^\d{1,3}(\.\d{3})* tok$/, { timeout: 30_000 });
  await expect(hud.locator('.balance .worth')).toHaveText(/^worth €\s[\d.]+,\d{2}$/);

  const spin = page.getByRole('button', { name: 'Spin' });
  await expect(spin).toBeEnabled();
  const answered = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/spin');
  await spin.click();
  // The server opened, decided and settled the round with the casino.
  const res = await answered;
  expect(res.status()).toBe(200);
  const settled = (await res.json()) as { state: { balance: { tokensMicro: number } } };
  // Answer any bonus prompts until the round has been shown in full.
  await expect(async () => {
    const choice = page.locator('.action-bar button').first();
    if (await choice.isVisible()) await choice.click();
    await expect(spin).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 100_000 });
  // Then the HUD shows the balance the casino confirmed for this round, whole tokens rounded down.
  // (A € 0,20 bet is a fraction of a token, so a winning spin may leave the figure as it was.)
  const whole = Math.floor(settled.state.balance.tokensMicro / 1_000_000).toLocaleString('nl-NL');
  await expect(balance).toHaveText(`${whole} tok`);

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
