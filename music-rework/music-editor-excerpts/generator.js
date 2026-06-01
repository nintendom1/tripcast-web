import { Theory, getProgressionOptions } from './theory.js';

export const TRACKS = ['melody', 'countermelody', 'chords', 'bass', 'drums'];

export function createDefaultPatch() {
  const patch = {
    version: 2,
    name: 'Untitled Loop',
    bpm: 128,
    key: 'C',
    mode: 'mixolydian',
    bars: 16,
    progression: ['I', 'bVII', 'IV', 'I'],
    bassPattern: 'root-fifth-octave',
    voicing: 'triads',
    groove: 'driving-eighths',
    melodyStyle: 'chord-tone-hook',
    melodyRhythm: 'mixed-values',
    melodyDensity: 'medium',
    whyMelodyRhythm: 'Mixed note values create a relaxed, improvised melodic feel with natural variation in generated lengths.',
    whyMelodyDensity: 'Medium density leaves breathing room for lush chords while still providing enough notes to feel melodic.',
    countermelodyRole: 'answer',
    countermelodyTiming: 'end-of-phrase',
    countermelodyDensity: 'low',
    countermelodyRegister: 'above',
    countermelodyMotion: 'pentatonic',
    whyCountermelody: 'Adds a light answering phrase to the main melody.',
    arrangement: 'build-up',
    tracks: {
      bass: { enabled: true, volume: 0.6, instrument: 'sub-bass', whyInstrument: 'A deep, filtered bass provides a solid foundation without interfering with the melody.', events: [] },
      countermelody: { enabled: true, volume: 0.25, instrument: 'bright-lead', whyInstrument: 'A light lead tone creates an answering hook without overpowering the main melody.', events: [] },
      chords: { enabled: true, volume: 0.3, instrument: 'warm-pad', whyInstrument: 'Lush pads create a wide harmonic bed for the other instruments.', events: [] },
      melody: { enabled: true, volume: 0.4, instrument: 'bright-lead', whyInstrument: 'A sharp, lead sound ensures the melody cuts through the mix.', events: [] },
      drums: { enabled: true, volume: 0.4, instrument: 'electronic-808', whyInstrument: 'Classic electronic drums provide a punchy, modern rhythmic foundation.', events: [] }
    }
  };

  return generateAll(patch);
}

export function clonePatch(patch) {
  return JSON.parse(JSON.stringify(patch));
}

export function normalizePatch(value) {
  if (!value || typeof value !== 'object') throw new Error('Patch must be an object.');
  const required = ['bpm', 'key', 'mode', 'bars', 'progression', 'tracks'];
  for (const field of required) {
    if (!(field in value)) throw new Error(`Patch is missing "${field}".`);
  }

  // Migration / Backfill for Countermelody
  if (!value.tracks.countermelody) {
    value.tracks.countermelody = {
      enabled: true,
      volume: 0.25,
      instrument: 'bright-lead',
      whyInstrument: 'A light lead tone creates an answering hook without overpowering the main melody.',
      events: []
    };
    value.countermelodyRole = value.countermelodyRole || 'answer';
    value.countermelodyTiming = value.countermelodyTiming || 'end-of-phrase';
    value.countermelodyDensity = value.countermelodyDensity || 'low';
    value.countermelodyRegister = value.countermelodyRegister || 'above';
    value.countermelodyMotion = value.countermelodyMotion || 'pentatonic';
    value.whyCountermelody = value.whyCountermelody || 'Adds a light answering phrase to the main melody.';
  }

  if (!Array.isArray(value.progression) || value.progression.length === 0) {
    throw new Error('Patch progression must be a non-empty array.');
  }
  if (typeof value.bpm !== 'number' || value.bpm <= 0) throw new Error('BPM must be a positive number.');
  if (typeof value.bars !== 'number' || value.bars <= 0) throw new Error('Bars must be a positive number.');

  for (const track of TRACKS) {
    const t = value.tracks?.[track];
    if (!t || typeof t !== 'object') throw new Error(`Patch is missing track configuration for: ${track}`);
    if (!Array.isArray(t.events)) throw new Error(`Track "${track}" is missing events array.`);
    if (typeof t.volume !== 'number') throw new Error(`Track "${track}" is missing volume.`);
    if (typeof t.enabled !== 'boolean') throw new Error(`Track "${track}" is missing enabled flag.`);
  }
  return value;
}

export function setPatchField(patch, field, rawValue) {
  const next = clonePatch(patch);
  let value = field === 'bpm' || field === 'bars' ? Number(rawValue) : rawValue;

  // Sanitize numeric inputs to prevent division by zero or invalid UI states
  if (field === 'bpm' && (Number.isNaN(value) || value <= 0)) value = patch.bpm || 120;
  if (field === 'bars' && (Number.isNaN(value) || value <= 0)) value = patch.bars || 16;

  next[field] = value;

  if (field === 'mode') {
    next.progression = getProgressionOptions(value)[0];
    return generateAll(next);
  }
  if (['key', 'bars', 'meter'].includes(field)) return generateAll(next);
  if (field === 'bassPattern') next.tracks.bass.events = generateBass(next);
  if (field === 'voicing') next.tracks.chords.events = generateChords(next);
  if (field === 'groove') next.tracks.drums.events = generateDrums(next);
  if (['melodyStyle', 'melodyRhythm', 'melodyDensity'].includes(field)) {
    next.tracks.melody.events = generateMelody(next);
    next.tracks.countermelody.events = generateCountermelody(next);
  }
  if (['countermelodyRole', 'countermelodyTiming', 'countermelodyDensity', 'countermelodyRegister', 'countermelodyMotion'].includes(field)) next.tracks.countermelody.events = generateCountermelody(next);
  return next;
}

export function setProgression(patch, progressionText) {
  const next = clonePatch(patch);
  const parts = progressionText.split('-').filter(p => p.trim() !== '');
  if (parts.length > 0) next.progression = parts;
  return generateAll(next);
}

export function setTargetDuration(patch, seconds) {
  const sec = Number(seconds);
  if (!sec) return patch;
  const next = clonePatch(patch);
  const beats = (sec * (next.bpm || 120)) / 60;
  const rawBars = Math.round(beats / (next.meter || 4));

  // Snap to supported bar counts to maintain UI synchronization
  const allowed = [4, 8, 16, 32];
  next.bars = allowed.reduce((prev, curr) =>
    Math.abs(curr - rawBars) < Math.abs(prev - rawBars) ? curr : prev
  );

  return generateAll(next);
}

export function generateAll(patch) {
  const next = clonePatch(patch);
  next.tracks.bass.events = generateBass(next);
  next.tracks.chords.events = generateChords(next);
  next.tracks.melody.events = generateMelody(next);
  next.tracks.countermelody.events = generateCountermelody(next);
  next.tracks.drums.events = generateDrums(next);
  return next;
}

export function getExportablePatch(patch) {
  const exportPatch = clonePatch(patch);
  if (!exportPatch.tracks.countermelody.enabled) {
    delete exportPatch.tracks.countermelody;
    delete exportPatch.countermelodyRole;
    delete exportPatch.countermelodyTiming;
    delete exportPatch.countermelodyDensity;
    delete exportPatch.countermelodyRegister;
    delete exportPatch.countermelodyMotion;
    delete exportPatch.whyCountermelody;
  }
  return exportPatch;
}

export function regenerateTrack(patch, track) {
  const next = clonePatch(patch);
  if (track === 'bass') next.tracks.bass.events = generateBass(next);
  if (track === 'chords') next.tracks.chords.events = generateChords(next);
  if (track === 'melody') next.tracks.melody.events = generateMelody(next);
  if (track === 'countermelody') next.tracks.countermelody.events = generateCountermelody(next);
  if (track === 'drums') next.tracks.drums.events = generateDrums(next);
  return next;
}

export function updateEvent(patch, track, index, field, rawValue) {
  const next = clonePatch(patch);
  const numericValue = Number.parseFloat(rawValue);
  const value = Array.isArray(rawValue) || Number.isNaN(numericValue) ? rawValue : numericValue;
  next.tracks[track].events[index][field] = value;
  if (field === 'midi') next.tracks[track].events[index].label = Theory.getNoteName(value);
  if (field === 'drum') next.tracks[track].events[index].label = String(value).slice(0, 1).toUpperCase();
  return next;
}

export function removeEvent(patch, track, index) {
  const next = clonePatch(patch);
  next.tracks[track].events = next.tracks[track].events.filter((_, eventIndex) => eventIndex !== index);
  return next;
}

function generateBass(patch) {
  const events = [];
  const { bars, progression, bassPattern } = patch;
  const beatsPerBar = patch.meter || 4;
  for (let bar = 1; bar <= bars; bar += 1) {
    const chordIdx = Math.floor((bar - 1) % progression.length);
    const chordRoot = Theory.getChordNotes(progression[chordIdx], patch.key, patch.mode, 'triads')[0] - 24;

    if (bassPattern === 'pedal-drone') {
      events.push({ track: 'bass', bar, beat: 1, durationBeats: beatsPerBar, midi: chordRoot, velocity: 0.4, label: Theory.getNoteName(chordRoot) });
      continue;
    }

    for (let beat = 1; beat <= beatsPerBar; beat += 1) {
      if (bassPattern === 'root-pulse') {
        events.push({ track: 'bass', bar, beat, durationBeats: 0.8, midi: chordRoot, velocity: 0.6, label: Theory.getNoteName(chordRoot) });
      } else if (bassPattern === 'root-fifth-octave') {
        const note = beat === 3 ? chordRoot + 7 : beat === 4 ? chordRoot + 12 : chordRoot;
        events.push({ track: 'bass', bar, beat, durationBeats: 0.5, midi: note, velocity: 0.6, label: Theory.getNoteName(note) });
      } else if (bassPattern === 'walking') {
        const note = chordRoot + [0, 4, 7, 5][beat - 1];
        events.push({ track: 'bass', bar, beat, durationBeats: 0.9, midi: note, velocity: 0.5, label: Theory.getNoteName(note) });
      } else if (bassPattern === 'arpeggio') {
        const note = chordRoot + [0, 4, 7, 12][(beat - 1) % 4];
        events.push({ track: 'bass', bar, beat, durationBeats: 0.8, midi: note, velocity: 0.5, label: Theory.getNoteName(note) });
      }
    }
  }
  return events;
}

function generateChords(patch) {
  const events = [];
  const { bars, progression, voicing } = patch;
  const beatsPerBar = patch.meter || 4;
  for (let bar = 1; bar <= bars; bar += 1) {
    const chordIdx = Math.floor((bar - 1) % progression.length);
    const midis = Theory.getChordNotes(progression[chordIdx], patch.key, patch.mode, voicing);
    events.push({ track: 'chords', bar, beat: 1, durationBeats: beatsPerBar - 0.2, midis, velocity: 0.3, label: progression[chordIdx] });
  }
  return events;
}

function generateMelody(patch) {
  const events = [];
  const { bars, progression, melodyStyle, melodyRhythm, melodyDensity } = patch;
  const beatsPerBar = patch.meter || 4;
  const scale = Theory.getScale(patch.key, patch.mode).map((note) => note + 60);
  const pentatonic = Theory.getScale(patch.key, patch.mode === 'aeolian' ? 'minorPentatonic' : 'majorPentatonic').map((note) => note + 60);
  let lastNote = scale[0];

  const rhythmTemplates = {
    'even-eighths': () => [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5].map(b => ({ beat: b, durationBeats: 0.45 })),
    'quarter-note-theme': () => [1, 2, 3, 4].map(b => ({ beat: b, durationBeats: 0.8 })),
    'short-short-long': () => [
      { beat: 1, durationBeats: 0.3 }, { beat: 1.5, durationBeats: 0.3 }, { beat: 2, durationBeats: 0.9 },
      { beat: 3, durationBeats: 0.3 }, { beat: 3.5, durationBeats: 0.3 }, { beat: 4, durationBeats: 0.9 }
    ],
    'dotted-rhythm': () => [
      { beat: 1, durationBeats: 0.7 }, { beat: 1.75, durationBeats: 0.2 },
      { beat: 2, durationBeats: 0.7 }, { beat: 2.75, durationBeats: 0.2 },
      { beat: 3, durationBeats: 0.7 }, { beat: 3.75, durationBeats: 0.2 },
      { beat: 4, durationBeats: 0.7 }, { beat: 4.75, durationBeats: 0.2 }
    ],
    'syncopated': () => [
      { beat: 1, durationBeats: 0.4 }, { beat: 1.5, durationBeats: 0.6 },
      { beat: 2.75, durationBeats: 0.25 }, { beat: 3, durationBeats: 0.5 },
      { beat: 3.75, durationBeats: 0.75 }, { beat: 4.5, durationBeats: 0.4 }
    ],
    'sparse': () => [
      { beat: 1, durationBeats: 1.8 }, { beat: 3, durationBeats: 1.8 }
    ],
    'mixed-values': () => {
      const options = [0.25, 0.5, 0.75, 1.0];
      const res = [];
      let current = 1;
      while (current < 5) {
        const dur = options[Math.floor(Math.random() * options.length)];
        res.push({ beat: current, durationBeats: dur * 0.9 });
        current += dur;
      }
      return res;
    },
    'sparkle': () => {
      const res = [];
      for (let b = 1; b <= 4.75; b += 0.25) {
        res.push({ beat: b, durationBeats: 0.15 });
      }
      return res;
    }
  };

  const densityMap = { low: 0.3, medium: 0.55, high: 0.85 };
  const keepThreshold = densityMap[melodyDensity || 'medium'];

  for (let bar = 1; bar <= bars; bar += 1) {
    const chordIdx = Math.floor((bar - 1) % progression.length);
    const chordTones = Theory.getChordNotes(progression[chordIdx], patch.key, patch.mode, 'triads').map((note) => note + 12);
    
    const getTemplate = rhythmTemplates[melodyRhythm] || rhythmTemplates['mixed-values'];
    const candidates = getTemplate().filter(({ beat }) => beat < beatsPerBar + 1);

    candidates.forEach(({ beat, durationBeats }) => {
      // Determine if we should keep this note based on density
      const isStrong = beat === 1 || beat === 3;
      const boost = isStrong ? 0.2 : 0;
      const roll = Math.random();

      if (roll > (keepThreshold + boost)) return;

      // Select Pitch based on Melody Style
      let note;
      if (melodyStyle === 'chord-tone-hook') {
        note = Math.random() < 0.8 ? chordTones[Math.floor(Math.random() * chordTones.length)] : scale[Math.floor(Math.random() * scale.length)];
      } else if (melodyStyle === 'stepwise') {
        const currentIndex = scale.indexOf(lastNote);
        const move = Math.random() > 0.5 ? 1 : -1;
        const newIdx = Math.max(0, Math.min(scale.length - 1, currentIndex + move));
        note = scale[newIdx];
      } else if (melodyStyle === 'pentatonic-hook') {
        note = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      } else if (melodyStyle === 'sparkle-notes') {
        note = scale[Math.floor(Math.random() * scale.length)] + 12;
      } else if (isStrong) {
        note = chordTones[Math.floor(Math.random() * chordTones.length)];
      } else {
        note = scale[Math.floor(Math.random() * scale.length)];
      }

      // Prevent notes from overlapping bar boundaries too much
      let finalDuration = durationBeats;
      if (beat + durationBeats > beatsPerBar + 1) {
        finalDuration = beatsPerBar + 1 - beat;
      }

      // Sparkle notes override register/duration slightly regardless of rhythm choice
      if (melodyStyle === 'sparkle-notes') {
        note += 12;
        finalDuration = Math.min(finalDuration, 0.2);
      }

      lastNote = note;
      events.push({
        track: 'melody',
        bar,
        beat,
        durationBeats: finalDuration,
        midi: note,
        velocity: isStrong ? 0.6 : 0.4,
        label: Theory.getNoteName(note)
      });
    });
  }
  return events;
}

function generateCountermelody(patch) {
  const events = [];
  const { bars, progression, countermelodyRole, countermelodyTiming, countermelodyDensity, countermelodyRegister, countermelodyMotion } = patch;
  const melodyEvents = patch.tracks.melody.events;
  const scale = Theory.getScale(patch.key, patch.mode);
  const pentatonic = Theory.getScale(patch.key, patch.mode === 'aeolian' ? 'minorPentatonic' : 'majorPentatonic');
  const beatsPerBar = patch.meter || 4;
  const halfBeatCandidates = [];
  for (let beat = 1; beat < beatsPerBar + 1; beat += 0.5) halfBeatCandidates.push(beat);
  const wholeBeatCandidates = [];
  for (let beat = 1; beat <= beatsPerBar; beat += 1) wholeBeatCandidates.push(beat);

  const densityMap = { low: 0.25, medium: 0.45, high: 0.7 };
  const keepThreshold = densityMap[countermelodyDensity || 'low'];

  for (let bar = 1; bar <= bars; bar += 1) {
    const chordIdx = Math.floor((bar - 1) % progression.length);
    const chordTones = Theory.getChordNotes(progression[chordIdx], patch.key, patch.mode, 'triads');
    const barMelody = melodyEvents.filter(e => e.bar === bar);

    // Generate candidate beats based on timing
    let candidates = [];
    if (countermelodyTiming === 'fill-gaps') {
      const melodyBeats = new Set(barMelody.map(e => e.beat));
      halfBeatCandidates.forEach(b => { if (!melodyBeats.has(b)) candidates.push(b); });
    } else if (countermelodyTiming === 'offbeats') {
      candidates = halfBeatCandidates.filter(b => b % 1 !== 0);
    } else if (countermelodyTiming === 'end-of-phrase') {
      candidates = halfBeatCandidates.filter(b => b >= Math.max(1, beatsPerBar - 1));
    } else if (countermelodyTiming === 'every-2-bars') {
      if (bar % 2 === 0) candidates = wholeBeatCandidates;
    } else {
      candidates = wholeBeatCandidates; // constant-hook or default
    }

    candidates.forEach(beat => {
      if (Math.random() > keepThreshold) return;

      // Determine register offset
      let registerOffset = 60; // Same
      if (countermelodyRegister === 'above') registerOffset = 72;
      if (countermelodyRegister === 'below') registerOffset = 48;
      if (countermelodyRegister === 'sparkle') registerOffset = 84;

      // Select Pitch
      let midi;
      const melodyAtBeat = barMelody.find(e => Math.abs(e.beat - beat) < 0.1);

      if (countermelodyRole === 'harmony' && melodyAtBeat) {
        // Shadow melody in thirds or sixths
        const interval = Math.random() > 0.5 ? 4 : 7;
        midi = melodyAtBeat.midi + (countermelodyRegister === 'below' ? -interval : interval);
      } else if (countermelodyMotion === 'chord-tone') {
        midi = chordTones[Math.floor(Math.random() * chordTones.length)] + registerOffset - 48;
      } else if (countermelodyMotion === 'pentatonic') {
        midi = pentatonic[Math.floor(Math.random() * pentatonic.length)] + registerOffset - 48;
      } else if (countermelodyMotion === 'arpeggio') {
        const offset = [0, 4, 7, 12][Math.floor(beat - 1) % 4];
        midi = chordTones[0] + offset + registerOffset - 48;
      } else if (countermelodyMotion === 'leaping-hook') {
        const leaps = [0, 7, 12, 5];
        midi = chordTones[0] + leaps[Math.floor(Math.random() * leaps.length)] + registerOffset - 48;
      } else {
        // Stepwise or default
        midi = scale[Math.floor(Math.random() * scale.length)] + registerOffset - 48;
      }

      // Call-response: alternate strongly if role matches
      if (countermelodyRole === 'call-response' && barMelody.length > 0) {
        const earliestMelody = Math.min(...barMelody.map(e => e.beat));
        const latestMelody = Math.max(...barMelody.map(e => e.beat));
        // If melody is in first half, play in second half, and vice versa
        if (earliestMelody < 2.5 && beat < 2.5) return;
        if (latestMelody >= 2.5 && beat >= 2.5) return;
      }

      const durationBeats = countermelodyRole === 'sparkle' ? 0.2 : 0.45;

      events.push({
        track: 'countermelody',
        bar,
        beat,
        durationBeats,
        midi,
        velocity: 0.35,
        label: Theory.getNoteName(midi)
      });
    });
  }

  return events;
}

function generateDrums(patch) {
  const events = [];
  const { bars, groove } = patch;
  const beatsPerBar = patch.meter || 4;
  for (let bar = 1; bar <= bars; bar += 1) {
    for (let beat = 1; beat < beatsPerBar + 1; beat += 0.5) {
      if (beat === 1 || (beat === 3 && groove !== 'half-time')) {
        events.push({ track: 'drums', bar, beat, durationBeats: 0.1, drum: 'kick', velocity: 0.8, label: 'K' });
      }
      if (beat === 2 || beat === beatsPerBar) {
        events.push({ track: 'drums', bar, beat, durationBeats: 0.1, drum: 'snare', velocity: 0.6, label: 'S' });
      }
      if (groove === 'driving-eighths' || Math.random() > 0.3) {
        events.push({ track: 'drums', bar, beat, durationBeats: 0.05, drum: 'hihat', velocity: 0.3, label: 'H' });
      }
    }
  }
  return events;
}
