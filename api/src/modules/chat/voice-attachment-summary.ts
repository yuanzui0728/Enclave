type BuildVoiceAttachmentSummaryInput = {
  durationText: string;
  captionText: string;
  transcriptText?: string | null;
};

const VOICE_MESSAGE_PREFIX = '\u53d1\u6765\u4e00\u6761\u8bed\u97f3\u6d88\u606f';
const VOICE_MESSAGE_TRANSCRIPT_PREFIX = '\uff0c\u8f6c\u5199\u5185\u5bb9\uff1a';
const VOICE_MESSAGE_AUDIO_FALLBACK =
  '\uff0c\u539f\u59cb\u97f3\u9891\u5df2\u968f\u6d88\u606f\u63d0\u4f9b\uff0c\u8bf7\u76f4\u63a5\u6839\u636e\u97f3\u9891\u5185\u5bb9\u7406\u89e3\u5e76\u56de\u590d\u3002';

export function buildVoiceAttachmentSummary({
  durationText,
  captionText,
  transcriptText,
}: BuildVoiceAttachmentSummaryInput) {
  const trimmedTranscript = transcriptText?.trim();

  return `${VOICE_MESSAGE_PREFIX}${durationText}${captionText}${
    trimmedTranscript
      ? `${VOICE_MESSAGE_TRANSCRIPT_PREFIX}${trimmedTranscript}`
      : VOICE_MESSAGE_AUDIO_FALLBACK
  }`.trim();
}
