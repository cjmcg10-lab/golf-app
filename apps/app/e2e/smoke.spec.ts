import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const course = JSON.parse(
  readFileSync(resolve(__dirname, '../../../courses/southington-cc/course.json'), 'utf8'),
);
const hole1 = course.holes[0];

test('launchListsAndSearchesCourses', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Choose your course')).toBeVisible();
  await expect(page.getByTestId('golf-ball')).toBeVisible();
  const card = page.getByRole('link', { name: 'Southington Country Club' });
  await expect(card).toBeVisible();
  await page.getByLabel('Search courses').fill('pebble');
  await expect(card).toHaveCount(0);
  await expect(page.getByText(/No courses match/)).toBeVisible();
  await page.getByLabel('Search courses').fill('plantsville');
  await expect(card).toBeVisible();
});

test('overviewToFirstHole', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Southington Country Club' }).click();
  await page.getByRole('button', { name: 'Play here' }).click();
  await page.getByRole('radio', { name: 'White tees' }).click();
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Par 4 · 377 yds \(White\) · HCP 7$/)).toBeVisible();
  await expect(page.getByLabel('Plays like')).toHaveText(/^\d+ yds$/, { timeout: 45_000 });
  await expect(page.getByTestId('course-3d').locator('canvas')).toHaveCount(1);
});

test('weatherCanBeTurnedOff', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Account for weather').click();
  await page.goto('/hole/1');
  await expect(page.getByText('WEATHER', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('WIND', { exact: true })).toHaveCount(0);
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
  const green = page.getByLabel('Center of green');
  await expect(green).toBeVisible({ timeout: 45_000 });
  const center = Number(await green.textContent());
  expect(Math.abs(center - hole1.measuredYards)).toBeLessThanOrEqual(5);
  await ctx.close();
});

test('locationDeniedFallsBackToTee', async ({ page }) => {
  await page.goto('/hole/1');
  await expect(page.getByText(/distances are from the tee/)).toBeVisible();
  await expect(page.getByLabel('Center of green')).toHaveText(/^\d+$/, { timeout: 45_000 });
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
  // the 3D assets (elevation, ground fields) came from the download: stats need them
  await expect(page.getByLabel('Plays like')).toHaveText(/^\d+ yds$/, { timeout: 45_000 });
});

async function downloadCourse(page: import('@playwright/test').Page) {
  await page.goto('/info');
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
    .catch(() => page.reload());
  await page.getByRole('button', { name: 'Download course for offline' }).click();
  await expect(page.getByText('✓ Course saved for offline use')).toBeVisible({ timeout: 45_000 });
}

test('offlineRouteNeverVisited', async ({ page, context }) => {
  await downloadCourse(page);
  await context.setOffline(true);
  await page.goto('/hole/3');
  await expect(page.getByText('Hole 3', { exact: true })).toBeVisible();
});

test('stalledNetworkUsesDownloadedCourse', async ({ page, context }) => {
  await downloadCourse(page);
  await context.route('**/courses/southington-cc/course.json', () => {}); // never answers
  await page.goto('/hole/1');
  await expect(page.getByText('Hole 1', { exact: true })).toBeVisible({ timeout: 8_000 });
});

test('tapSetsLandingSpot', async ({ page }) => {
  await page.goto('/hole/12');
  await expect(page.getByText('TO PIN')).toBeVisible({ timeout: 45_000 });
  const box = (await page.getByTestId('course-3d').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
  await expect(page.getByText('TO TARGET')).toBeVisible();
  await page.getByRole('button', { name: 'Aim at pin' }).click();
  await expect(page.getByText('TO PIN')).toBeVisible();
});

test('offCourseGpsStillShowsStatsFromTee', async ({ browser }) => {
  const ctx = await browser.newContext({
    geolocation: { longitude: -72.5, latitude: 41.8, accuracy: 5 }, // ~20 miles away
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.goto('/hole/1');
  await expect(page.getByText('You’re not on the course')).toBeVisible();
  await expect(page.getByLabel('Plays like')).toHaveText(/^\d+ yds$/, { timeout: 45_000 });
  await ctx.close();
});

test('nextHoleStartsFresh', async ({ page }) => {
  await page.goto('/hole/1');
  await expect(page.getByText('TO PIN')).toBeVisible({ timeout: 45_000 });
  const box = (await page.getByTestId('course-3d').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.35);
  await expect(page.getByText('TO TARGET')).toBeVisible();
  await page.getByRole('button', { name: 'Next hole' }).click();
  await expect(page.getByText('Hole 2', { exact: true })).toBeVisible();
  await expect(page.getByText('TO PIN')).toBeVisible();
});

test('twoDKeepsOneCanvas', async ({ page }) => {
  await page.goto('/hole/1');
  await expect(page.getByLabel('Plays like')).toHaveText(/^\d+ yds$/, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Show 2D map' }).click();
  await expect(page.getByRole('button', { name: 'Show 3D course' })).toBeVisible();
  await expect(page.getByTestId('course-3d').locator('canvas')).toHaveCount(1);
});
