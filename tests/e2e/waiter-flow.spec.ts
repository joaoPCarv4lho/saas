import { test, expect } from '@playwright/test';

test('waiter creates a comanda and adds an item', async ({ page, request }) => {
  const seedRes = await request.get('/api/test/seed'); // seeds a fresh restaurant/staff/menu item for test isolation
  const { restaurantId, staffId, menuItemName } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/comandas/);

  await page.getByPlaceholder('Mesa').fill('7');
  await page.getByRole('button', { name: 'Nova comanda' }).click();
  await expect(page.getByRole('heading', { name: /Comanda/ })).toBeVisible();

  await page.getByRole('button', { name: new RegExp(menuItemName) }).click();
  await expect(page.getByText(new RegExp(`1x`))).toBeVisible();
});
