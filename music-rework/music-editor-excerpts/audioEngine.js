let ctx = null;
let masterGain = null;

export const INSTRUMENTS = {
  'sine-wave': { type: 'sine', attack: 0.02, filter: 2000, decay: 0.5 },
  'square-wave': { type: 'square', attack: 0.01, filter: 1500, decay: 0.4 },
  'saw-wave': { type: 'sawtooth', attack: 0.01, filter: 2500, decay: 0.4 },
  'tri-wave': { type: 'triangle', attack: 0.02, filter: 1000, decay: 0.6 },
  'warm-pad': { type: 'sine', attack: 0.4, filter: 800, decay: 1.2 },
  'bright-lead': { type: 'sawtooth', attack: 0.01, filter: 3000, decay: 0.3 },
  'sub-bass': { type: 'triangle', attack: 0.05, filter: 400, decay: 0.8 },
  'electric-piano': { type: 'sine', attack: 0.01, filter: 1200, decay: 0.8 },
  'acoustic-piano': {
    type: 'triangle',
    attack: 0.005,
    filter: 2400,
    decay: 1.1,
    partials: [
      { type: 'triangle', detune: 0, gain: 1 },
      { type: 'sine', detune: 1200, gain: 0.35 },
      { type: 'sine', detune: 1900, gain: 0.18 }
    ]
  },
};

export const KITS = {
  'electronic-808': { kick: 150, snare: 5000, hihat: 8000, kickType: 'lowpass', snareType: 'highpass' },
  'acoustic-studio': { kick: 100, snare: 3000, hihat: 10000, kickType: 'lowpass', snareType: 'highpass' },
  'bit-crushed-lofi': { kick: 200, snare: 2000, hihat: 4000, kickType: 'lowpass', snareType: 'bandpass' },
};

export function initAudio() {
  if (ctx) return ctx;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  ctx = new AudioContextCtor();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(ctx.destination);
  return ctx;
}

export async function resumeAudio() {
  if (ctx?.state === 'suspended') {
    await ctx.resume();
  }
}

export function getAudioContext() {
  return ctx;
}

export function stopAudio() {
  if (ctx) {
    ctx.close();
    ctx = null;
    masterGain = null;
  }
}

export function playOsc(freq, startTime, duration, volume = 0.5, instrumentId = 'sine-wave') {
  const inst = INSTRUMENTS[instrumentId] || INSTRUMENTS['sine-wave'];
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(inst.filter, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + inst.attack);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  const partials = inst.partials || [{ type: inst.type, detune: 0, gain: 1 }];
  partials.forEach((partial) => {
    const osc = ctx.createOscillator();
    osc.type = partial.type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.detune.setValueAtTime(partial.detune || 0, startTime);

    if (partial.gain !== undefined && partial.gain !== 1) {
      const partialGain = ctx.createGain();
      partialGain.gain.value = partial.gain;
      osc.connect(partialGain);
      partialGain.connect(filter);
    } else {
      osc.connect(filter);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });

  filter.connect(gain);
  gain.connect(masterGain);
}

export function playNoise(startTime, duration, volume = 0.5, drumType = 'kick', kitId = 'electronic-808') {
  const kit = KITS[kitId] || KITS['electronic-808'];
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  source.buffer = buffer;
  
  if (drumType === 'kick') {
    filter.type = kit.kickType;
    filter.frequency.setValueAtTime(kit.kick, startTime);
    filter.Q.setValueAtTime(10, startTime);
  } else if (drumType === 'snare') {
    filter.type = kit.snareType;
    filter.frequency.setValueAtTime(kit.snare, startTime);
  } else {
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(kit.hihat, startTime);
  }

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(startTime);
  source.stop(startTime + duration);
}
