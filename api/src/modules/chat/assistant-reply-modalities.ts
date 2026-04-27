import type { MessageAttachment } from './chat.types';
import type { WorldLanguageCode } from '../config/world-language.service';

export type AssistantReplyTargetMessage = {
  type:
    | 'text'
    | 'sticker'
    | 'image'
    | 'file'
    | 'voice'
    | 'contact_card'
    | 'location_card'
    | 'note_card';
  text: string;
  attachment?: MessageAttachment;
};

export type AssistantReplyModalitiesPlan = {
  includeVoice: boolean;
  imagePrompt?: string;
  promptSections: string[];
};

const CHAT_REPLY_PREFIX_PATTERN = /^\[\[chat_reply:[^\]]+\]\]\n?/;
const INLINE_MENTION_PATTERN = /(^|\s)@[\p{L}\p{N}_-]{1,40}/gu;
const TERMINAL_PUNCTUATION_PATTERN = /[。！？!?]$/u;

export function shouldCreateVoiceReplyFromAttachment(
  input: AssistantReplyTargetMessage,
) {
  if (input.type === 'voice') {
    return true;
  }

  return (
    input.type === 'file' &&
    input.attachment?.kind === 'file' &&
    /^(audio|video)\//i.test(input.attachment.mimeType)
  );
}

export function shouldCreateVoiceReplyFromText(text: string) {
  return /语音回复|语音回答|发语音|用语音|说给我听|念给我听|读给我听|播报给我听/i.test(
    text.trim(),
  );
}

export function extractRequestedImagePrompt(
  message: AssistantReplyTargetMessage,
) {
  if (message.type !== 'text' || message.attachment) {
    return null;
  }

  const rawText = message.text.trim().replace(/[。！？!?]+$/g, '');
  if (rawText.length < 4) {
    return null;
  }

  const wantsImage =
    /(画|生成|做|来|发|出|整).{0,12}(图|图片|插画|配图|头像|壁纸|海报|封面|表情包)/i.test(
      rawText,
    ) ||
    /(图|图片|插画|配图|头像|壁纸|海报|封面|表情包).{0,12}(画|生成|做|来|发|出|整)/i.test(
      rawText,
    );
  if (!wantsImage) {
    return null;
  }

  const prompt = rawText
    .replace(/^(请|麻烦)?\s*(帮我|给我)?\s*/i, '')
    .replace(/^(画|生成|做|来|发|出|整)(一张|张|个|幅)?/i, '')
    .trim();

  return (prompt || rawText).slice(0, 320);
}

export function buildReplyModalityPromptSections(
  plan: AssistantReplyModalitiesPlan,
) {
  const sections: string[] = [];

  if (plan.includeVoice) {
    sections.push(
      '<reply_voice_mode>\n如果用户希望你用语音回复，系统会把你本轮文字内容自动转成语音播报。你的文字回复应更像自然口语，不要提到技术流程，也不要说“我现在发语音给你”。\n</reply_voice_mode>',
    );
  }

  if (plan.imagePrompt) {
    sections.push(
      '<reply_image_mode>\n如果用户希望你直接画图或发图，系统会根据用户请求生成一张图片附在你这轮回复里。你的文字回复应简短自然，可作为配文或交付说明；不要说自己无法生成图片，不要暴露底层流程，也不要输出 Markdown 图片语法、attachment 占位或文件链接占位。\n</reply_image_mode>',
    );
  }

  return sections;
}

export function normalizeAssistantReplyTextForModalities(
  text: string,
  plan: AssistantReplyModalitiesPlan,
  language: WorldLanguageCode = 'zh-CN',
) {
  const normalized = text.trim();
  if (!plan.imagePrompt) {
    return normalized;
  }

  const stripped = normalized
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/attachment:[^) \n]+/gi, ' ')
    .trim();

  return stripped || getLocalizedAssistantFallback(language, 'image_sent');
}

export function resolveAssistantReplyText(input: {
  text: string;
  promptText: string;
  plan: AssistantReplyModalitiesPlan;
  fallbackText?: string;
  language?: WorldLanguageCode;
}) {
  const language = input.language ?? 'zh-CN';
  const rawText = input.text.trim() === '（无回复）' ? '' : input.text;
  const normalized = normalizeAssistantReplyTextForModalities(
    rawText,
    input.plan,
    language,
  );
  if (normalized && normalized !== '（无回复）') {
    return normalized;
  }

  if (input.plan.imagePrompt) {
    return getLocalizedAssistantFallback(language, 'image_sent');
  }

  const promptFallback = extractPromptReplyFallback(
    input.promptText,
    input.plan,
    language,
  );
  if (promptFallback) {
    return promptFallback;
  }

  const explicitFallback = input.fallbackText?.trim();
  if (explicitFallback) {
    return explicitFallback;
  }

  return getLocalizedAssistantFallback(
    language,
    input.plan.includeVoice ? 'voice_ack' : 'ack',
  );
}

function extractPromptReplyFallback(
  promptText: string,
  plan: AssistantReplyModalitiesPlan,
  language: WorldLanguageCode,
) {
  const cleanedPrompt = promptText
    .replace(CHAT_REPLY_PREFIX_PATTERN, '')
    .replace(INLINE_MENTION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanedPrompt) {
    return '';
  }

  const colonTail = cleanedPrompt
    .split(/[：:]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  if (
    plan.includeVoice &&
    colonTail &&
    colonTail !== cleanedPrompt &&
    colonTail.length <= 120
  ) {
    return ensureReplySentence(colonTail, language);
  }

  const withoutLead = cleanedPrompt
    .replace(/^(请|麻烦)?\s*(帮我|给我)?\s*/i, '')
    .replace(
      /(用语音回复我|语音回复我|语音回答我|语音回复|语音回答|发语音给我|发语音|用语音|说给我听|念给我听|读给我听|播报给我听)/i,
      '',
    )
    .replace(/^(回复我|回答我|跟我说|告诉我)\s*/i, '')
    .trim();
  if (
    plan.includeVoice &&
    withoutLead &&
    withoutLead.length <= 120 &&
    !/语音|回复|回答|发图|图片|插画|配图|海报|壁纸/i.test(withoutLead)
  ) {
    return ensureReplySentence(withoutLead, language);
  }

  return '';
}

function ensureReplySentence(text: string, language: WorldLanguageCode) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  if (TERMINAL_PUNCTUATION_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return language === 'ja-JP' || language === 'zh-CN'
    ? `${trimmed}。`
    : `${trimmed}.`;
}

function getLocalizedAssistantFallback(
  language: WorldLanguageCode,
  kind: 'ack' | 'voice_ack' | 'image_sent',
) {
  const values: Record<
    WorldLanguageCode,
    Record<'ack' | 'voice_ack' | 'image_sent', string>
  > = {
    'zh-CN': {
      ack: '收到。',
      voice_ack: '我在。',
      image_sent: '给你发过去了。',
    },
    'en-US': {
      ack: 'Got it.',
      voice_ack: "I'm here.",
      image_sent: 'Sent it over.',
    },
    'ja-JP': {
      ack: '了解しました。',
      voice_ack: 'います。',
      image_sent: '送りました。',
    },
    'ko-KR': {
      ack: '알겠어요.',
      voice_ack: '여기 있어요.',
      image_sent: '보냈어요.',
    },
  };
  return values[language][kind];
}

export function buildAssistantSpeechInstructions(characterName: string) {
  const normalizedName = characterName.trim() || '助手';
  return `Keep the delivery conversational and in character as ${normalizedName}. Do not add stage directions.`;
}
