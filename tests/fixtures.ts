import type { Snapshot } from '../src/types';

export function snapshot(now = 0): Snapshot {
  return {
    receivedAt: now,
    state: {
      v: 1, type: 'state', seq: Math.round(now) + 1, uptime_ms: now,
      lease: { you_control: true, remaining_ms: 30000, stopping: false },
      machine: { rpm: 60, age28_ms: 0, tracking: true },
    },
  };
}
