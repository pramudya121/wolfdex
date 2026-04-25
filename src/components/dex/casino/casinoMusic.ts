/**
 * Casino background music — pure WebAudio. No external assets.
 *
 * Plays a smoky-lounge progression (Am9 → D9 → Gmaj7 → Cmaj7) on a soft
 * Rhodes-like voice with a brushed swing pattern, looped while the user is
 * on the /casino page. Respects the global mute flag used for SFX so a
 * single speaker toggle controls everything.
 *
 * Architecture:
 *  - Single shared AudioContext (created on first user gesture).
 *  - A scheduler runs every 100 ms, looking 0.3s ahead and queueing notes
 *    on the precise audio clock — eliminates timer-jitter clicks.
 *  - Two voices: a triangle-wave Rhodes pad + a low sine bass walk.
 *  - A subtle high-passed shaker keeps the swing pulse alive.
 */

import { isCasinoMuted } from './casinoShared';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timerId: number | null = null;
let nextNoteTime = 0;
let beat = 0;
let started = false;

const BPM = 78;
const SECONDS_PER_BEAT = 60 / BPM;
const LOOKAHEAD = 0.1;       // scheduler tick (s)
const SCHEDULE_AHEAD = 0.3;  // queue this far in advance (s)

// Chord progression (one chord every 2 beats — slow lounge feel).
// MIDI note numbers, root + add color tones.
const PROGRESSION: number[][] = [
  [57, 60, 64, 67, 71], // Am9 (A C E G B)
  [50, 54, 57, 60, 64], // D9  (D F# A C E)
  [55, 59, 62, 66, 69], // Gmaj7 (G B D F# A)
  [48, 52, 55, 59, 62], // Cmaj7 (C E G B D)
];

// Bass walk per chord (one note per beat).
const BASS: number[][] = [
  [33, 35, 36, 38], // A2 walk
  [38, 40, 41, 43], // D walk
  [43, 45, 47, 48], // G walk
  [36, 38, 40, 41], // C walk
];

function midiToFreq(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  let c = ctx;
  if (!c) {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      c = new Ctor() as AudioContext;
      ctx = c;
      master = c.createGain();
      master.gain.value = 0;
      // Soft lowpass to round off the digital edges
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      lp.Q.value = 0.6;
      master.connect(lp).connect(c.destination);
    } catch { return null; }
  }
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

/** Soft Rhodes-ish chord stab — triangle + filter + slow release. */
function playChord(notes: number[], time: number, dur: number) {
  if (!ctx || !master) return;
  const chordGain = ctx.createGain();
  chordGain.gain.setValueAtTime(0, time);
  chordGain.gain.linearRampToValueAtTime(0.18, time + 0.04);
  chordGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, time);
  filter.frequency.exponentialRampToValueAtTime(2200, time + 0.3);
  filter.Q.value = 1.2;
  notes.forEach((n, i) => {
    const o = ctx!.createOscillator();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = midiToFreq(n);
    // Slight detune for warmth
    o.detune.value = (i % 2 === 0 ? -4 : 4);
    const g = ctx!.createGain();
    g.gain.value = 1 / Math.max(1, notes.length - 1) * 0.9;
    o.connect(g).connect(filter);
    o.start(time);
    o.stop(time + dur + 0.1);
  });
  filter.connect(chordGain).connect(master);
}

/** Soft sine bass with a touch of saturation feel via gentle envelope. */
function playBass(note: number, time: number, dur: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = midiToFreq(note);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.25, time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  // sub bump
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = midiToFreq(note - 12);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, time);
  g2.gain.linearRampToValueAtTime(0.10, time + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g).connect(master);
  o2.connect(g2).connect(master);
  o.start(time); o2.start(time);
  o.stop(time + dur + 0.05); o2.stop(time + dur + 0.05);
}

/** Brushed shaker / hi-hat made from filtered noise burst. */
function playShaker(time: number, accent = false) {
  if (!ctx || !master) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = accent ? 6000 : 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(accent ? 0.06 : 0.03, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, time + (accent ? 0.18 : 0.08));
  src.connect(hp).connect(g).connect(master);
  src.start(time);
  src.stop(time + 0.25);
}

function scheduleNotes() {
  if (!ctx || !master) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    // 16 beats per loop (4 chords × 4 beats)
    const beatInLoop = beat % 16;
    const chordIdx = Math.floor(beatInLoop / 4) % PROGRESSION.length;
    const beatInChord = beatInLoop % 4;

    // Chord stab on beats 1 and 3 of each chord (every 2 beats)
    if (beatInChord === 0 || beatInChord === 2) {
      playChord(PROGRESSION[chordIdx], nextNoteTime, SECONDS_PER_BEAT * 2.2);
    }
    // Bass walk every beat
    playBass(BASS[chordIdx][beatInChord], nextNoteTime, SECONDS_PER_BEAT * 0.95);
    // Shaker swing — eighth notes with accent on 2 & 4
    playShaker(nextNoteTime, beatInChord === 1 || beatInChord === 3);
    playShaker(nextNoteTime + SECONDS_PER_BEAT * 0.66, false);

    nextNoteTime += SECONDS_PER_BEAT;
    beat++;
  }
}

function tick() {
  if (!ctx || !master) return;
  scheduleNotes();
  timerId = window.setTimeout(tick, LOOKAHEAD * 1000);
}

/** Start (or resume) the casino music. Safe to call repeatedly. */
export function startCasinoMusic() {
  if (isCasinoMuted()) return; // honor mute
  const c = ensureCtx();
  if (!c || !master) return;
  if (started) {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(master.gain.value, c.currentTime);
    master.gain.linearRampToValueAtTime(0.55, c.currentTime + 0.6);
    return;
  }
  started = true;
  beat = 0;
  nextNoteTime = c.currentTime + 0.05;
  master.gain.setValueAtTime(0, c.currentTime);
  master.gain.linearRampToValueAtTime(0.55, c.currentTime + 1.2);
  tick();
}

/** Fade out + stop scheduling. Safe to call repeatedly. */
export function stopCasinoMusic() {
  if (!ctx || !master) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  if (timerId !== null) {
    window.clearTimeout(timerId);
    timerId = null;
  }
  started = false;
}

/** Reflect a mute toggle from elsewhere in the UI. */
export function syncCasinoMusicMute() {
  if (isCasinoMuted()) {
    stopCasinoMusic();
  } else {
    startCasinoMusic();
  }
}

export function isCasinoMusicPlaying() {
  return started;
}