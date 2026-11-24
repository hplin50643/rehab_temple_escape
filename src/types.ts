export type Mode = 'demo' | 'ble';

export interface Lease {
  you_control: boolean;
  remaining_ms: number;
  stopping: boolean;
}

export interface Telemetry {
  v: 1;
  type: 'state';
  seq: number;
  uptime_ms: number;
  lease: Lease;
  machine: { rpm: number | null; age28_ms: number | null; tracking: boolean };
}

export interface Snapshot {
  receivedAt: number;
  state: Telemetry;
}

export interface Response {
  v: 1;
  type: 'response';
  id: number;
  cmd: string;
  ok: boolean;
  lease: Lease;
  error?: string;
}

export interface Source {
  readonly mode: Mode;
  connected: boolean;
  snapshot: Snapshot | null;
  onState: (snapshot: Snapshot) => void;
  onDisconnect: (reason: string) => void;
  onError: (message: string) => void;
  connect(reuse?: boolean): Promise<void>;
  send(cmd: string, fields?: Record<string, unknown>): Promise<Response>;
  disconnect(): void;
}

const unsigned = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

// Keep only the flywheel reading and fields needed to manage the connection.
export function telemetry(value: unknown): Telemetry {
  const s = value as Telemetry;
  if (!s || s.v !== 1 || s.type !== 'state' || !s.machine || !s.lease ||
      unsigned(s.seq) === null || unsigned(s.uptime_ms) === null) {
    throw new Error('無法辨識單車的遙測資料。');
  }
  return {
    v: 1, type: 'state', seq: s.seq, uptime_ms: s.uptime_ms,
    lease: {
      you_control: s.lease.you_control === true,
      stopping: s.lease.stopping === true,
      remaining_ms: unsigned(s.lease.remaining_ms) ?? 0,
    },
    machine: {
      rpm: unsigned(s.machine.rpm),
      age28_ms: unsigned(s.machine.age28_ms),
      tracking: s.machine.tracking === true,
    },
  };
}

export const RPM_TTL_MS = 5000;

export function freshRpm(snapshot: Snapshot | null, now: number): number | null {
  if (!snapshot) return null;
  const { rpm, age28_ms: age } = snapshot.state.machine;
  const elapsed = Math.max(0, now - snapshot.receivedAt);
  return age !== null && age + elapsed < RPM_TTL_MS ? rpm : null;
}

export function hasControl(snapshot: Snapshot | null, now: number): boolean {
  if (!snapshot) return false;
  const lease = snapshot.state.lease;
  const elapsed = Math.max(0, now - snapshot.receivedAt);
  return lease.you_control && !lease.stopping && elapsed < Math.min(RPM_TTL_MS, lease.remaining_ms);
}
