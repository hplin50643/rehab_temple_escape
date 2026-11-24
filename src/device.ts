import { CommandRejected, RehabBleClient } from './ble';
import { freshRpm, hasControl, RPM_TTL_MS } from './types';
import type { Mode, Source } from './types';

interface Claim {
  source: Source;
  accepted: Promise<boolean>;
}

function connectionError(error: unknown): Error {
  if (error instanceof Error && error.name === 'NotFoundError') {
    return new Error('未選擇單車。請開啟 RehabWebBLE 裝置，再按連接單車。');
  }
  return error instanceof Error ? error : new Error(String(error));
}

export class DeviceSession {
  private source: Source | null = null;
  private selectedMode: Mode | null = null;
  private active = false;
  private observer = false;
  private opening = false;
  private starting = false;
  private connectionId = 0;
  private runId = 0;
  private claim: Claim | null = null;
  private stopping: Promise<void> | null = null;
  private monitor?: ReturnType<typeof setInterval>;
  private startupDeadline = 0;
  private simulatedRpm = 60;
  onStopUnconfirmed: (reason: string) => void;

  constructor(
    private readonly onPause: (reason: string) => void,
    private readonly makeBle: () => Source = () => new RehabBleClient(),
  ) {
    this.onStopUnconfirmed = onPause;
  }

  get mode() { return this.selectedMode; }
  get running() { return this.active; }
  get readOnly() { return this.observer; }
  get demoRpm() { return this.simulatedRpm; }
  get connected() { return this.mode === 'demo' || !!this.source?.connected; }

  setDemoRpm(value: number) {
    if (Number.isFinite(value)) this.simulatedRpm = Math.round(Math.min(65535, Math.max(0, value)));
  }

  async connect(mode: Mode, reuse = false): Promise<void> {
    if (this.opening || this.starting || this.running) throw new Error('請先暫停當前操作。');
    if (mode === this.mode && this.connected) return;
    this.opening = true;
    const id = ++this.connectionId;
    if (this.stopping) await this.stopping;
    if (id !== this.connectionId) throw new Error('連線已取消。');
    const old = this.source;
    const source = mode === 'ble' ? (reuse && old ? old : this.makeBle()) : null;
    this.source = source;
    this.selectedMode = mode;
    this.observer = false;
    if (old && old !== source) old.disconnect();
    if (!source) { this.opening = false; return; }
    source.onDisconnect = (reason) => {
      if (this.source !== source || this.connectionId !== id) return;
      const notify = !this.opening && !this.starting && !this.stopping;
      const controlled = this.active && !this.observer;
      this.cancelRun();
      this.claim = null;
      if (notify) this.onPause(controlled ? reason + ' 請在機台面板確認已停止。' : reason);
    };
    source.onState = () => this.checkSignal();
    try {
      await source.connect(reuse);
      if (id !== this.connectionId) throw new Error('連線已取消。');
    } catch (error) {
      throw connectionError(error);
    } finally {
      if (id === this.connectionId) this.opening = false;
    }
  }

  async start(readOnly = false): Promise<void> {
    if (this.active || this.starting || this.opening) throw new Error('已在執行，或單車仍在連接中。');
    const id = ++this.runId;
    const source = this.source;
    this.starting = true;
    try {
      if (this.stopping) await this.stopping;
      this.assertCurrent(id);
      if (!this.connected) throw new Error('請先連接單車或選擇模擬模式。');
      this.observer = readOnly && !!source;
      if (source) {
        if (readOnly) {
          if (freshRpm(source.snapshot, performance.now()) === null) {
            throw new Error('尚未收到有效轉速。請先由機台面板啟動，再按唯讀開始。');
          }
        } else {
          const request = source.send('claim');
          // Preserve the outstanding claim for halt(), including when the
          // player presses pause before firmware acknowledges ownership.
          this.claim = {
            source,
            accepted: request.then(() => true, (error: unknown) => {
              // A missing response leaves ownership uncertain. Dropping GATT
              // tells the gateway to revoke a lease it may already have issued.
              if (!(error instanceof CommandRejected)) source.disconnect();
              return false;
            }),
          };
          await request;
          this.assertCurrent(id);
          if (!source.snapshot?.state.machine.tracking) await source.send('start');
        }
      }
      this.assertCurrent(id);
      this.active = true;
      this.startupDeadline = source && !readOnly ? performance.now() + RPM_TTL_MS : 0;
      if (source) {
        this.monitor = setInterval(() => this.checkSignal(), 200);
        this.checkSignal();
        this.assertCurrent(id);
      }
    } catch (error) {
      if (this.runId === id) await this.halt();
      if (error instanceof CommandRejected && error.message === 'controller_busy') {
        throw new Error('另一個裝置正在控制單車。可由機台啟動後選擇唯讀遊玩。');
      }
      throw error;
    } finally {
      if (this.runId === id) this.starting = false;
    }
  }

  rpm(now = performance.now()): number | null {
    if (this.mode === 'demo') return this.demoRpm;
    if (!this.source?.connected) return null;
    const snapshot = this.source.snapshot;
    if (this.active && !this.observer && (!hasControl(snapshot, now) || !snapshot?.state.machine.tracking)) return null;
    return freshRpm(snapshot, now);
  }

  private checkSignal() {
    if (!this.active || !this.source) return;
    const now = performance.now();
    if (this.rpm(now) !== null) {
      this.startupDeadline = 0;
      return;
    }
    if (now < this.startupDeadline) return;
    const reason = !this.observer && !hasControl(this.source.snapshot, now)
      ? '單車遙測或控制權已失效，遊戲已暫停。'
      : '單車轉速訊號已中斷，請確認機台後再繼續。';
    void this.halt();
    this.onPause(reason);
  }

  halt(): Promise<void> {
    this.cancelRun();
    if (this.stopping) return this.stopping;
    const claim = this.claim;
    this.claim = null;
    if (!claim) return Promise.resolve();
    this.stopping = this.releaseClaim(claim).finally(() => { this.stopping = null; });
    return this.stopping;
  }

  private async releaseClaim({ source, accepted }: Claim) {
    if (!await accepted) return;
    let unconfirmed = '停止';
    try {
      await source.send('stop');
      unconfirmed = '釋放控制權';
      await source.send('release');
    } catch {
      // The gateway stops and revokes its lease when its owner disconnects.
      // Tell the player what could not be acknowledged, even while leaving.
      source.disconnect();
      this.onStopUnconfirmed('單車未確認' + unconfirmed + '指令。已中斷連線，請在機台面板確認已停止。');
    }
  }

  async disconnect(): Promise<void> {
    ++this.connectionId;
    const source = this.source;
    this.source = null;
    this.selectedMode = null;
    this.opening = false;
    this.observer = false;
    if (source && !source.connected) source.disconnect();
    await this.halt();
    source?.disconnect();
  }

  // Browsers may suspend JavaScript immediately on pagehide. GATT teardown
  // triggers the firmware's own stop even when no more writes can complete.
  closeNow() {
    ++this.connectionId;
    this.cancelRun();
    this.claim = null;
    const source = this.source;
    this.source = null;
    this.selectedMode = null;
    this.opening = false;
    this.observer = false;
    source?.disconnect();
  }

  private assertCurrent(id: number) {
    if (id !== this.runId) throw new Error('啟動已取消。');
  }

  private cancelRun() {
    ++this.runId;
    this.active = false;
    this.starting = false;
    clearInterval(this.monitor);
    this.monitor = undefined;
  }
}
