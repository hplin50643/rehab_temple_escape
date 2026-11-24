import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandRejected } from '../src/ble';
import { DeviceSession } from '../src/device';
import { freshRpm, telemetry } from '../src/types';
import type { Response, Snapshot, Source } from '../src/types';
import { snapshot } from './fixtures';

class TestBike implements Source {
  readonly mode = 'ble';
  commands: string[] = [];
  connected = false;
  snapshot: Snapshot | null = null;
  onState: Source['onState'] = () => {};
  onDisconnect: Source['onDisconnect'] = () => {};
  onError: Source['onError'] = () => {};
  intercept: (cmd: string) => Promise<void> = async () => {};

  async connect() {
    this.connected = true;
    this.snapshot = snapshot(performance.now());
    this.snapshot.state.lease.you_control = false;
    this.snapshot.state.machine.tracking = false;
  }

  async send(cmd: string): Promise<Response> {
    this.commands.push(cmd);
    await this.intercept(cmd);
    if (!this.connected) throw new Error('Disconnected');
    const state = this.snapshot!.state;
    if (cmd === 'claim') state.lease.you_control = true;
    if (cmd === 'release') state.lease.you_control = false;
    if (cmd === 'stop') state.machine.tracking = false;
    if (cmd === 'start') state.machine.tracking = true;
    return { v: 1, type: 'response', id: this.commands.length, cmd, ok: true, lease: state.lease };
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.snapshot = null;
    this.onDisconnect('連線已中斷');
  }
}

describe('WebBLE speed input sessions', () => {
  let bike: TestBike;
  let session: DeviceSession;
  let reasons: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    bike = new TestBike();
    reasons = [];
    session = new DeviceSession(reason => reasons.push(reason), () => bike);
  });
  afterEach(() => { session.closeNow(); vi.useRealTimers(); });

  it('does not touch Bluetooth for a demo and accepts stopped, lower and higher speeds', async () => {
    await session.connect('demo');
    await session.start();
    for (const rpm of [60, 85, 15, 0, 450, 65535]) {
      session.setDemoRpm(rpm);
      expect(session.rpm()).toBe(rpm);
    }
    await session.disconnect();
    expect(session.rpm()).toBeNull();
    expect(bike.connected).toBe(false);
    expect(bike.commands).toEqual([]);
  });

  it('starts once and releases once even if halt runs more than once', async () => {
    await session.connect('ble');
    await session.start();
    expect(session.running).toBe(true);
    expect(session.rpm()).toBe(60);
    await Promise.all([session.halt(), session.halt(), session.disconnect()]);
    expect(bike.commands).toEqual(['claim', 'start', 'stop', 'release']);
    expect(reasons).toEqual([]);
  });

  it('preserves a valid zero, then pauses on expired RPM even with no notifications', async () => {
    await session.connect('ble');
    bike.snapshot!.state.machine.rpm = 0;
    bike.snapshot!.state.machine.age28_ms = 4000;
    await session.start();
    expect(session.rpm()).toBe(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(session.running).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(session.running).toBe(false);
    expect(bike.commands).toEqual(['claim', 'start', 'stop', 'release']);
    expect(reasons).toHaveLength(1);
  });

  it('allows first machine samples to arrive after a controlled Start', async () => {
    await session.connect('ble');
    bike.snapshot!.state.machine.rpm = null;
    await session.start();
    await vi.advanceTimersByTimeAsync(4500);
    expect(session.running).toBe(true);
    expect(session.rpm()).toBeNull();
    bike.snapshot!.receivedAt = performance.now();
    bike.snapshot!.state.machine.rpm = 32;
    bike.onState(bike.snapshot!);
    expect(session.rpm()).toBe(32);
    expect(session.running).toBe(true);
  });

  it('stops a controlled run if fresh telemetry reports the lease was lost', async () => {
    await session.connect('ble');
    await session.start();
    bike.snapshot!.state.lease.you_control = false;
    bike.onState(bike.snapshot!);
    await session.halt();
    expect(session.running).toBe(false);
    expect(reasons).toHaveLength(1);
    expect(bike.commands).toEqual(['claim', 'start', 'stop', 'release']);
  });

  it('can observe an externally operated machine after a rejected claim without control writes', async () => {
    await session.connect('ble');
    bike.intercept = async cmd => { if (cmd === 'claim') throw new CommandRejected('controller_busy'); };
    await expect(session.start()).rejects.toThrow('唯讀');
    expect(session.connected).toBe(true);
    await session.start(true);
    expect(session.readOnly).toBe(true);
    expect(session.rpm()).toBe(60);
    await vi.advanceTimersByTimeAsync(5000);
    expect(reasons).toHaveLength(1);
    await session.disconnect();
    expect(bike.commands).toEqual(['claim']);
  });

  it('waits for valid telemetry before allowing an observer to run', async () => {
    await session.connect('ble');
    bike.snapshot!.state.machine.rpm = null;
    await expect(session.start(true)).rejects.toThrow('尚未收到');
    expect(session.running).toBe(false);
    await session.halt();
    expect(bike.commands).toEqual([]);
  });

  it('does not resume or reuse old speed when reconnecting after a drop', async () => {
    await session.connect('ble');
    await session.start();
    bike.disconnect();
    expect(session.running).toBe(false);
    expect(session.rpm()).toBeNull();
    expect(reasons).toHaveLength(1);
    await session.connect('ble', true);
    expect(session.running).toBe(false);
    expect(bike.commands).toEqual(['claim', 'start']);
  });

  it('releases ownership when Halt races a pending claim, without starting the bike', async () => {
    await session.connect('ble');
    let allowClaim!: () => void;
    bike.intercept = cmd => cmd === 'claim'
      ? new Promise<void>(resolve => { allowClaim = resolve; }) : Promise.resolve();
    const start = expect(session.start()).rejects.toThrow('取消');
    const halt = session.halt();
    allowClaim();
    await Promise.all([start, halt]);
    expect(bike.commands).toEqual(['claim', 'stop', 'release']);
    expect(session.running).toBe(false);
  });

  it('tears down an uncertain claim and reports a missing Stop acknowledgement on the next run', async () => {
    await session.connect('ble');
    bike.intercept = async cmd => { if (cmd === 'claim') throw new Error('timeout'); };
    await expect(session.start()).rejects.toThrow('timeout');
    expect(session.connected).toBe(false);
    await session.connect('ble', true);
    bike.intercept = async cmd => { if (cmd === 'stop') throw new Error('timeout'); };
    await session.start();
    await session.halt();
    expect(session.connected).toBe(false);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('單車未確認停止指令');
  });

  it('still reports a missing release acknowledgement to the UI while returning home', async () => {
    const warnings: string[] = [];
    session.onStopUnconfirmed = warning => warnings.push(warning);
    await session.connect('ble');
    await session.start();
    bike.intercept = async cmd => { if (cmd === 'release') throw new Error('timeout'); };
    await session.disconnect();
    expect(session.mode).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('未確認釋放控制權指令');
    expect(reasons).toEqual([]);
  });

  it('drops unused personal data and handles device and browser clock ages independently', () => {
    const s = snapshot(1000);
    const state = telemetry({ ...s.state, rfid: { uid: 'test' }, heart: { bpm: 98 },
      machine: { ...s.state.machine, age28_ms: 4000, distance_raw: 12345 } });
    expect(state).not.toHaveProperty('heart');
    expect(state).not.toHaveProperty('rfid');
    expect(state.machine).not.toHaveProperty('distance_raw');
    expect(freshRpm({ state, receivedAt: 1000 }, 999)).toBe(60);
    expect(freshRpm({ state, receivedAt: 1000 }, 1999)).toBe(60);
    expect(freshRpm({ state, receivedAt: 1000 }, 2000)).toBeNull();
  });
});
