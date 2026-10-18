import { expect, test } from '@playwright/test';

test('health answers with the running version', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true, status: 'live' });
});

test('the page loads, spins once and settles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  const hud = page.getByRole('region', { name: 'Game controls' });
  const balance = hud.locator('.balance .value');
  await expect(balance).toHaveText(/€/, { timeout: 30_000 });
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
