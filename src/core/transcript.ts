export interface Segment {
  text: string;
  start: number;
  end: number;
  speaker: string;
}

export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  language: string;
  finishReason: string;
  truncated: boolean;
  segments: Segment[];
  speakerSegments: SpeakerSegment[];
  chunks: unknown[];
}

export type SpeakerNames = Record<string, string>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

function parseSegment(raw: unknown, index: number): Segment {
  if (!isRecord(raw)) {
    throw new Error(`Invalid transcript: segments[${index}] is not an object`);
  }
  if (typeof raw['text'] !== 'string') {
    throw new Error(`Invalid transcript: segments[${index}].text must be a string`);
  }
  if (typeof raw['start'] !== 'number' || !Number.isFinite(raw['start'])) {
    throw new Error(`Invalid transcript: segments[${index}].start must be a number`);
  }
  if (typeof raw['end'] !== 'number' || !Number.isFinite(raw['end'])) {
    throw new Error(`Invalid transcript: segments[${index}].end must be a number`);
  }
  const speaker =
    typeof raw['speaker'] === 'string' && raw['speaker'] !== '' ? raw['speaker'] : 'UNKNOWN';
  return { text: raw['text'], start: raw['start'], end: raw['end'], speaker };
}

function parseSpeakerSegment(raw: unknown, index: number): SpeakerSegment {
  if (!isRecord(raw)) {
    throw new Error(`Invalid transcript: speaker_segments[${index}] is not an object`);
  }
  return {
    speaker: asString(raw['speaker'], 'UNKNOWN'),
    start: typeof raw['start'] === 'number' ? raw['start'] : 0,
    end: typeof raw['end'] === 'number' ? raw['end'] : 0,
    text: asString(raw['text']),
  };
}

/**
 * Validates and normalises the JSON emitted by `mlx-qwen3-asr -f json`.
 * Optional top-level fields are tolerated; malformed segments are not.
 */
export function parseTranscript(raw: unknown): Transcript {
  if (!isRecord(raw)) {
    throw new Error('Invalid transcript: expected an object');
  }
  const segments = raw['segments'];
  if (!Array.isArray(segments)) {
    throw new Error('Invalid transcript: segments must be an array');
  }
  const speakerSegments = Array.isArray(raw['speaker_segments']) ? raw['speaker_segments'] : [];
  const chunks = Array.isArray(raw['chunks']) ? raw['chunks'] : [];

  return {
    text: asString(raw['text']),
    language: asString(raw['language']),
    finishReason: asString(raw['finish_reason']),
    truncated: raw['truncated'] === true,
    segments: segments.map(parseSegment),
    speakerSegments: speakerSegments.map(parseSpeakerSegment),
    chunks,
  };
}
