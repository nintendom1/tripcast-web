import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clonePatch,
  createDefaultPatch,
  generateAll,
  getExportablePatch,
  normalizePatch,
  regenerateTrack,
  removeEvent,
  setPatchField,
  setProgression,
  setTargetDuration,
  TRACKS,
  updateEvent
} from './generator.js';
import { getAudioContext, initAudio, playNoise, playOsc, resumeAudio, stopAudio } from './audioEngine.js';
import { getProgressionOptions, Theory } from './theory.js';

const STORAGE_KEY = 'music-sketchpad:vite-react:v1';
const LOCKS_STORAGE_KEY = 'music-sketchpad:preset-locks:v1';
const STEP_IDS = ['setup', 'scale', 'drums', 'bass', 'chords', 'melody', 'countermelody', 'lanes', 'theory', 'export'];
const STEPS = [
  { id: 'setup', label: 'Setup' },
  { id: 'scale', label: 'Scale' },
  { id: 'drums', label: 'Drums' },
  { id: 'bass', label: 'Bass' },
  { id: 'chords', label: 'Chords' },
  { id: 'melody', label: 'Melody' },
  { id: 'countermelody', label: 'Countermelody' },
  { id: 'lanes', label: 'Lanes' },
  { id: 'theory', label: 'Theory' },
  { id: 'export', label: 'Export' }
];
const PRESET_LOCKS = {
  meter: { paths: ['meter', 'whyMeter'] },
  key: { paths: ['key', 'whyKey'] },
  bpm: { paths: ['bpm', 'whyBpm'] },
  bars: { paths: ['bars', 'whyBars', 'whyDuration'] },
  mode: { paths: ['mode', 'whyMode'] },
  progression: { paths: ['progression', 'whyProgression'] },
  groove: { paths: ['groove', 'whyGroove'] },
  drumsInstrument: { paths: ['tracks.drums.instrument', 'tracks.drums.whyInstrument'] },
  bassPattern: { paths: ['bassPattern', 'whyBassPattern'] },
  bassInstrument: { paths: ['tracks.bass.instrument', 'tracks.bass.whyInstrument'] },
  voicing: { paths: ['voicing', 'whyVoicing'] },
  chordsInstrument: { paths: ['tracks.chords.instrument', 'tracks.chords.whyInstrument'] },
  melodyStyle: { paths: ['melodyStyle', 'whyMelodyStyle'] },
  melodyRhythm: { paths: ['melodyRhythm', 'whyMelodyRhythm'] },
  melodyDensity: { paths: ['melodyDensity', 'whyMelodyDensity'] },
  articulation: { paths: ['articulation', 'whyArticulation'] },
  arrangement: { paths: ['arrangement', 'whyArrangement'] },
  melodyInstrument: { paths: ['tracks.melody.instrument', 'tracks.melody.whyInstrument'] },
  countermelodyEnabled: { paths: ['tracks.countermelody.enabled'] },
  countermelodyReason: { paths: ['whyCountermelody'] },
  countermelodyRole: { paths: ['countermelodyRole', 'whyCountermelodyRole'] },
  countermelodyTiming: { paths: ['countermelodyTiming', 'whyCountermelodyTiming'] },
  countermelodyDensity: { paths: ['countermelodyDensity', 'whyCountermelodyDensity'] },
  countermelodyRegister: { paths: ['countermelodyRegister', 'whyCountermelodyRegister'] },
  countermelodyMotion: { paths: ['countermelodyMotion', 'whyCountermelodyMotion'] },
  countermelodyInstrument: { paths: ['tracks.countermelody.instrument'] },
  countermelodyVolume: { paths: ['tracks.countermelody.volume'] },
  trackLockDrums: { paths: ['tracks.drums', 'groove', 'whyGroove'] },
  trackLockBass: { paths: ['tracks.bass', 'bassPattern', 'whyBassPattern'] },
  trackLockChords: { paths: ['tracks.chords', 'voicing', 'whyVoicing'] },
  trackLockMelody: { paths: ['tracks.melody', 'melodyStyle', 'whyMelodyStyle', 'melodyRhythm', 'whyMelodyRhythm', 'melodyDensity', 'whyMelodyDensity', 'articulation', 'whyArticulation', 'arrangement', 'whyArrangement'] },
  trackLockCountermelody: { paths: ['tracks.countermelody', 'whyCountermelody', 'countermelodyRole', 'whyCountermelodyRole', 'countermelodyTiming', 'whyCountermelodyTiming', 'countermelodyDensity', 'whyCountermelodyDensity', 'countermelodyRegister', 'whyCountermelodyRegister', 'countermelodyMotion', 'whyCountermelodyMotion'] }
};
const TRACK_LOCK_IDS = {
  drums: 'trackLockDrums',
  bass: 'trackLockBass',
  chords: 'trackLockChords',
  melody: 'trackLockMelody',
  countermelody: 'trackLockCountermelody'
};
const CONTROL_TRACK_LOCKS = {
  groove: 'drums',
  drumsInstrument: 'drums',
  bassPattern: 'bass',
  bassInstrument: 'bass',
  voicing: 'chords',
  chordsInstrument: 'chords',
  melodyStyle: 'melody',
  melodyRhythm: 'melody',
  melodyDensity: 'melody',
  articulation: 'melody',
  arrangement: 'melody',
  melodyInstrument: 'melody',
  countermelodyEnabled: 'countermelody',
  countermelodyReason: 'countermelody',
  countermelodyRole: 'countermelody',
  countermelodyTiming: 'countermelody',
  countermelodyDensity: 'countermelody',
  countermelodyRegister: 'countermelody',
  countermelodyMotion: 'countermelody',
  countermelodyInstrument: 'countermelody',
  countermelodyVolume: 'countermelody'
};
const FIELD_LOCK_IDS = {
  groove: 'groove',
  whyGroove: 'groove',
  bassPattern: 'bassPattern',
  whyBassPattern: 'bassPattern',
  voicing: 'voicing',
  whyVoicing: 'voicing',
  melodyStyle: 'melodyStyle',
  whyMelodyStyle: 'melodyStyle',
  melodyRhythm: 'melodyRhythm',
  whyMelodyRhythm: 'melodyRhythm',
  melodyDensity: 'melodyDensity',
  whyMelodyDensity: 'melodyDensity',
  articulation: 'articulation',
  whyArticulation: 'articulation',
  arrangement: 'arrangement',
  whyArrangement: 'arrangement',
  whyCountermelody: 'countermelodyReason',
  countermelodyRole: 'countermelodyRole',
  whyCountermelodyRole: 'countermelodyRole',
  countermelodyTiming: 'countermelodyTiming',
  whyCountermelodyTiming: 'countermelodyTiming',
  countermelodyDensity: 'countermelodyDensity',
  whyCountermelodyDensity: 'countermelodyDensity',
  countermelodyRegister: 'countermelodyRegister',
  whyCountermelodyRegister: 'countermelodyRegister',
  countermelodyMotion: 'countermelodyMotion',
  whyCountermelodyMotion: 'countermelodyMotion'
};
const TRACK_FIELD_LOCK_IDS = {
  drums: { instrument: 'drumsInstrument', whyInstrument: 'drumsInstrument' },
  bass: { instrument: 'bassInstrument', whyInstrument: 'bassInstrument' },
  chords: { instrument: 'chordsInstrument', whyInstrument: 'chordsInstrument' },
  melody: { instrument: 'melodyInstrument', whyInstrument: 'melodyInstrument' },
  countermelody: { enabled: 'countermelodyEnabled', instrument: 'countermelodyInstrument', volume: 'countermelodyVolume' }
};
const REGENERATING_PRESET_LOCKS = new Set([
  'meter',
  'key',
  'bars',
  'mode',
  'progression',
  'groove',
  'bassPattern',
  'voicing',
  'melodyStyle',
  'melodyRhythm',
  'melodyDensity',
  'countermelodyRole',
  'countermelodyTiming',
  'countermelodyDensity',
  'countermelodyRegister',
  'countermelodyMotion'
]);
const MODES = [
  ['ionian', 'Major (Happy/Neutral)'],
  ['aeolian', 'Natural Minor (Sad/Serious)'],
  ['dorian', 'Dorian (Funky/Mystery)'],
  ['mixolydian', 'Mixolydian (Bluesy/Adventure)'],
  ['phrygian', 'Phrygian (Dark/Tension)'],
  ['majorPentatonic', 'Major Pentatonic (Simple/Open)'],
  ['minorPentatonic', 'Minor Pentatonic (Rock/Blues)'],
  ['blues', 'Blues Scale (Gritty)']
];
const VOICING_INFO = {
  triads: 'Standard 1-3-5 chords. Stable and clear.',
  power: 'Root and 5th only. Bold, heavy, and synth-rock friendly.',
  suspended: 'Replaces the 3rd with the 4th for open tension.',
  add9: 'Adds a 9th for a lush modern color.',
  sevenths: 'Adds the 7th for a jazzier pull.'
};
const BASS_VIZ = {
  'root-pulse': '𝅘𝅥 . 𝅘𝅥 . 𝅘𝅥 . 𝅘𝅥 .',
  'root-fifth-octave': '1 . 5 . 8 . 5 .',
  'walking': '1 3 5 6 5 3 2 7',
  'pedal-drone': '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯',
  'arpeggio': '1 3 5 8 5 3 1'
};
const GROOVE_VIZ = {
  'straight': 'K . S . K . S .',
  'driving-eighths': 'K+H+S+H+K+H+S+H+',
  'syncopated': 'K . . S . . K .',
  'half-time': 'K . . . S . . .',
  'shuffle': 'K . s K . s K . s'
};
const MELODY_VIZ = {
  'chord-tone-hook': '1--3-5--', 'stepwise': '1234321-', 'pentatonic-hook': '1-3-4-5-', 'sparse-motif': '1---5---', 'sparkle-notes': '8--7--6--'
};
const ARTICULATIONS = {
  staccato: 0.3,
  standard: 0.75,
  legato: 1.0,
  varied: 'varied'
};
const SYMPHONIC_PRESET_TEMPLATE = {
  name: 'Symphonic Hero',
  bpm: 82,
  bars: 8,
  meter: 4,
  key: 'D',
  mode: 'aeolian',
  progression: ['i', 'VI', 'III', 'VII'],
  bassPattern: 'pedal-drone',
  melodyRhythm: 'sparse',
  melodyDensity: 'low',
  countermelodyRole: 'harmony',
  countermelodyTiming: 'end-of-phrase',
  countermelodyDensity: 'low',
  countermelodyRegister: 'above',
  countermelodyMotion: 'chord-tone',
  voicing: 'sevenths',
  groove: 'half-time',
  melodyStyle: 'sparse-motif',
  arrangement: 'build-up',
  articulation: 'legato',
  bassInstrument: 'sub-bass',
  countermelodyInstrument: 'warm-pad',
  whyBassInstrument: 'A deep sub-bass creates an atmospheric orchestral foundation.',
  chordsInstrument: 'warm-pad',
  whyChordsInstrument: 'Slow-attacking pads simulate the organic swell of a string section.',
  melodyInstrument: 'bright-lead',
  whyMelodyInstrument: 'A clear lead sound cuts through the lush symphonic backing.',
  drumsInstrument: 'acoustic-studio',
  whyDrumsInstrument: 'Natural drum sounds provide a grounded, cinematic percussion feel.',
  whyMeter: '4/4 provides the standard rhythmic foundation for cinematic themes.',
  whyKey: 'D is a common orchestral key that resonates well with virtual strings.',
  whyBpm: 'Slow tempo creates a sense of grandeur and cinematic weight.',
  whyMode: 'Aeolian (Natural Minor) provides a serious and heroic atmosphere.',
  whyProgression: 'A classic epic progression (i-VI-III-VII) used in film scores.',
  whyBassPattern: 'A pedal drone keeps the harmonic foundation steady and atmospheric.',
  whyVoicing: 'Sevenths add harmonic richness and a sophisticated orchestral feel.',
  whyGroove: 'Half-time groove allows the melodies space to breathe and feel large.',
  whyMelodyStyle: 'Sparse motifs allow the orchestration to shine without overcrowding.',
  whyMelodyRhythm: 'Sparse rhythm creates long, open melodic gestures that leave room for cinematic chords and bass drone.',
  whyMelodyDensity: 'Low density keeps the melody restrained so the loop feels broad and orchestral instead of busy.',
  whyCountermelody: 'Adds a supporting upper line that makes the theme feel broader without distracting from the main melody.',
  whyArrangement: 'Building up from nothing to a full ensemble is a staple hero theme trope.',
  whyPalette: 'Warm soft synths simulate the organic warmth of a string section.',
  whyArticulation: 'Legato holds notes for their full duration, simulating a flowing string section.'
};
const MOZART_PRESET_TEMPLATE = {
  name: 'Mozart Symphony No. 40',
  bpm: 124,
  bars: 8,
  meter: 4,
  key: 'G',
  mode: 'aeolian',
  progression: ['i', 'iv', 'V', 'i'],
  bassPattern: 'root-pulse',
  melodyRhythm: 'short-short-long',
  melodyDensity: 'high',
  countermelodyRole: 'harmony',
  countermelodyTiming: 'end-of-phrase',
  countermelodyDensity: 'medium',
  countermelodyRegister: 'above',
  countermelodyMotion: 'stepwise',
  voicing: 'triads',
  groove: 'straight',
  melodyStyle: 'stepwise',
  arrangement: 'loop-only',
  articulation: 'standard',
  bassInstrument: 'tri-wave',
  countermelodyInstrument: 'sine-wave',
  whyBassInstrument: 'Simple triangle waves provide a clean Classical-style bass presence.',
  chordsInstrument: 'sine-wave',
  whyChordsInstrument: 'Pure sine tones avoid harmonic clashing in traditional triads.',
  melodyInstrument: 'sine-wave',
  whyMelodyInstrument: 'Clean tones replicate the purity of Classical melodic lines.',
  drumsInstrument: 'acoustic-studio',
  whyDrumsInstrument: 'Traditional percussion keeps the focus on the harmonic structure.',
  whyMeter: 'Standard 4/4 meter for a driving Classical allegro.',
  whyKey: 'G is the original key designated by Mozart for this symphony.',
  whyBpm: '124 BPM matches the Molto Allegro spirit of the original work.',
  whyMode: 'G Minor (Aeolian) is the iconic key of this restless, emotional piece.',
  whyProgression: 'A standard i-iv-V-i cycle represents Classical functional harmony.',
  whyBassPattern: 'Constant eighth-note pulses drive the nervous energy of the strings.',
  whyVoicing: 'Triads are the bedrock of the Classical period\'s harmonic clarity.',
  whyGroove: 'Straight timing keeps the rhythm formal and disciplined.',
  whyMelodyStyle: 'Stepwise motion replicates the elegant, singing violin lines.',
  whyMelodyRhythm: 'Short-short-long rhythm gives the generated melody a clear Classical motif shape with visibly varied note lengths.',
  whyMelodyDensity: 'High density supports the restless, active violin-line feel associated with the source style.',
  whyCountermelody: 'Classical-style supporting motion helps the melody feel like an ensemble rather than a single line.',
  whyArrangement: 'Simple loop focusing on the primary theme exposure.',
  whyPalette: 'A clean, neutral sound avoids electronic artifacts to respect the source.',
  whyArticulation: 'Standard articulation provides a clear, rhythmic bounce typical of Classical strings.'
};
const CYBERPUNK_PRESET_TEMPLATE = {
  name: 'Cyberpunk Pulse',
  bpm: 130,
  bars: 8,
  meter: 4,
  key: 'F#',
  mode: 'phrygian',
  progression: ['i', 'ii', 'i', 'VI'],
  bassPattern: 'root-pulse',
  melodyRhythm: 'syncopated',
  melodyDensity: 'medium',
  countermelodyRole: 'hook',
  countermelodyTiming: 'every-2-bars',
  countermelodyDensity: 'medium',
  countermelodyRegister: 'above',
  countermelodyMotion: 'leaping-hook',
  voicing: 'power',
  groove: 'driving-eighths',
  melodyStyle: 'sparse-motif',
  arrangement: 'loop-only',
  articulation: 'staccato',
  bassInstrument: 'square-wave',
  countermelodyInstrument: 'bright-lead',
  whyBassInstrument: 'Aggressive square waves provide the grit needed for industrial bass.',
  chordsInstrument: 'saw-wave',
  whyChordsInstrument: 'Buzzy saw waves create a thick, synth-rock wall of sound.',
  melodyInstrument: 'bright-lead',
  whyMelodyInstrument: 'A sharp lead cuts through the dense electronic texture.',
  drumsInstrument: 'bit-crushed-lofi',
  whyDrumsInstrument: 'Low-fidelity drums emphasize the gritty, dystopian atmosphere.',
  whyBpm: 'Fast BPM for high-stakes action and electronic urgency.',
  whyKey: 'F# provides a sharp, metallic feel associated with industrial sounds.',
  whyMode: 'Phrygian creates the dark tension characteristic of dystopias.',
  whyProgression: 'Focusing on i and ii (flat second) emphasizes the Phrygian grit.',
  whyBassPattern: 'Driving pulses create a mechanical, synthwave-inspired foundation.',
  whyVoicing: 'Power chords provide a thick, industrial wall of sound.',
  whyGroove: 'Driving eighths mimic the relentless beat of a chase scene.',
  whyMelodyStyle: 'Repetitive motifs emphasize rhythm over melody.',
  whyMelodyRhythm: 'Syncopated rhythm places generated notes around the beat for mechanical tension and forward motion.',
  whyMelodyDensity: 'Medium density keeps the hook punchy without overcrowding the driving bass and drums.',
  whyCountermelody: 'A repeated electronic hook adds identity and urgency above the driving bass and drums.',
  whyPalette: 'Retro square waves provide the crunch of analog synths.',
  whyArticulation: 'Staccato notes sound like a precise, mechanical synthesizer pulse.'
};
const LOFI_GARDEN_PRESET_TEMPLATE = {
  name: 'Lofi Garden',
  bpm: 84,
  bars: 8,
  meter: 4,
  key: 'C',
  mode: 'dorian',
  progression: ['ii', 'V', 'I', 'IV'],
  bassPattern: 'walking',
  melodyRhythm: 'mixed-values',
  melodyDensity: 'medium',
  countermelodyRole: 'sparkle',
  countermelodyTiming: 'offbeats',
  countermelodyDensity: 'low',
  countermelodyRegister: 'sparkle',
  countermelodyMotion: 'pentatonic',
  voicing: 'add9',
  groove: 'shuffle',
  melodyStyle: 'stepwise',
  arrangement: 'calm-exploration',
  articulation: 'varied',
  bassInstrument: 'sub-bass',
  countermelodyInstrument: 'sine-wave',
  whyBassInstrument: 'Muffled bass allows the complex jazz chords to shine.',
  chordsInstrument: 'electric-piano',
  whyChordsInstrument: 'Electric piano tones provide the classic dreamy lofi texture.',
  melodyInstrument: 'warm-pad',
  whyMelodyInstrument: 'Soft, slow-attacking notes create a relaxed melodic feel.',
  drumsInstrument: 'bit-crushed-lofi',
  whyDrumsInstrument: 'Vintage, crunchy drums are a staple of the lofi sound.',
  whyBpm: 'Lower BPM for a relaxed, chilled out atmosphere.',
  whyKey: 'C is a neutral home base that allows jazzy voicings to shine.',
  whyMode: 'Dorian adds a jazzy, slightly more optimistic minor flavor.',
  whyProgression: 'A ii-V-I-IV jazz turnaround is essential for the lofi sound.',
  whyBassPattern: 'A walking bass line adds a human, acoustic jazz feel.',
  whyVoicing: 'Add 9 chords provide that signature lush, dreamy lofi texture.',
  whyGroove: 'Shuffle adds swing and a laid-back, imperfect human feel.',
  whyMelodyStyle: 'Stepwise melodies feel natural and improvisational.',
  whyMelodyRhythm: 'Mixed note values create a relaxed, improvised melodic feel with natural variation in generated lengths.',
  whyMelodyDensity: 'Medium density leaves breathing room for lush chords while still providing enough notes to feel melodic.',
  whyCountermelody: 'Small decorative notes add movement while preserving the relaxed groove.',
  whyPalette: 'Soft filtered synths reduce harshness for easy listening.',
  whyArticulation: 'Varied articulation randomizes note lengths to simulate a live player\'s touch.'
};
const MOONLIT_PIANO_PRESET_TEMPLATE = {
  name: 'Moonlit Piano',
  bpm: 72,
  bars: 16,
  meter: 3,
  key: 'C#',
  mode: 'ionian',
  progression: ['I', 'iii', 'vi', 'IV'],
  bassPattern: 'arpeggio',
  melodyRhythm: 'sparse',
  melodyDensity: 'low',
  countermelodyRole: 'sparkle',
  countermelodyTiming: 'offbeats',
  countermelodyDensity: 'low',
  countermelodyRegister: 'sparkle',
  countermelodyMotion: 'arpeggio',
  voicing: 'add9',
  groove: 'straight',
  melodyStyle: 'stepwise',
  arrangement: 'calm-exploration',
  articulation: 'legato',
  bassInstrument: 'acoustic-piano',
  whyBassInstrument: 'Low broken piano tones create a rolling left-hand foundation.',
  countermelodyInstrument: 'acoustic-piano',
  whyCountermelodyInstrument: 'High piano sparkles suggest the moonlit shimmer of the source style.',
  chordsInstrument: 'acoustic-piano',
  whyChordsInstrument: 'Soft acoustic piano chords keep the preset intimate and impressionistic.',
  melodyInstrument: 'acoustic-piano',
  whyMelodyInstrument: 'A gentle piano lead keeps the focus on lyrical phrasing.',
  drumsInstrument: 'acoustic-studio',
  whyDrumsInstrument: 'Drums are disabled so the preset remains solo piano.',
  whyMeter: '3/4 gives the loop a slow, swaying piano feel.',
  whyKey: 'C# stands in for Db, the original key area associated with Clair de Lune.',
  whyBpm: 'Slow tempo leaves space for quiet, expressive piano phrases.',
  whyMode: 'Major harmony supports the luminous, reflective mood.',
  whyProgression: 'I-iii-vi-IV gives the loop soft harmonic motion without a hard cadence.',
  whyBassPattern: 'Arpeggios mimic broken left-hand piano movement.',
  whyVoicing: 'Add 9 chords provide a suspended, impressionistic color.',
  whyGroove: 'Straight timing keeps the piano phrases clear and unhurried.',
  whyMelodyStyle: 'Stepwise motion creates a singing line instead of a hook.',
  whyMelodyRhythm: 'Sparse rhythm lets notes linger like a slow piano nocturne.',
  whyMelodyDensity: 'Low density preserves the quiet, spacious character.',
  whyCountermelody: 'Small high-register figures add shimmer without turning into a second lead.',
  whyArrangement: 'Calm exploration suits a reflective solo piano preset.',
  whyPalette: 'A single acoustic piano color keeps the preset focused on touch and harmony.',
  whyArticulation: 'Legato connects notes smoothly for a flowing piano texture.'
};

function getPathValue(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function setPathValue(target, path, value) {
  const parts = path.split('.');
  let node = target;
  parts.slice(0, -1).forEach((key) => {
    node = node[key];
  });
  node[parts[parts.length - 1]] = clonePatch(value);
}

function applyPresetLocks(presetPatch, currentPatch, lockedOptions) {
  const activeLockIds = Object.keys(lockedOptions).filter((id) => lockedOptions[id]);
  if (activeLockIds.length === 0) return presetPatch;

  const next = clonePatch(presetPatch);
  activeLockIds.forEach((id) => {
    const config = PRESET_LOCKS[id];
    if (!config) return;
    config.paths.forEach((path) => {
      const currentValue = getPathValue(currentPatch, path);
      if (currentValue !== undefined) setPathValue(next, path, currentValue);
    });
  });
  if (!activeLockIds.some((id) => REGENERATING_PRESET_LOCKS.has(id))) return next;

  const regenerated = generateAll(next);
  activeLockIds.forEach((id) => {
    const config = PRESET_LOCKS[id];
    if (!config) return;
    config.paths.forEach((path) => {
      const currentValue = getPathValue(currentPatch, path);
      if (currentValue !== undefined) setPathValue(regenerated, path, currentValue);
    });
  });
  return regenerated;
}

function loadStoredLocks() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCKS_STORAGE_KEY) || '{}');
    return Object.keys(stored).reduce((locks, id) => {
      if (PRESET_LOCKS[id] && stored[id]) locks[id] = true;
      return locks;
    }, {});
  } catch {
    return {};
  }
}

function App() {
  const [patch, setPatch] = useState(() => createDefaultPatch());
  const [logging, setLogging] = useState(() => localStorage.getItem('music_sketchpad_debug') === 'true');
  const [step, setStep] = useState('setup');
  const [activeTrack, setActiveTrack] = useState('melody');
  const [status, setStatus] = useState('01.1.00');
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentBar, setCurrentBar] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [scrubSignal, setScrubSignal] = useState(0);
  const [previewing, setPreviewing] = useState(null);
  const [activeNotes, setActiveNotes] = useState([]);
  const [patchText, setPatchText] = useState('');
  const [message, setMessage] = useState('');
  const [presets, setPresets] = useState({});
  const [lockedOptions, setLockedOptions] = useState(() => loadStoredLocks());
  const startTimeRef = useRef(0);
  const playbackOffsetRef = useRef(0);
  const rafRef = useRef(null);
  const noteTimeoutsRef = useRef([]);

  const duration = useMemo(() => (patch.bars * (patch.meter || 4) * 60) / patch.bpm, [patch.bars, patch.bpm, patch.meter]);
  const progressionOptions = useMemo(() => getProgressionOptions(patch.mode), [patch.mode]);
  const scaleNotes = useMemo(() => Theory.getScale(patch.key, patch.mode).map((midi) => Theory.notes[((midi % 12) + 12) % 12]), [patch.key, patch.mode]);
  const theoryText = useMemo(() => buildTheoryText(patch), [patch]);
  const activeStepIndex = STEP_IDS.indexOf(step);

  // Logger Utility
  const log = (type, msg) => {
    if (logging) console.log(`[${type.toUpperCase()}]: ${msg}`);
  };

  useEffect(() => {
    setPatchText(JSON.stringify(patch, null, 2));
  }, [patch]);

  useEffect(() => {
    localStorage.setItem('music_sketchpad_debug', logging);
  }, [logging]);

  useEffect(() => {
    localStorage.setItem(LOCKS_STORAGE_KEY, JSON.stringify(lockedOptions));
  }, [lockedOptions]);

  useEffect(() => {
    refreshPresets();
    return clearPlaybackResources;
  }, []);

  // Log View Changes
  useEffect(() => { log('view', `${step} (track: ${activeTrack})`); }, [step, activeTrack]);

  function flash(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2500);
  }

  function refreshPresets() {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    
    const makePreset = (template, volumesMap, drumsEnabled = true) => {
      let p = createDefaultPatch();
      Object.assign(p, template);
      TRACKS.forEach(t => {
        const label = t.charAt(0).toUpperCase() + t.slice(1);
        if (template[`${t}Instrument`]) p.tracks[t].instrument = template[`${t}Instrument`];
        if (template[`why${label}Instrument`]) p.tracks[t].whyInstrument = template[`why${label}Instrument`];
        if (volumesMap[t] !== undefined) p.tracks[t].volume = volumesMap[t];
      });
      p.tracks.drums.enabled = drumsEnabled;
      return generateAll(p);
    };

    const symphonic = makePreset(SYMPHONIC_PRESET_TEMPLATE, { melody: 0.7, countermelody: 0.25, chords: 0.5, bass: 0.8, drums: 0.3 });
    const mozart = makePreset(MOZART_PRESET_TEMPLATE, { melody: 0.8, countermelody: 0.25, chords: 0.4, bass: 0.7, drums: 0.0 }, false);
    const cyberpunk = makePreset(CYBERPUNK_PRESET_TEMPLATE, { melody: 0.6, countermelody: 0.3, chords: 0.5, bass: 0.9, drums: 0.8 });
    const lofi = makePreset(LOFI_GARDEN_PRESET_TEMPLATE, { melody: 0.5, countermelody: 0.2, chords: 0.7, bass: 0.6, drums: 0.4 });
    const moonlitPiano = makePreset(MOONLIT_PIANO_PRESET_TEMPLATE, { melody: 0.45, countermelody: 0.18, chords: 0.35, bass: 0.35, drums: 0.0 }, false);

    setPresets({ 
      [SYMPHONIC_PRESET_TEMPLATE.name]: symphonic, 
      [MOZART_PRESET_TEMPLATE.name]: mozart,
      [CYBERPUNK_PRESET_TEMPLATE.name]: cyberpunk,
      [LOFI_GARDEN_PRESET_TEMPLATE.name]: lofi,
      [MOONLIT_PIANO_PRESET_TEMPLATE.name]: moonlitPiano,
      ...stored 
    });
  }

  function changeField(field, value) {
    const lockId = FIELD_LOCK_IDS[field];
    if (lockId && isControlDisabled(lockId)) return;
    stopPlayback();
    log('act', `changed ${field} to ${value}`);
    setPatch((current) => setPatchField(current, field, value));
  }

  function changeTrackField(track, field, value) {
    const lockId = TRACK_FIELD_LOCK_IDS[track]?.[field];
    if ((lockId && isControlDisabled(lockId)) || isTrackCategoryLocked(track)) return;
    stopPlayback();
    log('act', `changed ${track}.${field} to ${value}`);
    setPatch((current) => ({ ...current, tracks: { ...current.tracks, [track]: { ...current.tracks[track], [field]: value } } }));
  }

  function regenerateAll() {
    stopPlayback();
    log('act', 'pushed "Regenerate All"');
    setPatch((current) => applyPresetLocks(generateAll(current), current, lockedOptions));
  }

  function updateCurrentEvent(index, field, value) {
    if (isTrackCategoryLocked(activeTrack)) return;
    setPatch((current) => updateEvent(current, activeTrack, index, field, value));
  }

  function removeCurrentEvent(index) {
    if (isTrackCategoryLocked(activeTrack)) return;
    stopPlayback();
    setPatch((current) => removeEvent(current, activeTrack, index));
  }

  function isLocked(id) {
    return Boolean(lockedOptions[id]);
  }

  function toggleLock(id) {
    setLockedOptions((current) => ({ ...current, [id]: !current[id] }));
  }

  function isTrackCategoryLocked(track) {
    return Boolean(lockedOptions[TRACK_LOCK_IDS[track]]);
  }

  function toggleTrackCategoryLock(track) {
    toggleLock(TRACK_LOCK_IDS[track]);
  }

  function isControlDisabled(id) {
    const track = CONTROL_TRACK_LOCKS[id];
    return isLocked(id) || (track ? isTrackCategoryLocked(track) : false);
  }

  function lockProps(id) {
    return { lockId: id, locked: isLocked(id), disabled: isControlDisabled(id), onToggleLock: toggleLock };
  }

  function removeAllLocks() {
    setLockedOptions({});
    flash('Removed all locks.');
  }

  function setTimelinePosition(offsetSeconds) {
    const beatsPerBar = patch.meter || 4;
    const beatDur = 60 / patch.bpm;
    const totalDuration = patch.bars * beatsPerBar * beatDur;
    const boundedOffset = Math.max(0, Math.min(offsetSeconds, Math.max(totalDuration - 0.0001, 0)));
    const currentBeatTotal = boundedOffset / beatDur;
    const bar = Math.floor(currentBeatTotal / beatsPerBar) + 1;
    const beat = (currentBeatTotal % beatsPerBar) + 1;

    setPlayhead(Math.min(100, (boundedOffset / totalDuration) * 100));
    setCurrentBar(bar);
    setCurrentBeat(beat);
    setStatus(`${String(bar).padStart(2, '0')}.${Math.floor(beat)}.00`);
  }

  function scrubTimeline(percent) {
    if (isPlaying) {
      pausePlayback();
    }

    const beatsPerBar = patch.meter || 4;
    const totalBeats = patch.bars * beatsPerBar;
    const boundedPercent = Math.max(0, Math.min(100, percent));
    const beatPosition = Math.min((boundedPercent / 100) * totalBeats, totalBeats - 0.0001);
    const beatDur = 60 / patch.bpm;

    playbackOffsetRef.current = beatPosition * beatDur;
    setTimelinePosition(playbackOffsetRef.current);
    setScrubSignal((signal) => signal + 1);
  }

  function resetCurrentTrack() {
    if (isTrackCategoryLocked(activeTrack)) return;
    stopPlayback();
    log('act', `pushed "Regenerate ${activeTrack}"`);
    setPatch((current) => regenerateTrack(current, activeTrack));
  }

  function stopPlayback() {
    clearPlaybackResources();
    setIsPlaying(false);
    setIsPaused(false);
    setPreviewing(null);
    setStatus('01.1.00');
    setPlayhead(0);
    playbackOffsetRef.current = 0;
    setActiveNotes([]);
    setCurrentBar(0);
    setCurrentBeat(0);
    log('system', 'stop playback');
  }

  async function pausePlayback() {
    if (!isPlaying) return;
    log('act', 'pushed "Pause"');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playbackOffsetRef.current = Math.max(0, Math.min((Date.now() - startTimeRef.current) / 1000, duration));
    setTimelinePosition(playbackOffsetRef.current);
    noteTimeoutsRef.current.forEach(clearTimeout);
    noteTimeoutsRef.current = [];
    setActiveNotes([]);
    setIsPlaying(false);
    setIsPaused(true);
    const ctx = getAudioContext();
    if (ctx) await ctx.suspend();
  }

  function clearPlaybackResources() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    noteTimeoutsRef.current.forEach(clearTimeout);
    noteTimeoutsRef.current = [];
    log('system', 'clearPlaybackResources');
    stopAudio();
  }

  function highlightNote(midi, durationSeconds) {
    const noteName = Theory.notes[((midi % 12) + 12) % 12];
    setActiveNotes((notes) => [...new Set([...notes, noteName])]);
    const timeout = window.setTimeout(() => {
      setActiveNotes((notes) => notes.filter((note) => note !== noteName));
    }, durationSeconds * 1000);
    noteTimeoutsRef.current.push(timeout);
  }

  async function previewSetup() {
    log('act', 'pushed "Preview Tempo & Key"');
    stopPlayback();
    initAudio();
    await resumeAudio();
      log('act', 'resuming Audio');

    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const beatDur = 60 / patch.bpm;
    const rootMidi = Theory.notes.indexOf(patch.key) + 60; // Up an octave for better audibility
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.75 : (ARTICULATIONS[patch.articulation] || 0.75);

    const instId = patch.tracks.melody.instrument;
    for (let i = 0; i < 4; i++) {
      const startTime = now + i * beatDur;
      const dur = 0.2 * mult;
      playOsc(midiToFreq(rootMidi), startTime, dur, 0.6, instId);
      playNoise(startTime, 0.05, 0.2, 'kick', patch.tracks.drums.instrument);
      const delayMs = (startTime - now) * 1000;
      noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(rootMidi, dur), delayMs));
    }
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beatDur * 1000));
  }

  async function previewScale() {
    log('act', 'pushed "Preview Mode"');
    stopPlayback();
    initAudio();
    await resumeAudio();
    setPreviewing('scale');
    const ctx = getAudioContext();
    const scale = Theory.getScale(patch.key, patch.mode).map((midi) => midi + 60);
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.75 : (ARTICULATIONS[patch.articulation] || 0.75);

    const instId = patch.tracks.melody.instrument;
    [0, 2, 4].forEach((scaleIdx, i) => {
      const midi = scale[scaleIdx];
      const startDelay = i * 0.2;
      const dur = 0.6 * mult;
      playOsc(midiToFreq(midi), ctx.currentTime + startDelay, dur, 0.5, instId);
      const timeout = window.setTimeout(() => highlightNote(midi, dur), startDelay * 1000);
      noteTimeoutsRef.current.push(timeout);
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 1200));
  }

  async function previewProgression() {
    log('act', 'pushed "Preview Progression"');
    stopPlayback();
    initAudio();
    await resumeAudio();
    setPreviewing('progression');
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const beatDur = 60 / patch.bpm;
    const scale = Theory.getScale(patch.key, patch.mode).map((midi) => midi + 60);
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.75 : (ARTICULATIONS[patch.articulation] || 0.75);
    
    const degreeMap = { 'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6, 'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6 };

    const instId = patch.tracks.chords.instrument;
    patch.progression.forEach((numeral, i) => {
      const rootIdx = degreeMap[numeral.replace(/[^IViv]/g, '')] || 0;
      const chordIndices = [rootIdx, (rootIdx + 2) % 7, (rootIdx + 4) % 7];
      const startTime = now + i * beatDur;
      const dur = beatDur * 0.9 * mult;

      chordIndices.forEach((idx) => {
        const midi = scale[idx] + (idx < rootIdx ? 12 : 0);
        playOsc(midiToFreq(midi), startTime, dur, 0.4, instId);
        const delayMs = (startTime - now) * 1000;
        noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(midi, dur), delayMs));
      });
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), patch.progression.length * beatDur * 1000));
  }

  async function playLoop(soloTrack = null) {
    const beatsPerBar = patch.meter || 4;
    const beatDur = 60 / patch.bpm;
    const totalDuration = patch.bars * beatsPerBar * beatDur;
    const startOffset = isPaused ? playbackOffsetRef.current : 0;

    if (isPaused) {
      log('act', `pushed "Resume" (solo: ${soloTrack || 'none'})`);
      clearPlaybackResources();
      initAudio();
      await resumeAudio();
      setIsPaused(false);
    } else {
      log('act', `pushed "Play" (solo: ${soloTrack || 'none'})`);
      stopPlayback();
      initAudio();
      await resumeAudio();
    }

    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const tracksToPlay = soloTrack ? [soloTrack] : Object.keys(patch.tracks);

    tracksToPlay.forEach((trackName) => {
      const track = patch.tracks[trackName];
      if (!track?.enabled) return;
      track.events.forEach((event) => {
        const eventOffset = ((event.bar - 1) * beatsPerBar + (event.beat - 1)) * beatDur;
        if (eventOffset < startOffset) return;

        const startTime = now + eventOffset - startOffset;
        const mult = patch.articulation === 'varied' ? (0.3 + Math.random() * 0.6) : (ARTICULATIONS[patch.articulation] || 0.75);
        const dur = event.durationBeats * beatDur * mult;
        
        const startDelayMs = (startTime - now) * 1000;
        if (trackName === 'drums') {
          playNoise(startTime, dur, event.velocity * track.volume, event.drum, track.instrument);
        } else if (event.midis) {
          event.midis.forEach((midi) => {
            playOsc(midiToFreq(midi), startTime, dur, event.velocity * track.volume, track.instrument);
            noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(midi, dur), startDelayMs));
          });
        } else {
          playOsc(midiToFreq(event.midi), startTime, dur, event.velocity * track.volume, track.instrument);
          noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(event.midi, dur), startDelayMs));
        }
      });
    });

    playbackOffsetRef.current = startOffset;
    startTimeRef.current = Date.now() - startOffset * 1000;
    setIsPlaying(true);
    function tick() {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const currentBeatTotal = elapsed / beatDur;
      const bar = Math.floor(currentBeatTotal / beatsPerBar) + 1;
      const beat = (currentBeatTotal % beatsPerBar) + 1;
      
      setCurrentBar(bar);
      setCurrentBeat(beat);
      setPlayhead(Math.min(100, (elapsed / totalDuration) * 100));
      setStatus(`${String(bar).padStart(2, '0')}.${Math.floor(beat)}.00`);

      if (elapsed < totalDuration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        playbackOffsetRef.current = 0;
        playLoop(soloTrack);
      }
    }
    tick();
  }

  async function previewBass() {
    log('act', 'pushed "Preview Bass"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('bass');
    const ctx = getAudioContext(); 
    const beat = 60 / patch.bpm; 
    const root = Theory.notes.indexOf(patch.key) + 36;
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.7 : (ARTICULATIONS[patch.articulation] || 0.75);
    
    const instId = patch.tracks.bass.instrument;
    const play = (m, s, d) => {
      playOsc(midiToFreq(m), ctx.currentTime + s, d, 0.4, instId);
      noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(m, d), s * 1000));
    };
    if (patch.bassPattern === 'root-pulse') [0, 1, 2, 3].forEach(i => play(root, i * beat, beat * mult));
    else if (patch.bassPattern === 'root-fifth-octave') [root, root + 7, root + 12, root + 7].forEach((m, i) => play(m, i * beat, beat * mult));
    else play(root, 0, beat * 3.5 * mult);
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beat * 1000));
  }

  async function previewVoicing() {
    log('act', 'pushed "Preview Voicing"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('voicing');
    const ctx = getAudioContext(); const root = Theory.notes.indexOf(patch.key) + 60;
    const instId = patch.tracks.chords.instrument;
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.75 : (ARTICULATIONS[patch.articulation] || 0.75);
    let midis = [root, root + 4, root + 7];
    if (patch.voicing === 'power') midis = [root, root + 7, root + 12];
    else if (patch.voicing === 'suspended') midis = [root, root + 5, root + 7];
    else if (patch.voicing === 'add9') midis = [root, root + 4, root + 7, root + 14];
    else if (patch.voicing === 'sevenths') midis = [root, root + 4, root + 7, root + 11];
    midis.forEach((m, i) => {
      playOsc(midiToFreq(m), ctx.currentTime + i * 0.02, 1 * mult, 0.3, instId);
      highlightNote(m, 1);
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 1200));
  }

  async function previewGroove() {
    log('act', 'pushed "Preview Groove"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('groove');
    const instId = patch.tracks.drums.instrument;
    const beat = 60 / patch.bpm;
    for (let i = 0; i < 4; i++) {
      const time = getAudioContext().currentTime + i * beat;
      playNoise(time, 0.1, 0.8, 'kick', instId);
      if (patch.groove === 'driving-eighths' || patch.groove === 'shuffle') playNoise(time + beat / 2, 0.05, 0.1, 'hihat', instId);
    }
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beat * 1000));
  }

  async function previewMelody() {
    log('act', 'pushed "Preview Melody"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('melody');
    const instId = patch.tracks.melody.instrument;
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.8 : (ARTICULATIONS[patch.articulation] || 0.75);
    const beat = 60 / patch.bpm;
    const scale = Theory.getScale(patch.key, patch.mode).map(m => m + 72);
    [0, 1, 2, 3].forEach(i => {
      const midi = scale[i % scale.length];
      playOsc(midiToFreq(midi), getAudioContext().currentTime + i * beat, beat * mult, 0.3, instId);
      noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(midi, beat * mult), i * beat * 1000));
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beat * 1000));
  }

  async function previewCountermelody() {
    log('act', 'pushed "Preview Countermelody"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('countermelody');
    const instId = patch.tracks.countermelody.instrument;
    const beat = 60 / patch.bpm;
    const scale = Theory.getScale(patch.key, patch.mode).map(m => m + 72);
    [4, 3, 2, 1].forEach((scaleIdx, i) => {
      const midi = scale[scaleIdx % scale.length];
      playOsc(midiToFreq(midi), getAudioContext().currentTime + i * beat, beat * 0.5, 0.3, instId);
      noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(midi, beat * 0.5), i * beat * 1000));
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beat * 1000));
  }

  async function previewMelodyWithCountermelody() {
    log('act', 'pushed "Preview Melody + Countermelody"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('melody-countermelody');
    const mInst = patch.tracks.melody.instrument;
    const cInst = patch.tracks.countermelody.instrument;
    const beat = 60 / patch.bpm;
    const scale = Theory.getScale(patch.key, patch.mode);
    
    // Simple demo pattern
    const pattern = [
      { t: 'm', m: scale[0] + 60, s: 0 },
      { t: 'm', m: scale[2] + 60, s: 1 },
      { t: 'c', m: scale[4] + 72, s: 1.5 },
      { t: 'm', m: scale[4] + 60, s: 2 },
      { t: 'c', m: scale[2] + 72, s: 2.5 }
    ];

    pattern.forEach(p => {
      const inst = p.t === 'm' ? mInst : cInst;
      const vol = p.t === 'm' ? 0.4 : 0.25;
      playOsc(midiToFreq(p.m), getAudioContext().currentTime + p.s * beat, beat * 0.4, vol, inst);
      noteTimeoutsRef.current.push(window.setTimeout(() => highlightNote(p.m, beat * 0.4), p.s * beat * 1000));
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 4 * beat * 1000));
  }

  function useRolePreset(config) {
    log('act', `applied role preset ${config.role}`);
    setPatch(current => {
      const next = clonePatch(current);
      next.countermelodyRole = config.role;
      next.countermelodyTiming = config.timing;
      next.countermelodyDensity = config.density;
      next.countermelodyRegister = config.register;
      next.countermelodyMotion = config.motion;
      next.whyCountermelody = config.why;
      if (config.instrument) next.tracks.countermelody.instrument = config.instrument;
      next.tracks.countermelody.events = regenerateTrack(next, 'countermelody').tracks.countermelody.events;
      return next;
    });
    flash(`Applied ${config.name} role.`);
  }

  async function previewArrangement() {
    log('act', 'pushed "Preview Arrangement"');
    stopPlayback(); initAudio(); await resumeAudio();
    setPreviewing('arrangement');
    const root = Theory.notes.indexOf(patch.key) + 60;
    const mult = ARTICULATIONS[patch.articulation] === 'varied' ? 0.4 : (ARTICULATIONS[patch.articulation] * 0.4 || 0.3);
    [0, 2, 4, 7].forEach((step, i) => {
      playOsc(midiToFreq(root + step), getAudioContext().currentTime + i * 0.1, mult, 0.3, 'sine-wave');
    });
    noteTimeoutsRef.current.push(window.setTimeout(() => setPreviewing(null), 800));
  }

  async function copyPatch() {
    log('act', 'pushed "Copy Patch JSON"');
    await navigator.clipboard.writeText(JSON.stringify(getExportablePatch(patch)));
    flash('Patch JSON copied.');
  }

  async function copyPlayableJS() {
    // TODO: Replace this placeholder with a real standalone Web Audio patch exporter.
    log('act', 'pushed "Copy Playable JS"');
    await navigator.clipboard.writeText(`/* Playable Patch: ${patch.name} */ ...`);
    flash('Playable JS placeholder copied.');
  }

  function applyPatch() {
    try {
      stopPlayback();
      log('act', 'applied manual JSON patch');
      setPatch(normalizePatch(JSON.parse(patchText)));
      flash('Patch applied.');
    } catch (error) {
      flash(`Invalid patch: ${error.message}`);
    }
  }

  function savePreset() {
    const name = window.prompt('Preset Name:', patch.name);
    if (!name) return;
    log('act', `saved preset "${name}"`);
    const nextPatch = { ...patch, name };
    const nextPresets = { ...presets, [name]: nextPatch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPresets));
    setPatch(nextPatch);
    setPresets(nextPresets);
    flash(`Saved ${name}.`);
  }

  function loadPreset(name) {
    if (!name || !presets[name]) return;
    stopPlayback();
    log('act', `loaded preset "${name}"`);
    try {
      setPatch((current) => applyPresetLocks(normalizePatch(clonePatch(presets[name])), current, lockedOptions));
      flash(`Loaded ${name}.`);
    } catch (error) {
      flash(`Failed to load preset: ${error.message}`);
    }
  }

  function renderStep() {
    if (step === 'setup') {
      return (
        <section className="panel-grid">
          <div className="card">
            <h2>Composition Setup</h2>
            <Control label="Meter" explanation={patch.whyMeter} onExplanationChange={(v) => changeField('whyMeter', v)} {...lockProps('meter')}>
              <select value={patch.meter || 4} onChange={(event) => changeField('meter', parseInt(event.target.value))}>
                <option value="4">4/4 Standard</option>
                <option value="3">3/4 Waltz</option>
              </select>
              <p className="muted small">Most songs use 4/4. 3/4 feels like a dance.</p>
            </Control>
            <Control label="Key" explanation={patch.whyKey} onExplanationChange={(v) => changeField('whyKey', v)} {...lockProps('key')}>
              <select value={patch.key} onChange={(event) => changeField('key', event.target.value)}>
                {Theory.notes.map((note) => (
                  <option key={note} value={note}>{note}</option>
                ))}
              </select>
            </Control>
            <div className="inline-controls">
              <Control label="BPM" explanation={patch.whyBpm} onExplanationChange={(v) => changeField('whyBpm', v)} {...lockProps('bpm')}>
                <input type="number" min="40" max="220" value={patch.bpm} onChange={(event) => changeField('bpm', event.target.value)} />
              </Control>
              <Control label="Bars" explanation={patch.whyBars} onExplanationChange={(v) => changeField('whyBars', v)} {...lockProps('bars')}>
                <select value={patch.bars} onChange={(event) => changeField('bars', event.target.value)}>
                  {[4, 8, 16, 32].map((bars) => (
                    <option key={bars} value={bars}>{bars} Bars</option>
                  ))}
                </select>
              </Control>
            </div>
            <Control label="Target Duration" explanation={patch.whyDuration} onExplanationChange={(v) => changeField('whyDuration', v)} {...lockProps('bars')}>
              <input type="number" placeholder="e.g. 30" onBlur={(event) => setPatch((current) => setTargetDuration(current, event.target.value))} />
            </Control>
            <ScalePreview notes={scaleNotes} activeNotes={activeNotes} rootNote={patch.key} />
            <button className={`btn btn-secondary full ${previewing === 'setup' ? 'animating' : ''}`} onClick={previewSetup}>Preview Tempo & Key</button>
          </div>
          <LoopStats patch={patch} duration={duration} />
        </section>
      );
    }

    if (step === 'scale') {
      return (
        <section className="panel-grid">
          <div className="card">
            <h2>Scale & Harmony</h2>
            <Control label="Scale / Mode" explanation={patch.whyMode} onExplanationChange={(v) => changeField('whyMode', v)} {...lockProps('mode')}>
              <select value={patch.mode} onChange={(event) => changeField('mode', event.target.value)}>
                {MODES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Control>
            <Control label="Chord Progression" explanation={patch.whyProgression} onExplanationChange={(v) => changeField('whyProgression', v)} {...lockProps('progression')}>
              <select value={patch.progression.join('-')} onChange={(event) => setPatch((current) => setProgression(current, event.target.value))}>
                {progressionOptions.map((progression) => {
                  const value = progression.join('-');
                  return <option key={value} value={value}>{progression.join(' - ')} ({Theory.progressionLabels[value] || 'Custom'})</option>;
                })}
              </select>
            </Control>
            <ScalePreview notes={scaleNotes} activeNotes={activeNotes} rootNote={patch.key} />
            <button className={`btn btn-secondary full ${previewing === 'scale' ? 'animating' : ''}`} onClick={previewScale}>Preview Mode</button>
          </div>
          <div className="card">
            <h2>Progression</h2>
            <div className="chord-row">
              {patch.progression.map((chord, index) => (
                <div className="chord-card" key={`${chord}-${index}`}>
                  <strong>{chord}</strong>
                  <span>{Theory.progressionLabels[patch.progression.join('-')] || 'Loop'}</span>
                </div>
              ))}
            </div>
            <button className={`btn btn-secondary full ${previewing === 'progression' ? 'animating' : ''}`} style={{ marginTop: '1rem' }} onClick={previewProgression}>Preview Progression</button>
          </div>
        </section>
      );
    }

    if (step === 'drums') {
      return (
        <section className="panel-grid">
          <div className="card">
            <h2>Drum Groove</h2>
            <Control label="Groove" explanation={patch.whyGroove} onExplanationChange={(v) => changeField('whyGroove', v)} {...lockProps('groove')}>
              <div className="inline-actions">
                <select value={patch.groove} onChange={(event) => changeField('groove', event.target.value)}>
                  <option value="straight">Straight</option>
                  <option value="driving-eighths">Driving Eighths</option>
                  <option value="syncopated">Syncopated</option>
                  <option value="half-time">Half-Time</option>
                  <option value="shuffle">Shuffle</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'groove' ? 'animating' : ''}`} onClick={previewGroove}>🔊</button>
              </div>
              <div className="visual-hint">{GROOVE_VIZ[patch.groove]}</div>
            </Control>
            <Control label="Drum Kit" explanation={patch.tracks.drums.whyInstrument} onExplanationChange={(v) => changeTrackField('drums', 'whyInstrument', v)} {...lockProps('drumsInstrument')}>
              <div className="inline-actions">
                <select value={['electronic-808', 'acoustic-studio', 'bit-crushed-lofi'].includes(patch.tracks.drums.instrument) ? patch.tracks.drums.instrument : 'custom'} onChange={(event) => changeTrackField('drums', 'instrument', event.target.value)}>
                  <option value="custom" disabled>Custom</option>
                  <option value="electronic-808">Electronic 808</option>
                  <option value="acoustic-studio">Acoustic Studio</option>
                  <option value="bit-crushed-lofi">Bit-Crushed Lofi</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'groove' ? 'animating' : ''}`} onClick={previewGroove}>🔊</button>
              </div>
            </Control>
          </div>
          <PatternPreview patch={patch} />
        </section>
      );
    }

    if (step === 'bass') {
      return (
        <section className="panel-grid">
          <div className="card">
            <h2>Bass Line</h2>
            <Control label="Bass Behavior" explanation={patch.whyBassPattern} onExplanationChange={(v) => changeField('whyBassPattern', v)} {...lockProps('bassPattern')}>
              <div className="inline-actions">
                <select value={patch.bassPattern} onChange={(event) => changeField('bassPattern', event.target.value)}>
                  <option value="root-pulse">Root Pulse</option>
                  <option value="root-fifth-octave">Root-Fifth-Octave</option>
                  <option value="walking">Walking</option>
                  <option value="pedal-drone">Pedal Drone</option>
                  <option value="arpeggio">Arpeggio</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'bass' ? 'animating' : ''}`} onClick={previewBass}>🔊</button>
              </div>
              <div className="visual-hint">{BASS_VIZ[patch.bassPattern]}</div>
            </Control>
            <Control label="Bass Instrument" explanation={patch.tracks.bass.whyInstrument} onExplanationChange={(v) => changeTrackField('bass', 'whyInstrument', v)} {...lockProps('bassInstrument')}>
              <div className="inline-actions">
                <select value={['sub-bass', 'acoustic-piano', 'sine-wave', 'square-wave', 'tri-wave', 'saw-wave'].includes(patch.tracks.bass.instrument) ? patch.tracks.bass.instrument : 'custom'} onChange={(event) => changeTrackField('bass', 'instrument', event.target.value)}>
                  <option value="custom" disabled>Custom</option>
                  <option value="sub-bass">Sub Bass</option>
                  <option value="acoustic-piano">Acoustic Piano</option>
                  <option value="sine-wave">Pure Sine</option>
                  <option value="square-wave">Aggressive Square</option>
                  <option value="tri-wave">Deep Triangle</option>
                  <option value="saw-wave">Buzzy Saw</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'bass' ? 'animating' : ''}`} onClick={previewBass}>🔊</button>
              </div>
            </Control>
          </div>
          <PatternPreview patch={patch} />
        </section>
      );
    }

    if (step === 'chords') {
      return (
        <section className="panel-grid">
          <div className="card">
            <h2>Chord Voicing</h2>
            <Control label="Voicing" explanation={patch.whyVoicing} onExplanationChange={(v) => changeField('whyVoicing', v)} {...lockProps('voicing')}>
              <div className="inline-actions">
                <select value={patch.voicing} onChange={(event) => changeField('voicing', event.target.value)}>
                  <option value="triads">Standard Triads</option>
                  <option value="power">Power Fifths</option>
                  <option value="suspended">Suspended</option>
                  <option value="add9">Add 9</option>
                  <option value="sevenths">Sevenths</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'voicing' ? 'animating' : ''}`} onClick={previewVoicing}>🔊</button>
              </div>
            </Control>
            <Control label="Chord Instrument" explanation={patch.tracks.chords.whyInstrument} onExplanationChange={(v) => changeTrackField('chords', 'whyInstrument', v)} {...lockProps('chordsInstrument')}>
              <div className="inline-actions">
                <select value={['warm-pad', 'electric-piano', 'acoustic-piano', 'sine-wave', 'tri-wave', 'saw-wave'].includes(patch.tracks.chords.instrument) ? patch.tracks.chords.instrument : 'custom'} onChange={(event) => changeTrackField('chords', 'instrument', event.target.value)}>
                  <option value="custom" disabled>Custom</option>
                  <option value="warm-pad">Warm Pad</option>
                  <option value="electric-piano">Electric Piano</option>
                  <option value="acoustic-piano">Acoustic Piano</option>
                  <option value="sine-wave">Sine Wave</option>
                  <option value="tri-wave">Triangle Wave</option>
                  <option value="saw-wave">Saw Wave</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'voicing' ? 'animating' : ''}`} onClick={previewVoicing}>🔊</button>
              </div>
            </Control>
            <p className="explanation-box">{VOICING_INFO[patch.voicing]}</p>
          </div>
          <PatternPreview patch={patch} />
        </section>
      );
    }

    if (step === 'melody') {
      return (
        <section className="panel-grid">
          <div className="card">
            <SectionLockHeading
              title="Melody & Style"
              track="melody"
              locked={isTrackCategoryLocked('melody')}
              onToggle={toggleTrackCategoryLock}
            />
            <Control label="Melody Behavior" explanation={patch.whyMelodyStyle} onExplanationChange={(v) => changeField('whyMelodyStyle', v)} {...lockProps('melodyStyle')}>
              <div className="inline-actions">
                <select value={patch.melodyStyle} onChange={(event) => changeField('melodyStyle', event.target.value)}>
                  <option value="chord-tone-hook">Chord-Tone Hook</option>
                  <option value="stepwise">Stepwise</option>
                  <option value="pentatonic-hook">Pentatonic Hook</option>
                  <option value="sparse-motif">Sparse Motif</option>
                  <option value="sparkle-notes">Sparkle Notes</option>
                </select>
                <button className={`btn btn-secondary ${previewing === 'melody' ? 'animating' : ''}`} onClick={previewMelody}>🔊</button>
              </div>
              <div className="visual-hint">{MELODY_VIZ[patch.melodyStyle]}</div>
            </Control>

            <Control label="Melody Rhythm" explanation={patch.whyMelodyRhythm} onExplanationChange={(v) => changeField('whyMelodyRhythm', v)} {...lockProps('melodyRhythm')}>
              <select value={patch.melodyRhythm || 'mixed-values'} onChange={(event) => changeField('melodyRhythm', event.target.value)}>
                <option value="even-eighths">Even Eighths</option>
                <option value="quarter-note-theme">Quarter-note Theme</option>
                <option value="short-short-long">Short-Short-Long</option>
                <option value="dotted-rhythm">Dotted Rhythm</option>
                <option value="syncopated">Syncopated</option>
                <option value="sparse">Sparse</option>
                <option value="mixed-values">Mixed Values</option>
                <option value="sparkle">Sparkle</option>
              </select>
            </Control>

            <Control label="Melody Density" explanation={patch.whyMelodyDensity} onExplanationChange={(v) => changeField('whyMelodyDensity', v)} {...lockProps('melodyDensity')}>
              <select value={patch.melodyDensity || 'medium'} onChange={(event) => changeField('melodyDensity', event.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Control>

            <Control label="Articulation" explanation={patch.whyArticulation} onExplanationChange={(v) => changeField('whyArticulation', v)} {...lockProps('articulation')}>
              <select value={patch.articulation || 'standard'} onChange={(event) => changeField('articulation', event.target.value)}>
                <option value="staccato">Staccato (Short)</option>
                <option value="standard">Standard (Natural)</option>
                <option value="legato">Legato (Smooth)</option>
                <option value="varied">Varied (Humanized)</option>
              </select>
            </Control>

            <div className="inline-controls">
              <Control label="Arrangement" explanation={patch.whyArrangement} onExplanationChange={(v) => changeField('whyArrangement', v)} {...lockProps('arrangement')}>
                <div className="inline-actions">
                <select value={patch.arrangement} onChange={(event) => changeField('arrangement', event.target.value)}>
                  <option value="loop-only">Solid Loop</option>
                  <option value="build-up">Build Up</option>
                  <option value="intro-to-loop">Intro to Loop</option>
                  <option value="calm-exploration">Calm Exploration</option>
                </select>
                  <button className={`btn btn-secondary ${previewing === 'arrangement' ? 'animating' : ''}`} onClick={previewArrangement}>🔊</button>
                </div>
              </Control>
              <Control label="Melody Instrument" explanation={patch.tracks.melody.whyInstrument} onExplanationChange={(v) => changeTrackField('melody', 'whyInstrument', v)} {...lockProps('melodyInstrument')}>
                <div className="inline-actions">
                  <select value={['bright-lead', 'warm-pad', 'acoustic-piano', 'sine-wave', 'saw-wave'].includes(patch.tracks.melody.instrument) ? patch.tracks.melody.instrument : 'custom'} onChange={(event) => changeTrackField('melody', 'instrument', event.target.value)}>
                    <option value="custom" disabled>Custom</option>
                    <option value="bright-lead">Bright Lead</option>
                    <option value="warm-pad">Soft Pad</option>
                    <option value="acoustic-piano">Acoustic Piano</option>
                    <option value="sine-wave">Pure Sine</option>
                    <option value="saw-wave">Sharp Saw</option>
                  </select>
                  <button className={`btn btn-secondary ${previewing === 'melody' ? 'animating' : ''}`} onClick={previewMelody}>🔊</button>
                </div>
              </Control>
            </div>
          </div>
          <PatternPreview patch={patch} />
        </section>
      );
    }

    if (step === 'countermelody') {
      const isOff = !patch.tracks?.countermelody?.enabled;
      const roles = [
        { id: 'answer', name: 'Answering Phrase', plain: 'Plays short melodies when the main melody stops.', musical: 'Call-and-response behavior.', why: 'To add narrative movement and fill empty spaces.', config: { role: 'answer', timing: 'end-of-phrase', density: 'low', register: 'same', motion: 'pentatonic', why: 'Classic answering phrases that fill gaps in the main melody.' } },
        { id: 'harmony', name: 'Harmony Line', plain: 'Follows the melody with supporting notes.', musical: 'Parallel or oblique motion in intervals.', why: 'To make the main theme feel thicker and more orchestral.', config: { role: 'harmony', timing: 'fill-gaps', density: 'medium', register: 'above', motion: 'chord-tone', why: 'A shadowing harmony line that enriches the main theme.' } },
        { id: 'sparkle', name: 'Sparkle Fills', plain: 'High-pitched decorative notes.', musical: 'High-register decorative counterpoint.', why: 'To add magical or electronic texture.', config: { role: 'sparkle', timing: 'offbeats', density: 'low', register: 'sparkle', motion: 'pentatonic', why: 'High-register decorative sparkles that add texture.' } },
        { id: 'hook', name: 'Repeating Hook', plain: 'A simple catchy phrase that repeats.', musical: 'Ostinato or rhythmic motif.', why: 'To create a memorable secondary theme.', config: { role: 'hook', timing: 'every-2-bars', density: 'medium', register: 'above', motion: 'leaping-hook', why: 'A steady repeating hook that provides structural identity.' } },
        { id: 'call-response', name: 'Call-and-Response', plain: 'Boldly trades phrases with the melody.', musical: 'Antiphonal structure.', why: 'For high-energy or conversational tracks.', config: { role: 'call-response', timing: 'fill-gaps', density: 'high', register: 'above', motion: 'pentatonic', why: 'Active conversational trading between melody and countermelody.' } }
      ];

      return (
        <section className="panel-grid">
          <div className="card">
            <div className="section-header">
              <h2>Countermelody</h2>
              <div className="toggle-control">
                <span>{isOff ? 'Off' : 'On'}</span>
                <button
                  type="button"
                  className={`lock-toggle ${isLocked('countermelodyEnabled') ? 'locked' : ''}`}
                  aria-pressed={isLocked('countermelodyEnabled')}
                  disabled={isTrackCategoryLocked('countermelody')}
                  onClick={() => toggleLock('countermelodyEnabled')}
                >
                  {isLocked('countermelodyEnabled') ? 'Locked' : 'Lock'}
                </button>
                <input type="checkbox" checked={!isOff} disabled={isControlDisabled('countermelodyEnabled')} onChange={(e) => changeTrackField('countermelody', 'enabled', e.target.checked)} />
              </div>
            </div>

            <div className={isOff ? 'greyed-controls' : ''}>
              <Control label="Preset Reason" explanation={patch.whyCountermelody} onExplanationChange={(v) => changeField('whyCountermelody', v)} {...lockProps('countermelodyReason')}>
                <p className="muted small">Why this is configured for the current style.</p>
              </Control>

              <div className="group-box">
                <h3>Behavior</h3>
                <Control label="Role (Musical Style)" explanation={patch.whyCountermelodyRole} onExplanationChange={(v) => changeField('whyCountermelodyRole', v)} {...lockProps('countermelodyRole')}>
                  <select value={patch.countermelodyRole} onChange={(e) => changeField('countermelodyRole', e.target.value)}>
                    <option value="answer">Answering Phrase</option>
                    <option value="harmony">Harmony Line</option>
                    <option value="sparkle">Sparkle Fills</option>
                    <option value="hook">Repeating Hook</option>
                    <option value="call-response">Call-and-Response</option>
                  </select>
                </Control>
                <Control label="Timing (Rhythmic Placement)" explanation={patch.whyCountermelodyTiming} onExplanationChange={(v) => changeField('whyCountermelodyTiming', v)} {...lockProps('countermelodyTiming')}>
                  <select value={patch.countermelodyTiming} onChange={(e) => changeField('countermelodyTiming', e.target.value)}>
                    <option value="fill-gaps">Fill Gaps</option>
                    <option value="offbeats">Offbeats</option>
                    <option value="end-of-phrase">End of Phrase</option>
                    <option value="every-2-bars">Every 2 Bars</option>
                    <option value="constant-hook">Constant Hook</option>
                  </select>
                </Control>
                <Control label="Density (Quantity of Notes)" explanation={patch.whyCountermelodyDensity} onExplanationChange={(v) => changeField('whyCountermelodyDensity', v)} {...lockProps('countermelodyDensity')}>
                  <select value={patch.countermelodyDensity} onChange={(e) => changeField('countermelodyDensity', e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Control>
              </div>

              <div className="group-box">
                <h3>Pitch & Motion</h3>
                <Control label="Register (Pitch Range)" explanation={patch.whyCountermelodyRegister} onExplanationChange={(v) => changeField('whyCountermelodyRegister', v)} {...lockProps('countermelodyRegister')}>
                  <select value={patch.countermelodyRegister} onChange={(e) => changeField('countermelodyRegister', e.target.value)}>
                    <option value="above">Above Melody</option>
                    <option value="same">Same Register</option>
                    <option value="below">Below Melody</option>
                    <option value="sparkle">Very High Sparkle</option>
                  </select>
                </Control>
                <Control label="Motion Pattern" explanation={patch.whyCountermelodyMotion} onExplanationChange={(v) => changeField('whyCountermelodyMotion', v)} {...lockProps('countermelodyMotion')}>
                  <select value={patch.countermelodyMotion} onChange={(e) => changeField('countermelodyMotion', e.target.value)}>
                    <option value="stepwise">Stepwise (Singing)</option>
                    <option value="chord-tone">Chord-Tone (Stable)</option>
                    <option value="pentatonic">Pentatonic (Open)</option>
                    <option value="arpeggio">Arpeggio (Broken Chords)</option>
                    <option value="leaping-hook">Leaping Hook (Active)</option>
                  </select>
                </Control>
              </div>

              <div className="group-box">
                <h3>Sound</h3>
                <Control label="Instrument" {...lockProps('countermelodyInstrument')}>
                  <select value={patch.tracks?.countermelody?.instrument || 'bright-lead'} onChange={(e) => changeTrackField('countermelody', 'instrument', e.target.value)}>
                    <option value="bright-lead">Bright Lead</option>
                    <option value="sine-wave">Pure Sine</option>
                    <option value="warm-pad">Soft Pad</option>
                    <option value="acoustic-piano">Acoustic Piano</option>
                    <option value="saw-wave">Sharp Saw</option>
                    <option value="tri-wave">Triangle</option>
                  </select>
                </Control>
                <Control label="Volume" {...lockProps('countermelodyVolume')}>
                  <input type="range" min="0" max="1" step="0.05" value={patch.tracks?.countermelody?.volume ?? 0.25} onChange={(e) => changeTrackField('countermelody', 'volume', parseFloat(e.target.value))} />
                </Control>
              </div>
            </div>

            <div className="inline-actions" style={{marginTop: '1.5rem'}}>
              <button className={`btn btn-secondary ${previewing === 'countermelody' ? 'animating' : ''}`} onClick={previewCountermelody}>Preview Countermelody</button>
              <button className={`btn btn-secondary ${previewing === 'melody-countermelody' ? 'animating' : ''}`} onClick={previewMelodyWithCountermelody}>Preview Both</button>
            </div>
          </div>

          <div className="card">
            <h2>Learn by Preset</h2>
            <div className="relationship-diagram">
              <pre>
Melody:         ♪ ♪ ♪     ♪ ♪
Countermelody:       ♪ ♪       ♪
              </pre>
              <p className="muted small">A countermelody supports the main idea without cluttering it, often filling the gaps (silence) left by the lead.</p>
            </div>
            <div className="role-grid">
              {roles.map(role => (
                <div className="role-card" key={role.id}>
                  <strong>{role.name}</strong>
                  <p className="small">{role.plain}</p>
                  <button className="btn btn-secondary small" onClick={() => useRolePreset({...role.config, name: role.name})}>Use</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (step === 'lanes') {
      return (
        <section className="card">
          <div className="section-header">
            <h2>Track Lanes</h2>
            <div className="inline-actions">
              {!isPlaying ? (
                <button className="btn btn-primary" onClick={() => playLoop(activeTrack)}>{isPaused ? 'Resume' : 'Play Solo'}</button>
              ) : (
                <button className="btn btn-secondary" onClick={pausePlayback}>Pause</button>
              )}
              <button className="btn btn-secondary" disabled={isTrackCategoryLocked(activeTrack)} onClick={resetCurrentTrack}>Regenerate {activeTrack}</button>
            </div>
          </div>
          <Timeline
            patch={patch}
            playhead={playhead}
            lockedTracks={lockedOptions}
            onScrub={scrubTimeline}
            onToggleTrackLock={toggleTrackCategoryLock}
          />
          <div className="track-tabs">
            {TRACKS.map((track) => (
              <span key={track} className={`track-tab ${track === activeTrack ? 'active' : ''}`}>
                <button type="button" className="track-tab-select" onClick={() => setActiveTrack(track)}>{track}</button>
                <button
                  type="button"
                  className={`lock-toggle track-lock-toggle ${isTrackCategoryLocked(track) ? 'locked' : ''}`}
                  aria-label={`${isTrackCategoryLocked(track) ? 'Unlock' : 'Lock'} ${track}`}
                  aria-pressed={isTrackCategoryLocked(track)}
                  onClick={() => toggleTrackCategoryLock(track)}
                >
                  {isTrackCategoryLocked(track) ? 'Locked' : 'Lock'}
                </button>
              </span>
            ))}
          </div>
          <EventEditor
            track={activeTrack}
            events={patch.tracks[activeTrack].events}
            onChange={updateCurrentEvent}
            onRemove={removeCurrentEvent}
            locked={isTrackCategoryLocked(activeTrack)}
            currentBar={currentBar}
            currentBeat={currentBeat}
            beatsPerBar={patch.meter || 4}
            totalBars={patch.bars}
            scrollSignal={scrubSignal}
          />
        </section>
      );
    }

    if (step === 'theory') {
      return (
        <section className="card tutorial">
          <h2>Theory Analysis</h2>
          <p className="explanation-box">{theoryText}</p>
          <h3>Quick Tips</h3>
          <ul>
            <li><strong>Key:</strong> the home base where the loop feels finished.</li>
            <li><strong>Mode:</strong> the note palette that sets the mood.</li>
            <li><strong>Chord tones:</strong> stable notes to use on strong beats.</li>
          </ul>
        </section>
      );
    }

    return (
      <section className="card">
        <h2>Export Options</h2>
        <div className="inline-actions">
          <button className="btn btn-accent" onClick={copyPatch}>Copy Patch JSON</button>
          <button className="btn btn-accent" onClick={copyPlayableJS}>Copy Playable JS</button>
        </div>
        <textarea className="patch-editor" value={patchText} onChange={(event) => setPatchText(event.target.value)} />
        <button className="btn btn-secondary full" onClick={applyPatch}>Apply JSON Patch</button>
      </section>
    );
  }

  const presetNames = Object.keys(presets);
  const hasLocks = Object.values(lockedOptions).some(Boolean);

  return (
    <div className="app-shell">
      <label className={`debug-toggle ${logging ? 'enabled' : ''}`}>
        <span className="debug-indicator" />
        <span>Console Logs</span>
        <input type="checkbox" checked={logging} onChange={(e) => setLogging(e.target.checked)} />
      </label>

      <header className="app-header">
        <div>
          <h1>Music Sketchpad</h1>
          <p>Game-ready Web Audio loops with guided harmony and editable tracks.</p>
        </div>
      </header>

      <section className="playback-bar">
        {!isPlaying ? (
          <button className="btn btn-primary" onClick={() => playLoop()}>{isPaused ? 'Resume Loop' : 'Play Loop'}</button>
        ) : (
          <button className="btn btn-secondary" onClick={pausePlayback}>Pause</button>
        )}
        <button className="btn btn-secondary" onClick={stopPlayback}>Stop</button>
        <button className="btn btn-accent" onClick={regenerateAll}>Regenerate All</button>
        <div className="preset-controls">
          <button className="btn btn-primary preset-save" onClick={savePreset}>Save Preset</button>
          <select aria-label="Load Presets" onChange={(event) => loadPreset(event.target.value)} value="">
            <option value="" disabled>{presetNames.length ? 'Load preset' : 'No presets saved'}</option>
            {presetNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button className="btn btn-secondary preset-lock-clear" disabled={!hasLocks} onClick={removeAllLocks}>Remove All Locks</button>
        </div>
        <div className="status-display">{status}</div>
        <div className="playback-meta">
          <strong>Duration: {duration.toFixed(2)}s</strong>
          <span>BPM: {patch.bpm} | Bars: {patch.bars}</span>
        </div>
      </section>

      <nav className="stepper" aria-label="Composer steps">
        {STEPS.map((item, index) => (
          <button key={item.id} className={item.id === step ? 'active' : ''} onClick={() => setStep(item.id)}>
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {renderStep()}

      <footer className="step-footer">
        <button className="btn btn-secondary" disabled={activeStepIndex <= 0} onClick={() => setStep(STEP_IDS[activeStepIndex - 1])}>Back</button>
        <div className="message" role="status">{message}</div>
        <button className="btn btn-primary" disabled={activeStepIndex >= STEP_IDS.length - 1} onClick={() => setStep(STEP_IDS[activeStepIndex + 1])}>Next</button>
      </footer>
    </div>
  );
}

function SectionLockHeading({ title, track, locked, onToggle }) {
  return (
    <div className="section-lock-heading">
      <h2>{title}</h2>
      <button
        type="button"
        className={`lock-toggle ${locked ? 'locked' : ''}`}
        aria-label={`${locked ? 'Unlock' : 'Lock'} ${title}`}
        aria-pressed={locked}
        onClick={() => onToggle(track)}
      >
        {locked ? 'Locked' : 'Lock'}
      </button>
    </div>
  );
}

function Control({ label, children, explanation, onExplanationChange, lockId, locked = false, disabled = locked, onToggleLock }) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <div className={`control-group ${disabled ? 'control-locked' : ''}`}>
      <div className="control">
        <span className="control-heading">
          <span>{label}</span>
          {lockId && (
            <button
              type="button"
              className={`lock-toggle ${locked ? 'locked' : ''}`}
              aria-pressed={locked}
              onClick={(event) => {
                event.preventDefault();
                onToggleLock(lockId);
              }}
            >
              {locked ? 'Locked' : 'Lock'}
            </button>
          )}
        </span>
        <fieldset className="control-fields" disabled={disabled}>
          {children}
        </fieldset>
      </div>
      {onExplanationChange && (
        <div className="explanation-area">
          {isEditing ? (
            <textarea
              className="explanation-editor"
              value={explanation || ''}
              onChange={(e) => onExplanationChange(e.target.value)}
              onBlur={() => setIsEditing(false)}
              disabled={disabled}
              autoFocus
            />
          ) : (
            <div className="explanation-preview">
              <p>{explanation || <span style={{opacity: 0.5}}>Add a note explaining this selection...</span>}</p>
              <button type="button" className="edit-btn" disabled={disabled} onClick={() => setIsEditing(true)}>Edit</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoopStats({ patch, duration }) {
  const mood = MODES.find(([id]) => id === patch.mode)?.[1] || 'Neutral';
  return (
    <div className="card stats-card">
      <h2>Current Loop</h2>
      <dl>
        <div><dt>Key</dt><dd>{patch.key}</dd></div>
        <div><dt>Vibe</dt><dd>{mood}</dd></div>
        <div><dt>Progression</dt><dd>{patch.progression.join(' - ')}</dd></div>
        <div><dt>Duration</dt><dd>{duration.toFixed(2)}s</dd></div>
      </dl>
    </div>
  );
}

function ScalePreview({ notes, activeNotes, rootNote }) {
  return (
    <div className="scale-container">
      <p className="muted small">Notes in this scale (Home note is highlighted):</p>
      <div className="scale-visualizer">
        {notes.map((note) => (
          <span key={note} className={`preview-note ${activeNotes.includes(note) ? 'active' : ''} ${note === rootNote ? 'root' : ''}`}>
            {note}
          </span>
        ))}
      </div>
    </div>
  );
}

const DENSITY_LEVELS = ['empty', 'low', 'medium', 'high', 'very-high'];

function formatSettingName(value) {
  if (!value) return 'Custom';
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getTrackBarDensity(track, events, bar) {
  return events
    .filter((event) => event.bar === bar)
    .reduce((score, event) => {
      const duration = event.durationBeats || 0.25;
      const velocity = event.velocity || 0.5;
      const chordSize = event.midis?.length || 1;

      if (track === 'drums') {
        return score + 0.45 + (velocity * 1.25);
      }

      if (track === 'chords') {
        return score + (duration * 0.5) + (velocity * 0.8) + ((chordSize - 1) * 0.35);
      }

      if (track === 'bass') {
        return score + 0.35 + (duration * 0.75) + (velocity * 0.45);
      }

      return score + 0.45 + (duration * 0.55) + (velocity * 0.55);
    }, 0);
}

function getDensityLevel(track, score) {
  if (score <= 0) return 'empty';

  const thresholds = {
    melody: { low: 1.2, medium: 2.4, high: 4.5, veryHigh: 6.8 },
    chords: { low: 0.8, medium: 3, high: 3.5, veryHigh: 4.2 },
    bass: { low: 0.8, medium: 3.8, high: 4.6, veryHigh: 4.85 },
    drums: { low: 2, medium: 5.5, high: 8.5, veryHigh: 11 }
  };
  const scale = thresholds[track] || thresholds.melody;

  if (score < scale.low) return 'low';
  if (score < scale.medium) return 'medium';
  if (score < scale.high) return 'high';
  return score < scale.veryHigh ? 'high' : 'very-high';
}

function summarizeTrackDensity(track, scores, patch) {
  const activeScores = scores.filter((score) => score > 0);
  const average = activeScores.length
    ? activeScores.reduce((total, score) => total + score, 0) / activeScores.length
    : 0;
  const peak = Math.max(...scores, 0);
  const hasGaps = scores.some((score) => score === 0);
  const instrument = formatSettingName(patch.tracks[track].instrument);

  const summaries = {
    melody: average >= 5 ? 'busy density' : average >= 2.5 ? 'medium density' : average > 0 ? 'sparse density' : 'silent',
    chords: hasGaps ? 'spaced' : peak >= 3 ? 'full voicing' : 'steady',
    bass: patch.bassPattern === 'pedal-drone' ? 'sustained drone' : average >= 4.5 ? 'active pulse' : average >= 3 ? 'steady pulse' : 'light pulse',
    drums: average >= 11 ? 'very busy' : average >= 8.5 ? 'busy' : average >= 5.5 ? 'steady' : average > 0 ? 'sparse' : 'silent'
  };

  return `${formatSettingName(track)}: ${summaries[track]}, ${instrument}`;
}

function PatternPreview({ patch }) {
  const bars = Array.from({ length: patch.bars }, (_, index) => index + 1);
  const trackScores = Object.fromEntries(
    TRACKS.map((track) => [
      track,
      bars.map((bar) => getTrackBarDensity(track, patch.tracks[track].events, bar))
    ])
  );

  return (
    <div className="card">
      <h2>Track Density Preview</h2>
      <p className="muted density-copy">Each square is one bar. Brighter/full squares mean more notes, longer notes, or stronger hits in that bar.</p>
      <div className="mini-arrangement">
        {TRACKS.map((track) => (
          <div className="mini-row" key={track}>
            <span>{track}</span>
            <div style={{ '--bars': patch.bars }}>
              {bars.map((bar, index) => {
                const level = getDensityLevel(track, trackScores[track][index]);
                return <i key={bar} className={`density-${level}`} title={`${formatSettingName(track)} bar ${bar}: ${level.replace('-', ' ')}`} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="density-legend" aria-label="Density legend">
        {DENSITY_LEVELS.map((level) => (
          <span key={level}>
            <i className={`density-${level}`} />
            {level.replace('-', ' ')}
          </span>
        ))}
      </div>
      <div className="density-summary">
        {TRACKS.map((track) => (
          <p key={track}>{summarizeTrackDensity(track, trackScores[track], patch)}</p>
        ))}
      </div>
    </div>
  );
}

function Timeline({ patch, playhead, lockedTracks, onScrub, onToggleTrackLock }) {
  const beatsPerBar = patch.meter || 4;
  const totalBeats = patch.bars * beatsPerBar;
  const articulationMult = patch.articulation === 'varied' ? 0.75 : (ARTICULATIONS[patch.articulation] || 0.75);

  function handleClick(event) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onScrub(((event.clientX - rect.left) / rect.width) * 100);
  }

  return (
    <div className="timeline" onClick={handleClick}>
      {TRACKS.map((track) => (
        <div className="lane" key={track}>
          <span className="lane-label">
            <span>{track}</span>
            <button
              type="button"
              className={`lock-toggle lane-lock-toggle ${lockedTracks[TRACK_LOCK_IDS[track]] ? 'locked' : ''}`}
              aria-label={`${lockedTracks[TRACK_LOCK_IDS[track]] ? 'Unlock' : 'Lock'} ${track}`}
              aria-pressed={Boolean(lockedTracks[TRACK_LOCK_IDS[track]])}
              onClick={(event) => {
                event.stopPropagation();
                onToggleTrackLock(track);
              }}
            >
              {lockedTracks[TRACK_LOCK_IDS[track]] ? 'Locked' : 'Lock'}
            </button>
          </span>
          {patch.tracks[track].events.map((event, index) => {
            const start = ((event.bar - 1) * beatsPerBar + (event.beat - 1)) / totalBeats;
            const width = (event.durationBeats * articulationMult) / totalBeats;
            return <span key={`${track}-${index}`} className="note-block" style={{ left: `${start * 100}%`, width: `${Math.max(width * 100, 0.1)}%` }} />;
          })}
          <span className="playhead" style={{ left: `${playhead}%` }} />
        </div>
      ))}
    </div>
  );
}

function EventEditor({ track, events, onChange, onRemove, locked, currentBar, currentBeat, beatsPerBar, totalBars, scrollSignal }) {
  const containerRef = useRef(null);
  const rowRefs = useRef([]);
  const activeBeat = currentBar > 0 ? ((currentBar - 1) * beatsPerBar) + (currentBeat - 1) : -1;
  const totalBeats = totalBars * beatsPerBar;
  const visibleEvents = events;
  const activeRowIndex = visibleEvents.findIndex((event) => isEventActiveAtBeat(event, activeBeat, beatsPerBar));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || scrollSignal === 0 || activeBeat < 0) return;

    if (activeRowIndex >= 0 && rowRefs.current[activeRowIndex]) {
      rowRefs.current[activeRowIndex].scrollIntoView({ block: 'center' });
      return;
    }

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll > 0) {
      container.scrollTop = maxScroll * (activeBeat / totalBeats);
    }
  }, [scrollSignal, track]);

  return (
    <div className="table-container" ref={containerRef}>
      <table>
        <thead>
          <tr><th>Bar</th><th>Beat</th><th>Length</th><th>Pitch/Note</th><th>Label</th><th className="row-action-heading">Delete</th></tr>
        </thead>
        <tbody>
          {visibleEvents.map((event, index) => {
            const valueField = event.midis ? 'midis' : event.midi === undefined ? 'drum' : 'midi';
            const value = event.midis ? event.midis.join(',') : event.midi ?? event.drum;
            const isActive = isEventActiveAtBeat(event, activeBeat, beatsPerBar);
            return (
              <tr key={`${track}-${index}`} ref={(element) => { rowRefs.current[index] = element; }} className={isActive ? 'active-row' : ''}>
                <EditableCell value={event.bar} disabled={locked} onCommit={(value) => onChange(index, 'bar', value)} />
                <EditableCell value={event.beat} disabled={locked} onCommit={(value) => onChange(index, 'beat', value)} />
                <EditableCell value={event.durationBeats} disabled={locked} onCommit={(value) => onChange(index, 'durationBeats', value)} />
                <EditableCell value={value} disabled={locked} onCommit={(value) => onChange(index, valueField, valueField === 'midis' ? parseMidiList(value) : value)} />
                <td>{event.label}</td>
                <td className="row-action-cell">
                  <button
                    type="button"
                    className="row-delete-btn"
                    aria-label={`Delete ${event.label || track} event`}
                    disabled={locked}
                    onClick={() => onRemove(index)}
                  >
                    x
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function isEventActiveAtBeat(event, activeBeat, beatsPerBar) {
  const start = ((event.bar - 1) * beatsPerBar) + (event.beat - 1);
  const end = start + (event.durationBeats || 0.4);
  return activeBeat >= start && activeBeat < end;
}

function EditableCell({ value, disabled = false, onCommit }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <td>
      <input value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft)} />
    </td>
  );
}

function parseMidiList(value) {
  return String(value).split(',').map((item) => Number.parseFloat(item.trim())).filter((item) => !Number.isNaN(item));
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function buildTheoryText(patch) {
  let text = `Using ${patch.key} ${patch.mode}. `;
  if (patch.mode === 'mixolydian') text += 'The lowered 7th gives it a floaty adventure feel common in games.';
  else if (patch.mode === 'dorian') text += 'Dorian is minor but brighter, useful for mysterious dungeon tracks.';
  else if (patch.mode === 'phrygian') text += 'Phrygian is dark and tense, useful for boss encounters.';
  else text += 'The selected mode defines the allowed notes and overall color.';
  return `${text} The ${patch.progression.join('-')} progression creates ${patch.progression[0] === 'I' ? 'stability' : 'movement'}.`;
}

export default App;
