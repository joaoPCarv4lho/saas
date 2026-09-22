import { test, expect } from '@playwright/test';

test('order flow survives going offline mid-comanda and syncs on reconnect', async ({ page, context, request }) => {
  const seedRes = await request.get('/api/test/seed');
  const { restaurantId, staffId, menuItemName } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.goto('/comandas');
  await page.getByPlaceholder('Mesa').fill('9');
  await page.getByRole('button', { name: 'Nova comanda' }).click();
  await page.waitForURL(/\/comandas\/.+/);
  const url = page.url();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    (pathname) => (window as unknown as { __appShellWarmed?: string }).__appShellWarmed === pathname,
    new URL(url).pathname,
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Comanda —/ })).toBeVisible();

  await context.setOffline(false);
  await page.goto(url);
  await page.getByRole('button', { name: new RegExp(menuItemName) }).click();
  await expect(page.getByText(/1x/)).toBeVisible();
});
