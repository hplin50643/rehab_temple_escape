import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EscapeRun } from '../../src/game';

const desktop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };
const riding = { width: 480, height: 360 };

async function visibleSceneColors(page: Page, screenshot: Buffer, besidePanel: boolean) {
  return page.evaluate(async ({data, besidePanel}) => {
    const bytes = Uint8Array.from(atob(data), byte => byte.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = 28; canvas.height = 14;
    const context = canvas.getContext('2d')!;
    // Only sample the world between the top cue and the bottom controls.
    const left = besidePanel ? .03 : .15, width = besidePanel ? .25 : .7;
    context.drawImage(image, image.width*left, image.height*.44, image.width*width, image.height*.28, 0, 0, 28, 14);
    image.close();
    const pixels = context.getImageData(0,0,28,14).data, palette = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) {
      palette.add((pixels[i] >> 4) * 256 + (pixels[i+1] >> 4) * 16 + (pixels[i+2] >> 4));
    }
    return palette.size;
  }, {data: screenshot.toString('base64'), besidePanel});
}

async function waitForCanvasResize(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    const observer = new ResizeObserver(() => { observer.disconnect(); resolve(); });
    observer.observe(document.querySelector('#world canvas')!);
  }));
}

async function capture(page: Page, info: TestInfo, name: string, world = false) {
  const filename = name + '.png';
  const destination = process.env.UPDATE_GAME_IMAGES === '1'
    ? path.join(process.cwd(), 'docs', 'images', filename)
    : info.outputPath(filename);
  await mkdir(path.dirname(destination), { recursive: true });
  if (world) {
    // Chromium can deliver ResizeObserver after a synthetic animation frame.
    // Wait for the backing canvas to resize, then draw into its new buffer.
    await waitForCanvasResize(page);
  }
  let screenshot = await page.screenshot({ animations: 'disabled' });
  if (world) {
    let colors = await visibleSceneColors(page, screenshot, name === 'finish');
    for (let i = 0; colors < 12 && i < 4; i++) {
      await page.clock.fastForward(50);
      screenshot = await page.screenshot({ animations: 'disabled' });
      colors = await visibleSceneColors(page, screenshot, name === 'finish');
    }
    expect(colors, 'the screenshot should show the 3D world behind the HUD').toBeGreaterThanOrEqual(12);
  }
  await writeFile(destination, screenshot);
}

async function readDistance(page: Page) {
  return Number((await page.locator('#distance').innerText()).replace(/[^0-9.]/g, ''));
}

// Drive the real animation loop in controlled steps. fastForward presents one
// due animation frame per call. The game's own frame cap and render path apply.
async function rideTo(page: Page, target: number) {
  let meters = await readDistance(page);
  for (let frame = 0; meters < target && frame < 1500;) {
    const batch = Math.min(16, Math.max(1, Math.floor((target - meters) / 4.2)));
    for (let i = 0; i < batch; i++) await page.clock.fastForward(250);
    frame += batch;
    meters = await readDistance(page);
  }
  expect(meters).toBeGreaterThanOrEqual(target);
}

async function chapterImage(page: Page, info: TestInfo, name: string, title: string) {
  await expect(page.locator('#hud-name')).toHaveText(title);
  await page.setViewportSize(desktop);
  await page.clock.fastForward(32);
  await capture(page, info, name, true);
  await page.setViewportSize(riding);
  await page.clock.fastForward(32);
}

test('a rider can read the cues, clear all three chapters and collect all 77 relics', async ({ page }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:02:00Z'));
  await page.setViewportSize(desktop);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '遺跡疾行' })).toBeVisible();
  await capture(page, info, 'home');
  await page.setViewportSize(mobile);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, info, 'home-mobile');
  for (const [index, title] of ['苔石古道', '峽谷吊橋', '火炬神殿'].entries()) {
    await page.locator('[data-chapter="' + index + '"]').click({ force: true });
    await expect(page.locator('#dialog-title')).toHaveText(title);
    await page.locator('#dialog-close').click({ force: true });
  }
  await page.locator('#guide').click({ force: true });
  await expect(page.locator('#dialog-title')).toHaveText('玩法指南');
  await page.locator('#dialog-close').click({ force: true });
  await page.locator('#settings').click({ force: true });
  await page.locator('#quality').selectOption('high');
  await page.locator('#settings-form button[type=submit]').click({ force: true });
  await page.locator('#sound').click({ force: true });
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound').click({ force: true });
  if (await page.locator('#fullscreen').isVisible()) {
    await page.locator('#fullscreen').click({ force: true });
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-label', '離開全螢幕');
    await page.locator('#fullscreen').click({ force: true });
    await expect(page.locator('#fullscreen')).toHaveAttribute('aria-label', '進入全螢幕');
  }
  await page.clock.fastForward(6000);
  await page.setViewportSize(riding);
  await page.locator('#demo').click({ force: true });
  await expect(page.locator('#ride')).toBeVisible();
  const control = page.locator('#rpm-control');
  await control.fill('120');
  await rideTo(page, 16);
  await chapterImage(page, info, 'trail', '苔石古道');

  // These are the same gates drawn on the public course. Input always flows
  // through the visible cadence slider, including the exact slide threshold.
  const gates = new EscapeRun().obstacles;
  for (const [index, gate] of gates.entries()) {
    await rideTo(page, gate.distance - 55);
    await expect(page.locator('#cue')).toBeVisible();
    await expect(page.locator('#cue-title')).toHaveText(gate.kind === 'jump' ? '加快踩踏' : '放慢踩踏');
    if (index === 4) await chapterImage(page, info, 'bridge', '峽谷吊橋');
    await control.fill(gate.kind === 'slide' ? '51' : '120');
    if (index === 9) {
      await rideTo(page, gate.distance - 2);
      await chapterImage(page, info, 'sanctum', '火炬神殿');
    }
    if (index === 0) {
      await rideTo(page, gate.distance - 4);
      await page.setViewportSize(mobile);
      await page.clock.fastForward(32);
      await expect(page.locator('#pause')).toBeInViewport();
      await expect(control).toBeInViewport();
      await capture(page, info, 'ride-mobile', true);
      await page.setViewportSize(riding);
      await page.clock.fastForward(32);
    }
    await rideTo(page, gate.distance + 3);
    await control.fill('120');
  }
  await rideTo(page, 1960);
  await page.setViewportSize(desktop);
  await waitForCanvasResize(page);
  await rideTo(page, 1994);
  for (let i = 0; i < 20 && await page.locator('#results').isHidden(); i++) {
    await page.clock.fastForward(250);
  }
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#results span').filter({ hasText: '收集遺物' }).locator('b')).toHaveText('77 / 77');
  await capture(page, info, 'finish', true);
  await page.locator('#begin').click({ force: true });
  await expect(page.locator('#session-panel')).toBeHidden();
  await control.fill('0');
  await page.clock.fastForward(500);
  await expect(page.locator('#distance')).toHaveText('0');
  await expect(page.locator('#relics')).toHaveText('0');
  await page.locator('#pause').click({ force: true });
  await page.locator('#begin').click({ force: true });
  await control.fill('60');
  await rideTo(page, 3);
  await page.locator('#pause').click({ force: true });
  await page.locator('#home-button').click({ force: true });
  await expect(page.locator('#demo')).toBeVisible();
  expect(errors).toEqual([]);
});
