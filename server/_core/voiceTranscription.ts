export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

/**
 * TODO(rebuild): Implement with Groq Whisper or OpenAI Whisper and set GROQ_API_KEY or OPENAI_API_KEY.
 */
export async function transcribeAudio(
  _options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  throw new Error(
    "[stub] Voice transcription not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with Groq Whisper or OpenAI Whisper and set GROQ_API_KEY or OPENAI_API_KEY."
  );
}
