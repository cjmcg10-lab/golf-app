import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const course = JSON.parse(
  readFileSync(resolve(__dirname, '../../../courses/southington-cc/course.json'), 'utf8'),
);
const hole1 = course.holes[0];

test('homeShowsCourse', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Southington Country Club').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^Hole \d+$/ })).toHaveCount(18);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('holeOneLoads', async ({ page }) => {
  await page.goto('/hole/1');
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Par 4 · 385 yds \(Blue\) · HCP 7$/)).toBeVisible();
});

test('geolocationMocked', async ({ browser }) => {
  const ctx = await browser.newContext({
    geolocation: { longitude: hole1.playLine[0][0], latitude: hole1.playLine[0][1], accuracy: 5 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.goto('/hole/1');
  const center = Number(await page.getByLabel('Center of green').textContent());
  expect(Math.abs(center - hole1.measuredYards)).toBeLessThanOrEqual(5);
  await ctx.close();
});

test('locationDeniedFallsBackToTee', async ({ page }) => {
  await page.goto('/hole/1');
  await expect(page.getByText(/distances are from the tee/)).toBeVisible();
  await expect(page.getByLabel('Center of green')).not.toHaveText('—');
});

test('infoCallLink', async ({ page }) => {
  await page.goto('/info');
  await expect(
    page.getByRole('button', { name: 'Call Back Nine Tavern (restaurant & bar)' }),
  ).toBeVisible();
  await expect(page.getByText('(860) 628-7032')).toBeVisible();
});

test('offlineAfterDownload', async ({ page, context }) => {
  await page.goto('/info');
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
    .catch(async () => {
      await page.reload(); // first load installs the worker; reload puts the page under its control
    });
  await page.getByRole('button', { name: 'Download course for offline' }).click();
  await expect(page.getByText('✓ Course saved for offline use')).toBeVisible({ timeout: 45_000 });
  await page.goto('/hole/1'); // visit once online so the app shell for this route is cached
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Par 4 · 385 yds/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
});
