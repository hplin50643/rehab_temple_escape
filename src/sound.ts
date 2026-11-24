// Short original cues; the audio context is opened by a player gesture.
export class ExpeditionAudio {
  private context: AudioContext | null = null;
  enabled = false;
  async unlock() {
    if (!this.enabled || typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
    } catch { /* The expedition can continue silently. */ }
  }
  play(cue: 'start' | 'relic' | 'miss' | 'finish' | 'step') {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const notes = {start:[293.66,440], relic:[880,1174.66], miss:[116.54,87.31], finish:[349.23,440,523.25,698.46], step:[62]}[cue];
    const short = cue === 'step';
    notes.forEach((hz,index) => {
      const at = ctx.currentTime + index * .105;
      const end = at + (short ? .065 : .30);
      const wave = ctx.createOscillator(), gain = ctx.createGain();
      wave.type = short || cue === 'miss' ? 'triangle' : 'sine';
      wave.frequency.setValueAtTime(hz,at);
      if (short) wave.frequency.exponentialRampToValueAtTime(30,end);
      gain.gain.setValueAtTime(.0001,at);
      gain.gain.exponentialRampToValueAtTime(short ? .035 : .085,at+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,end);
      wave.connect(gain).connect(ctx.destination);
      wave.start(at); wave.stop(end+.01);
      wave.onended=()=>{wave.disconnect();gain.disconnect();};
    });
  }
}
