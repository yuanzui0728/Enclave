export type SpeechTranscriptionMode = "dictation";

export interface SpeechTranscriptionResult {
  text: string;
  durationMs: number;
  provider?: string;
}
