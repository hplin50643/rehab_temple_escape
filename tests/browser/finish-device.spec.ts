import { expect, test } from '@playwright/test';
import { mockBle } from './ble-mock';

test.use({ viewport: { width: 420, height: 360 }, reducedMotion: 'reduce' });

test('the full 2 km hardware run renews its lease and shuts down exactly once at the finish', async ({ page }, info) => {
  test.setTimeout(480_000);
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await mockBle(page);
  await page.goto('./');
  await page.locator('#connect').click();
  await expect(page.locator('#begin')).toBeVisible();
  await page.evaluate(() => window.bleMock.setRpm(96));
  await page.locator('#begin').click();
  await expect(page.locator('#rpm')).toHaveText('96');
  const pauseClockAt = await page.evaluate(() => Date.now() + 500);
  await page.clock.pauseAt(new Date(pauseClockAt));

  // 96 RPM is 48 game km/h. Draw the game's normal frames while the
  // independent BLE mock sends fresh speed and enforces a 30-second lease.
  for (let batch = 0; batch < 40 && await page.locator('#results').isHidden(); batch++) {
    for (let frame = 0; frame < 10; frame++) await page.clock.fastForward(500);
  }
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#distance')).toHaveText('2000');
  await expect(page.locator('#session-title')).toHaveText('成功逃出神廟');
  await page.clock.fastForward(25);
  await page.clock.fastForward(25);
  const writes = await page.evaluate(() => window.bleMock.writes);
  expect(writes.filter(w => w.cmd !== 'heartbeat').map(w => w.cmd)).toEqual(['get_state', 'claim', 'start', 'stop', 'release']);
  const heartbeats = writes.filter(w => w.cmd === 'heartbeat');
  const start = writes.find(w => w.cmd === 'start')!;
  const stop = writes.find(w => w.cmd === 'stop')!;
  const rideMs = stop.at - start.at;
  expect(rideMs).toBeGreaterThanOrEqual(145_000);
  expect(heartbeats.length).toBeGreaterThanOrEqual(14);
  // Once the game is running, each renewal must arrive well before expiry.
  const events = [start, ...heartbeats, stop];
  const gaps = events.slice(1).map((w, index) => w.at - events[index].at);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(11_000);
  expect(await page.evaluate(() => window.bleMock.status())).toEqual({ controlled: false, running: false });

  // Leave the results open past the length of a complete lease.
  await page.clock.fastForward(45_000);
  await expect(page.locator('#results')).toBeVisible();
  expect(await page.evaluate(() => window.bleMock.writes)).toEqual(writes);
  expect(await page.evaluate(() => window.bleMock.status())).toEqual({ controlled: false, running: false });
  await info.attach('hardware-finish.json', { contentType: 'application/json',
    body: JSON.stringify({ rideMs, heartbeats: heartbeats.length, longestRenewalGapMs: Math.max(...gaps), writes }, null, 2) });
});
