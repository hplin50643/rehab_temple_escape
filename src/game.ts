export const COURSE_LENGTH = 2_000;
export const MAX_SPEED = 60;
export const WARNING_DISTANCE = 80;
export const JUMP_RATIO = 1;
export const SLIDE_RATIO = 0.85;

export type ObstacleKind = 'jump' | 'slide';
export type RunnerAction = 'run' | ObstacleKind | 'stumble';
export type RunPhase = 'home' | 'ready' | 'running' | 'paused' | 'complete';
export interface Obstacle { distance: number; kind: ObstacleKind; resolved: boolean }
export interface Relic { distance: number; collected: boolean; rewardGate?: number; missed?: boolean }

// Each approach has at least 80 clear meters, even across chapter transitions.
const GATES: [number, ObstacleKind][] = [
  [92, 'jump'], [230, 'slide'], [388, 'jump'], [528, 'slide'],
  [682, 'jump'], [838, 'jump'], [974, 'slide'], [1122, 'jump'], [1236, 'slide'],
  [1380, 'slide'], [1518, 'jump'], [1644, 'slide'], [1770, 'jump'], [1904, 'slide'],
];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function placeRelics(): Relic[] {
  const create = (distance: number): Relic => ({ distance, collected: false });
  const relics = [19, 25, 31].map(create);
  for (const [distance] of GATES) {
    relics.push(...[-32, -26, -20].map(offset => create(distance + offset)));
    for (const offset of [19, 25]) relics.push({ ...create(distance + offset), rewardGate: distance });
  }
  relics.push(...[1956, 1962, 1968, 1974].map(create));
  return relics;
}

export class EscapeRun {
  phase: RunPhase = 'home';
  distance = 0;
  speed = 0;
  elapsed = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  mistakes = 0;
  relicCount = 0;
  threat = 0.18;
  action: RunnerAction = 'run';
  actionProgress = 0;
  obstacles: Obstacle[] = [];
  relics: Relic[] = [];
  private obstacleIndex = 0;
  private relicIndex = 0;
  private actionGate: Obstacle | null = null;
  private launchDistance = 0;
  private bonus = 0;

  constructor(public referenceRpm = 60) {
    this.reset();
    this.phase = 'home';
  }

  reset() {
    this.phase = 'ready';
    this.distance = this.speed = this.elapsed = this.score = 0;
    this.combo = this.maxCombo = this.mistakes = this.relicCount = 0;
    this.threat = 0.18;
    this.action = 'run';
    this.actionProgress = this.launchDistance = this.bonus = 0;
    this.obstacleIndex = this.relicIndex = 0;
    this.actionGate = null;
    this.obstacles = GATES.map(([distance, kind]) => ({ distance, kind, resolved: false }));
    this.relics = placeRelics();
  }

  start() {
    if (this.phase !== 'complete') this.phase = 'running';
  }

  pause() {
    if (this.phase === 'running') this.phase = 'paused';
    this.speed = 0;
  }

  get chapter() { return this.distance < 600 ? 0 : this.distance < 1300 ? 1 : 2; }
  get nextObstacle(): Obstacle | null { return this.obstacles[this.obstacleIndex] ?? null; }

  update(dt: number, rpm: number | null) {
    if (this.phase !== 'running' || rpm === null || !Number.isFinite(rpm) || rpm <= 0) {
      this.speed = 0;
      return;
    }
    if (!Number.isFinite(dt) || dt <= 0) return;
    // A delayed animation frame cannot advance the player through an entire gate.
    const frame = Math.min(dt, 0.25);
    const reference = Number.isFinite(this.referenceRpm) && this.referenceRpm > 0 ? this.referenceRpm : 60;
    const ratio = rpm / reference;
    this.speed = Math.min(MAX_SPEED, ratio * 30);
    const previous = this.distance;
    this.distance = Math.min(COURSE_LENGTH, previous + this.speed / 3.6 * frame);
    const traveled = this.distance - previous;
    this.elapsed += traveled / (this.speed / 3.6);
    this.threat = Math.max(0.18, this.threat - traveled * 0.003);
    this.advanceAction(frame, ratio, previous);
    while (this.relicIndex < this.relics.length && this.relics[this.relicIndex].distance <= this.distance) {
      const relic = this.relics[this.relicIndex++];
      if (!relic.missed) {
        relic.collected = true;
        this.relicCount++;
        this.bonus += 20;
      }
    }
    this.score = Math.floor(this.distance + this.bonus);
    if (this.distance === COURSE_LENGTH) {
      this.phase = 'complete';
      this.action = 'run';
      this.actionProgress = this.speed = 0;
    }
  }

  private advanceAction(dt: number, ratio: number, previous: number) {
    if (this.action !== 'run' && !this.actionGate) {
      this.actionProgress = Math.min(1, this.actionProgress + dt / (this.action === 'stumble' ? 1.1 : 0.9));
      if (this.actionProgress >= 1) {
        this.action = 'run';
        this.actionProgress = 0;
      }
    }
    const gate = this.nextObstacle;
    if (!gate) return;
    const approach = this.speed / 3.6 * 0.45;
    const techniqueReady = gate.kind === 'jump' ? ratio >= JUMP_RATIO : ratio <= SLIDE_RATIO;
    if (this.action === 'run' && techniqueReady && this.distance >= gate.distance - approach) {
      this.actionGate = gate;
      this.action = gate.kind;
      this.launchDistance = Math.min(previous, gate.distance - approach);
    }
    if (this.actionGate) {
      this.actionProgress = clamp(0.5 * (this.distance - this.launchDistance) / (gate.distance - this.launchDistance), 0, 0.5);
    }
    if (this.distance < gate.distance) return;
    gate.resolved = true;
    this.obstacleIndex++;
    if (this.actionGate === gate) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.bonus += 80 + 20 * Math.min(this.combo, 10);
      this.threat = Math.max(0.18, this.threat - 0.12);
      this.actionProgress = 0.5;
    } else {
      this.mistakes++;
      this.combo = 0;
      this.action = 'stumble';
      this.actionProgress = 0;
      this.threat = Math.min(1, this.threat + 0.65);
      for (const relic of this.relics) {
        if (relic.rewardGate === gate.distance) relic.missed = true;
      }
    }
    this.actionGate = null;
  }
}
