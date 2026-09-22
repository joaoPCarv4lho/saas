import { test, expect } from '@playwright/test';

test('kitchen marks an order ready', async ({ page, request }) => {
  const seedRes = await request.get('/api/test/seed');
  const { restaurantId, staffId } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.goto('/comandas');
  await page.getByPlaceholder('Mesa').fill('3');
  await page.getByRole('button', { name: 'Nova comanda' }).click();

  await page.goto('/kitchen');
  await expect(page.getByText(/3 — open/)).toBeVisible();
  await page.getByRole('button', { name: 'Marcar pronto' }).click();
  await expect(page.getByText(/3 — ready/)).toBeVisible();
});
