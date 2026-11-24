import { describe, expect, it } from 'vitest';
import { COURSE_LENGTH, EscapeRun, MAX_SPEED, WARNING_DISTANCE } from '../src/game';

const step = 1/30;
function toDistance(run: EscapeRun, end: number, rpm: number) {
  const maxFrames = Math.ceil((end - run.distance) / (Math.min(60, 30*rpm/run.referenceRpm)/3.6) / step) + 3;
  for (let i = 0; i < maxFrames && run.distance < end; i++) run.update(step, rpm);
  expect(run.distance).toBeGreaterThanOrEqual(end);
}
function frozenState(run: EscapeRun) {
  return [run.distance, run.elapsed, run.score, run.combo, run.relicCount, run.threat, run.action, run.actionProgress];
}

describe('two-kilometer escape', () => {
  it('maps the player’s chosen cadence to speed and clamps the upper bound', () => {
    const run = new EscapeRun(80);
    expect(run.phase).toBe('home');
    run.start();
    run.update(.1, 80);
    expect(run.speed).toBe(30);
    run.update(.1, 40);
    expect(run.speed).toBe(15);
    run.update(.1, 1000);
    expect(run.speed).toBe(MAX_SPEED);
    expect(run.distance).toBeCloseTo((30+15+60)/3.6 * .1);
  });

  it('provides at least four seconds of visible warning at full speed for every gate', () => {
    const run = new EscapeRun();
    let previous = 0;
    for (const gate of run.obstacles) {
      const visibleMeters = Math.min(WARNING_DISTANCE, gate.distance - previous);
      expect(visibleMeters / (MAX_SPEED/3.6)).toBeGreaterThanOrEqual(4);
      previous = gate.distance;
    }
    expect(COURSE_LENGTH - previous).toBeGreaterThan(0);
  });

  it('automatically jumps and slides at the exact reference thresholds, including a custom cadence', () => {
    const run = new EscapeRun(80);
    run.start();
    const first = run.obstacles[0], second = run.obstacles[1];
    toDistance(run, first.distance - 1, 80);
    expect(run.action).toBe('jump');
    expect(first.resolved).toBe(false);
    const midair = frozenState(run);
    for (const sample of [0, null, -1, NaN, Infinity]) {
      run.update(.2, sample);
      expect(run.speed).toBe(0);
      expect(frozenState(run)).toEqual(midair);
    }
    toDistance(run, first.distance + 1, 80);
    expect(run.combo).toBe(1);
    toDistance(run, second.distance - 1, 68);
    expect(run.action).toBe('slide');
    toDistance(run, second.distance + 1, 68);
    expect(run.combo).toBe(2);
    expect(run.mistakes).toBe(0);
  });

  it('stumbles on a mismatched speed, clears the combo and lets the player recover', () => {
    const run = new EscapeRun();
    run.start();
    const [first, second, third] = run.obstacles;
    toDistance(run, first.distance + 1, 60);
    expect(run.combo).toBe(1);
    toDistance(run, second.distance + .1, 52);
    expect(run.action).toBe('stumble');
    expect(run.threat).toBeGreaterThan(.6);
    expect([run.combo, run.maxCombo, run.mistakes]).toEqual([0, 1, 1]);
    const atMiss = frozenState(run);
    run.update(.25, 0);
    expect(frozenState(run)).toEqual(atMiss);
    toDistance(run, third.distance + 1, 60);
    expect(run.combo).toBe(1);
    expect(run.phase).toBe('running');
    expect(run.threat).toBeLessThan(.6);
    const earned = run.relics.filter(relic => relic.rewardGate === first.distance);
    const dropped = run.relics.filter(relic => relic.rewardGate === second.distance);
    expect(earned).toHaveLength(2);
    expect(earned.every(relic => relic.collected && !relic.missed)).toBe(true);
    expect(dropped).toHaveLength(2);
    expect(dropped.every(relic => relic.missed && !relic.collected)).toBe(true);
    expect(run.relicCount).toBe(run.relics.filter(relic => relic.distance < run.distance).length - 2);
  });

  it('freezes on pause, continues after resume, changes chapters and completes exactly once', () => {
    const run = new EscapeRun();
    run.start();
    toDistance(run, 80, 120);
    expect(run.relicCount).toBeGreaterThan(0);
    run.pause();
    const before = frozenState(run);
    run.update(.2, 120);
    expect(frozenState(run)).toEqual(before);
    expect(run.speed).toBe(0);
    run.start();
    toDistance(run, 596, 120);
    expect(run.chapter).toBe(0);
    toDistance(run, 600, 120);
    expect(run.chapter).toBe(1);
    toDistance(run, 1300, 120);
    expect(run.chapter).toBe(2);
    toDistance(run, COURSE_LENGTH, 120);
    expect(run.phase).toBe('complete');
    expect(run.distance).toBe(COURSE_LENGTH);
    expect(run.speed).toBe(0);
    expect(run.nextObstacle).toBeNull();
    expect(run.relicCount).toBe(run.relics.length - run.mistakes * 2);
    expect(run.obstacles.every(obstacle => obstacle.resolved)).toBe(true);
    const result = frozenState(run);
    run.start();
    run.update(.2, 120);
    expect(frozenState(run)).toEqual(result);
    run.reset();
    expect([run.phase, run.distance, run.elapsed, run.score, run.relicCount, run.mistakes]).toEqual(['ready', 0, 0, 0, 0, 0]);
    expect(run.obstacles.some(obstacle => obstacle.resolved)).toBe(false);
    expect(run.relics.some(relic => relic.collected)).toBe(false);
  });

  it('awards all 77 relics when every obstacle is cleared', () => {
    const run = new EscapeRun();
    run.start();
    for (const gate of run.obstacles) {
      toDistance(run, gate.distance + 2, gate.kind === 'jump' ? 80 : 48);
    }
    toDistance(run, COURSE_LENGTH, 120);
    expect(run.mistakes).toBe(0);
    expect(run.maxCombo).toBe(run.obstacles.length);
    expect(run.relicCount).toBe(77);
    expect(run.relics.every(relic => relic.collected && !relic.missed)).toBe(true);
  });
});
