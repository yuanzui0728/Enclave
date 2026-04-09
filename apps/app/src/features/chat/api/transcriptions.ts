import { createSpeechTranscription } from "@yinjie/contracts";

export function transcribeSpeechInput(payload: FormData, baseUrl?: string) {
  return createSpeechTranscription(payload, baseUrl);
}
