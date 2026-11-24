import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockBle } from './ble-mock';

test.use({ viewport: { width: 640, height: 640 }, reducedMotion: 'reduce' });
test.describe.configure({ timeout: 120_000 });
const patience = { timeout: 20_000 };

async function commands(page: Page) {
  return page.evaluate(() => window.bleMock.writes.map(item => item.cmd).filter(cmd => cmd !== 'heartbeat'));
}

async function expectCommands(page: Page, expected: string[]) {
  await expect.poll(() => commands(page), patience).toEqual(expected);
}

async function begin(page: Page, button = '#begin') {
  await page.locator(button).click();
  await expect(page.locator('#session-panel')).toBeHidden(patience);
}

test.beforeEach(async ({ page }) => {
  await mockBle(page);
  await page.goto('./');
  await page.locator('#connect').click();
  await expect(page.locator('#begin')).toBeVisible(patience);
  await expectCommands(page, ['get_state']);
});

test('pedalling controls the runner and each pause releases the machine before returning home', async ({ page }) => {
  await begin(page);
  await expectCommands(page, ['get_state', 'claim', 'start']);
  await page.evaluate(() => window.bleMock.setRpm(88));
  await expect(page.locator('#rpm')).toHaveText('88', patience);
  await expect.poll(async () => Number(await page.locator('#distance').textContent()), patience).toBeGreaterThan(0);
  await page.evaluate(() => window.bleMock.setRpm(0));
  await expect(page.locator('#rpm')).toHaveText('0', patience);
  const stoppedDistance = await page.locator('#distance').textContent();
  // Observe multiple game frames after the zero reading renders.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('#distance')).toHaveText(stoppedDistance!);
  await page.locator('#pause').click();
  await expect(page.locator('#begin')).toBeVisible(patience);
  await expectCommands(page, ['get_state', 'claim', 'start', 'stop', 'release']);
  await page.evaluate(() => window.bleMock.setRpm(60));
  await begin(page);
  await expect(page.locator('#rpm')).toHaveText('60', patience);
  await page.locator('#pause').click();
  await page.locator('#home-button').click();
  await expect(page.locator('#connect')).toBeVisible(patience);
  await expectCommands(page, ['get_state', 'claim', 'start', 'stop', 'release', 'claim', 'start', 'stop', 'release']);
});

test('restoring valid telemetry after a stale sample leaves the game paused until Resume', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#rpm')).toHaveText('60', patience);
  await page.evaluate(() => window.bleMock.stale());
  await expect(page.locator('#session-panel')).toBeVisible(patience);
  const stopped = ['get_state', 'claim', 'start', 'stop', 'release'];
  await expectCommands(page, stopped);
  await page.evaluate(() => window.bleMock.setRpm(72));
  await expect(page.locator('#begin')).toBeVisible();
  await expectCommands(page, stopped);
  await begin(page);
  await expect(page.locator('#rpm')).toHaveText('72', patience);
  await expectCommands(page, [...stopped, 'claim', 'start']);
});

test('reconnecting and launching another session both require an explicit new Start', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#rpm')).toHaveText('60', patience);
  await page.evaluate(() => window.bleMock.disconnect());
  await expect(page.locator('#reconnect')).toBeVisible(patience);
  await page.locator('#reconnect').click();
  const connectedAgain = ['get_state', 'claim', 'start', 'get_state'];
  await expect(page.locator('#begin')).toBeVisible(patience);
  await expectCommands(page, connectedAgain);
  await begin(page);
  await expectCommands(page, [...connectedAgain, 'claim', 'start']);
  await page.locator('#pause').click();
  await page.locator('#home-button').click();
  await page.locator('#connect').click();
  await expect(page.locator('#begin')).toBeVisible(patience);
  await expectCommands(page, [...connectedAgain, 'claim', 'start', 'stop', 'release', 'get_state']);
});

test('a connection lost on the ready screen immediately offers reconnect without taking control', async ({ page }) => {
  await page.evaluate(() => window.bleMock.disconnect());
  await expect(page.locator('#reconnect')).toBeVisible(patience);
  await expect(page.locator('#begin')).toBeHidden();
  await page.locator('#reconnect').click();
  await expect(page.locator('#begin')).toBeVisible(patience);
  await expectCommands(page, ['get_state', 'get_state']);
});

test('backgrounding stops a controlled run and reports when firmware never acknowledges Stop', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#rpm')).toHaveText('60', patience);
  await page.evaluate(() => {
    window.bleMock.dropStopReply();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#session-detail')).toContainText('背景', patience);
  await expect(page.locator('#session-detail')).toContainText('未確認停止指令', patience);
  await expect(page.locator('#reconnect')).toBeVisible(patience);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#begin')).toBeHidden();
  await expectCommands(page, ['get_state', 'claim', 'start', 'stop']);
});

test('busy hardware can be observed without stopping another controller’s session', async ({ page }) => {
  await page.evaluate(() => {
    window.bleMock.busy();
    window.bleMock.setRunning();
  });
  await page.locator('#begin').click();
  await expectCommands(page, ['get_state', 'claim']);
  await expect(page.locator('#readonly')).toBeVisible(patience);
  await begin(page, '#readonly');
  await expect(page.locator('#rpm')).toHaveText('60', patience);
  await page.locator('#pause').click();
  await page.locator('#home-button').click();
  await expect(page.locator('#connect')).toBeVisible(patience);
  const allWrites = await page.evaluate(() => window.bleMock.writes.map(item => item.cmd));
  expect(allWrites).toEqual(['get_state', 'claim']);
});
