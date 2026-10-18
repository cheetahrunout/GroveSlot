import { fx } from '../view/fx';

/**
 * All sound is synthesised with the Web Audio API: no audio files, nothing
 * borrowed. Browsers only allow audio after a tap or key press, so call
 * unlock() from the first user gesture.
 */
export type SfxName =
  | 'click'
  | 'spin'
  | 'reelStop'
  | 'win'
  | 'bigWin'
  | 'bonus'
  | 'spray'
  | 'hop'
  | 'coin'
  | 'wheelTick'
  | 'siren'
  | 'cheer'
  | 'skid';

const BPM = 92;
const STEP = 60 / BPM / 4; // sixteenth notes

// Two bars of laid-back G minor: kick, snare, hats, bass and a slow lead.
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const BASS: (number | null)[] = [
  98, null, null, 98, null, null, 116.5, null, 130.8, null, null, 130.8, 146.8, null, 174.6, null,
  98, null, null, 98, null, null, 87.3, null, 98, null, null, 116.5, 130.8, null, 146.8, null,
];
const LEAD: (number | null)[] = [392, null, null, null, null, null, null, null, 349.2, null, null, null, 293.7, null, null, null];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private sfxOn = true;
  private musicOn = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStep = 0;
  private nextTime = 0;

  /** Creates or resumes the audio context; safe to call on every gesture. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = fx() * 2 - 1;
    }
    void this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on && this.ctx) this.startMusic();
    if (!on) this.stopMusic();
  }

  // --- building blocks ---------------------------------------------------

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, out: AudioNode, slideTo?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noiseBurst(start: number, dur: number, gain: number, out: AudioNode, filter: BiquadFilterType, freq: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(out);
    src.start(start, fx() * 0.5);
    src.stop(start + dur + 0.05);
  }

  // --- effects -------------------------------------------------------------

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    const out = this.master;
    switch (name) {
      case 'click':
        this.tone(900, t, 0.05, 'square', 0.05, out);
        break;
      case 'spin':
        this.noiseBurst(t, 0.35, 0.15, out, 'bandpass', 900);
        break;
      case 'reelStop':
        this.tone(160, t, 0.12, 'sine', 0.4, out, 70);
        this.noiseBurst(t, 0.05, 0.08, out, 'highpass', 3000);
        break;
      case 'win':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.07, 0.18, 'triangle', 0.18, out));
        break;
      case 'bigWin':
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, t + i * 0.1, 0.4, 'sawtooth', 0.08, out));
        this.tone(196, t, 0.9, 'triangle', 0.2, out);
        break;
      case 'bonus':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, 'square', 0.07, out));
        break;
      case 'spray':
        this.noiseBurst(t, 0.4, 0.25, out, 'highpass', 4500);
        break;
      case 'hop':
        this.noiseBurst(t, 0.18, 0.2, out, 'lowpass', 600);
        this.tone(120, t + 0.05, 0.35, 'sine', 0.35, out, 260);
        break;
      case 'coin':
        this.tone(1318, t, 0.08, 'square', 0.06, out);
        this.tone(1760, t + 0.06, 0.12, 'square', 0.06, out);
        break;
      case 'wheelTick':
        this.tone(1200, t, 0.02, 'square', 0.04, out);
        break;
      case 'siren':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, t + i * 0.25, 0.24, 'sawtooth', 0.06, out);
        break;
      case 'cheer':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 'triangle', 0.15, out));
        break;
      case 'skid':
        this.noiseBurst(t, 0.6, 0.18, out, 'bandpass', 2200);
        this.tone(300, t, 0.5, 'sawtooth', 0.04, out, 120);
        break;
    }
  }

  // --- music -------------------------------------------------------------

  private startMusic(): void {
    if (this.timer || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.nextStep = 0;
    // Lookahead scheduler: queue notes slightly ahead of time.
    this.timer = setInterval(() => {
      const ctx = this.ctx!;
      while (this.nextTime < ctx.currentTime + 0.2) {
        this.scheduleStep(this.nextStep, this.nextTime);
        this.nextTime += STEP;
        this.nextStep = (this.nextStep + 1) % 32;
      }
    }, 50);
  }

  private stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private scheduleStep(step: number, t: number): void {
    const out = this.musicGain;
    const s16 = step % 16;
    if (KICK[s16]) this.tone(110, t, 0.25, 'sine', 0.9, out, 45);
    if (SNARE[s16]) this.noiseBurst(t, 0.18, 0.35, out, 'bandpass', 1800);
    if (s16 % 2 === 0) this.noiseBurst(t, 0.04, 0.12, out, 'highpass', 7000);
    const bass = BASS[step];
    if (bass) this.tone(bass / 2, t, STEP * 2.5, 'sawtooth', 0.22, out);
    const lead = LEAD[s16];
    if (lead && step < 16) this.tone(lead, t, STEP * 7, 'sine', 0.05, out, lead * 0.97);
  }
}

export const sound = new Sound();
