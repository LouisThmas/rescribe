import type { SpeakerNames, Transcript } from './transcript.js';

interface Turn {
  speaker: string;
  start: number;
  end: number;
  words: string[];
}

/** Formats seconds as HH:MM:SS, truncating fractional seconds. */
export function formatTimestamp(seconds: number): string {
  const s = Math.trunc(seconds);
  const hh = String(Math.trunc(s / 3600)).padStart(2, '0');
  const mm = String(Math.trunc((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Groups consecutive segments that share a speaker into turns. */
function groupTurns(transcript: Transcript): Turn[] {
  const turns: Turn[] = [];
  for (const seg of transcript.segments) {
    const last = turns.at(-1);
    if (last && last.speaker === seg.speaker) {
      last.words.push(seg.text);
      last.end = seg.end;
    } else {
      turns.push({ speaker: seg.speaker, start: seg.start, end: seg.end, words: [seg.text] });
    }
  }
  return turns;
}

/**
 * Absorbs 1-2 word "flicker" turns that sit between two turns from the same
 * speaker. Mirrors the smoothing loop in the original format-transcript script,
 * including its quirk that a flicker at index 0 can never be absorbed.
 */
function smoothTurns(turns: Turn[]): Turn[] {
  const smoothed: Turn[] = [];
  let i = 0;
  while (i < turns.length) {
    const turn = turns[i]!;
    const prev = turns[i - 1];
    const next = turns[i + 1];
    const last = smoothed.at(-1);

    if (
      i > 0 &&
      i < turns.length - 1 &&
      turn.words.length <= 2 &&
      prev !== undefined &&
      next !== undefined &&
      prev.speaker === next.speaker &&
      last !== undefined &&
      last.speaker === prev.speaker
    ) {
      last.words.push(...turn.words, ...next.words);
      last.end = next.end;
      i += 2;
      continue;
    }

    if (last && last.speaker === turn.speaker) {
      last.words.push(...turn.words);
      last.end = turn.end;
    } else {
      smoothed.push(turn);
    }
    i += 1;
  }
  return smoothed;
}

/**
 * Renders a transcript as `[HH:MM:SS] SPEAKER: text`, turns separated by a
 * blank line. Output is byte-identical to the original format-transcript script.
 */
export function formatTranscript(transcript: Transcript, names: SpeakerNames = {}): string {
  return smoothTurns(groupTurns(transcript))
    .map((turn) => {
      const name = names[turn.speaker] ?? turn.speaker;
      return `[${formatTimestamp(turn.start)}] ${name}: ${turn.words.join(' ')}`;
    })
    .join('\n\n');
}
