import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemConfigService } from './config.service';

export type WorldLanguageCode = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

export type WorldLanguageOption = {
  code: WorldLanguageCode;
  label: string;
  nativeLabel: string;
};

export type WorldLanguageConfig = {
  language: WorldLanguageCode;
  label: string;
  nativeLabel: string;
  changedAt: string | null;
  options: WorldLanguageOption[];
};

const WORLD_LANGUAGE_CONFIG_KEY = 'world_language';
const WORLD_LANGUAGE_CHANGED_AT_CONFIG_KEY = 'world_language_changed_at';

const WORLD_LANGUAGE_OPTIONS: WorldLanguageOption[] = [
  { code: 'zh-CN', label: 'Chinese', nativeLabel: '简体中文' },
  { code: 'en-US', label: 'English', nativeLabel: 'English' },
  { code: 'ja-JP', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'ko-KR', label: 'Korean', nativeLabel: '한국어' },
];

const WORLD_LANGUAGE_OPTION_MAP = new Map(
  WORLD_LANGUAGE_OPTIONS.map((option) => [option.code, option]),
);

const OUTPUT_LANGUAGE_INSTRUCTIONS: Record<WorldLanguageCode, string> = {
  'zh-CN':
    '目标输出语言：简体中文。所有面向用户、角色或世界内容的自然语言输出都必须使用自然的简体中文；除非用户明确要求翻译或引用原文，不要切换到其他语言。固定 JSON 字段名、XML 标签和内部标识保持不变，但可读文本字段使用简体中文。',
  'en-US':
    'Target output language: English. All user-facing, character-facing, or world-facing natural-language output must be natural, idiomatic English. Do not answer in Chinese, Japanese, or Korean unless the user explicitly asks for translation or a source-language quote. Keep fixed JSON keys, XML tags, and internal identifiers unchanged, but write readable text values in English.',
  'ja-JP':
    'Target output language: Japanese. All user-facing, character-facing, or world-facing natural-language output must be natural Japanese. Do not answer in Chinese, English, or Korean unless the user explicitly asks for translation or a source-language quote. Keep fixed JSON keys, XML tags, and internal identifiers unchanged, but write readable text values in Japanese.',
  'ko-KR':
    'Target output language: Korean. All user-facing, character-facing, or world-facing natural-language output must be natural Korean. Do not answer in Chinese, English, or Japanese unless the user explicitly asks for translation or a source-language quote. Keep fixed JSON keys, XML tags, and internal identifiers unchanged, but write readable text values in Korean.',
};

const TRANSCRIPTION_PROMPTS: Record<WorldLanguageCode, string> = {
  'zh-CN': '这是聊天输入语音转文字，请输出自然、简洁的中文口语内容。',
  'en-US':
    'This is speech-to-text for a chat input. Transcribe it as natural, concise spoken English.',
  'ja-JP':
    'これはチャット入力の音声文字起こしです。自然で簡潔な日本語の口語として出力してください。',
  'ko-KR':
    '이 음성은 채팅 입력입니다. 자연스럽고 간결한 한국어 구어체로 전사해 주세요.',
};

const TTS_INSTRUCTIONS: Record<WorldLanguageCode, string> = {
  'zh-CN':
    '请用自然、温和、清晰的中文口语表达来朗读，不要加入舞台说明，不要读出标点。',
  'en-US':
    'Read this in natural, warm, clear spoken English. Do not add stage directions or read punctuation aloud.',
  'ja-JP':
    '自然で穏やかで聞き取りやすい日本語の話し言葉として朗読してください。舞台説明を足したり、句読点を読み上げたりしないでください。',
  'ko-KR':
    '자연스럽고 따뜻하며 또렷한 한국어 구어체로 읽어 주세요. 무대 지시문을 덧붙이거나 문장부호를 읽지 마세요.',
};

@Injectable()
export class WorldLanguageService {
  constructor(private readonly systemConfig: SystemConfigService) {}

  async getConfig(): Promise<WorldLanguageConfig> {
    const language = await this.getLanguage();
    const option = WORLD_LANGUAGE_OPTION_MAP.get(language)!;
    return {
      language,
      label: option.label,
      nativeLabel: option.nativeLabel,
      changedAt: await this.getChangedAt(),
      options: WORLD_LANGUAGE_OPTIONS.map((item) => ({ ...item })),
    };
  }

  async getLanguage(): Promise<WorldLanguageCode> {
    return this.normalizeLanguage(
      await this.systemConfig.getConfig(WORLD_LANGUAGE_CONFIG_KEY),
      'zh-CN',
    );
  }

  async getChangedAt(): Promise<string | null> {
    const value = await this.systemConfig.getConfig(
      WORLD_LANGUAGE_CHANGED_AT_CONFIG_KEY,
    );
    return value?.trim() || null;
  }

  async setLanguage(language: unknown): Promise<WorldLanguageConfig> {
    const normalized = this.normalizeLanguage(language);
    const changedAt = new Date().toISOString();
    await Promise.all([
      this.systemConfig.setConfig(WORLD_LANGUAGE_CONFIG_KEY, normalized),
      this.systemConfig.setConfig(
        WORLD_LANGUAGE_CHANGED_AT_CONFIG_KEY,
        changedAt,
      ),
    ]);
    return this.getConfig();
  }

  async getOutputLanguageInstruction(): Promise<string> {
    return OUTPUT_LANGUAGE_INSTRUCTIONS[await this.getLanguage()];
  }

  async buildPromptLanguageSection(): Promise<string> {
    return `<world_language>\n${await this.getOutputLanguageInstruction()}\n</world_language>`;
  }

  async prependTaskLanguageInstruction(prompt: string): Promise<string> {
    const languageInstruction = await this.getOutputLanguageInstruction();
    return `${languageInstruction}\n\n${prompt}`;
  }

  async getTranscriptionLanguageCode(): Promise<string> {
    const language = await this.getLanguage();
    switch (language) {
      case 'en-US':
        return 'en';
      case 'ja-JP':
        return 'ja';
      case 'ko-KR':
        return 'ko';
      case 'zh-CN':
      default:
        return 'zh';
    }
  }

  async getTranscriptionPrompt(): Promise<string> {
    return TRANSCRIPTION_PROMPTS[await this.getLanguage()];
  }

  async buildSpeechInstructions(input?: {
    characterName?: string | null;
    existingInstructions?: string | null;
  }): Promise<string> {
    const language = await this.getLanguage();
    const parts = [TTS_INSTRUCTIONS[language]];
    const characterName = input?.characterName?.trim();
    if (characterName) {
      parts.push(this.renderSpeakerInstruction(language, characterName));
    }
    const existingInstructions = input?.existingInstructions?.trim();
    if (existingInstructions) {
      parts.push(`Additional delivery notes: ${existingInstructions}`);
    }
    return parts.join('\n');
  }

  async buildSceneGreetingFallback(input: {
    characterName: string;
    scene: string;
  }): Promise<string> {
    const language = await this.getLanguage();
    switch (language) {
      case 'en-US':
        return `Hi, I'm ${input.characterName}. We crossed paths at ${input.scene}. Want to connect?`;
      case 'ja-JP':
        return `こんにちは、${input.characterName}です。${input.scene}で見かけて、少し話してみたくなりました。`;
      case 'ko-KR':
        return `안녕하세요, 저는 ${input.characterName}입니다. ${input.scene}에서 스쳐 지나가다 인사하고 싶었어요.`;
      case 'zh-CN':
      default:
        return `你好，我是${input.characterName}。刚刚在${input.scene}遇到你，想先认识一下。`;
    }
  }

  async buildShakeGreetingFallback(characterName: string): Promise<string> {
    const language = await this.getLanguage();
    switch (language) {
      case 'en-US':
        return `Hi, I'm ${characterName}. We just met in Yinjie.`;
      case 'ja-JP':
        return `こんにちは、${characterName}です。隠界で偶然会いましたね。`;
      case 'ko-KR':
        return `안녕하세요, 저는 ${characterName}입니다. 방금 은계에서 우연히 만났네요.`;
      case 'zh-CN':
      default:
        return `你好，我是${characterName}。刚刚在隐界随机遇到你。`;
    }
  }

  async buildChannelFallbackText(authorName: string): Promise<string> {
    const language = await this.getLanguage();
    const opener = this.pickChannelFallbackOpener(language);
    switch (language) {
      case 'en-US':
        return `${opener}: ${authorName} just sent over an AI-generated short clip, worth pausing for 10 seconds.`;
      case 'ja-JP':
        return `${opener}：${authorName}から、10秒だけ立ち止まって見たくなるAI生成の短い映像が届きました。`;
      case 'ko-KR':
        return `${opener}: ${authorName}이(가) 잠깐 멈춰 10초만 봐도 좋은 AI 생성 짧은 영상을 보냈어요.`;
      case 'zh-CN':
      default:
        return `${opener}：${authorName} 刚刚发来一段 AI 生成的短片，适合停下来刷 10 秒。`;
    }
  }

  getIntlLocale(language: WorldLanguageCode) {
    return language;
  }

  getLocationFallback(language: WorldLanguageCode) {
    switch (language) {
      case 'en-US':
        return 'Hangzhou';
      case 'ja-JP':
        return '杭州';
      case 'ko-KR':
        return '항저우';
      case 'zh-CN':
      default:
        return '杭州';
    }
  }

  getDefaultCountry(language: WorldLanguageCode) {
    switch (language) {
      case 'en-US':
        return 'China';
      case 'ja-JP':
        return '中国';
      case 'ko-KR':
        return '중국';
      case 'zh-CN':
      default:
        return '中国';
    }
  }

  getDefaultRegion(language: WorldLanguageCode) {
    switch (language) {
      case 'en-US':
        return 'Zhejiang';
      case 'ja-JP':
        return '浙江';
      case 'ko-KR':
        return '저장';
      case 'zh-CN':
      default:
        return '浙江';
    }
  }

  mapWeatherCodeToLabel(
    language: WorldLanguageCode,
    weatherCode?: number,
    isDay?: number,
  ) {
    const table = WEATHER_LABELS[weatherCode ?? -1] ?? WEATHER_LABELS[-1];
    const dayKey = weatherCode === 0 && isDay === 0 ? 'night' : 'day';
    return table[dayKey]?.[language] ?? table.day[language];
  }

  private normalizeLanguage(
    value: unknown,
    fallback?: WorldLanguageCode,
  ): WorldLanguageCode {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (WORLD_LANGUAGE_OPTION_MAP.has(normalized as WorldLanguageCode)) {
      return normalized as WorldLanguageCode;
    }
    if (fallback) {
      return fallback;
    }
    throw new BadRequestException(
      'Unsupported world language. Use zh-CN, en-US, ja-JP, or ko-KR.',
    );
  }

  private renderSpeakerInstruction(
    language: WorldLanguageCode,
    characterName: string,
  ) {
    switch (language) {
      case 'en-US':
        return `The speaker is ${characterName}.`;
      case 'ja-JP':
        return `話し手は${characterName}です。`;
      case 'ko-KR':
        return `화자는 ${characterName}입니다.`;
      case 'zh-CN':
      default:
        return `说话人是${characterName}。`;
    }
  }

  private pickChannelFallbackOpener(language: WorldLanguageCode) {
    const openers = CHANNEL_FALLBACK_OPENERS[language];
    return openers[Math.floor(Math.random() * openers.length)] ?? openers[0];
  }
}

type WeatherLabel = {
  day: Record<WorldLanguageCode, string>;
  night?: Record<WorldLanguageCode, string>;
};

const CHANNEL_FALLBACK_OPENERS: Record<WorldLanguageCode, string[]> = {
  'zh-CN': [
    'AI 镜头记录',
    '今天的视频号片段',
    '刚刚捕捉到的世界画面',
    '这一帧想留给你看',
  ],
  'en-US': [
    'AI lens log',
    "Today's channel clip",
    'A world moment just captured',
    'A frame worth saving for you',
  ],
  'ja-JP': [
    'AIレンズの記録',
    '今日のチャンネル短編',
    'いま捉えた世界の一場面',
    'あなたに残したい一コマ',
  ],
  'ko-KR': [
    'AI 렌즈 기록',
    '오늘의 채널 클립',
    '방금 포착한 세계의 장면',
    '당신에게 남기고 싶은 한 프레임',
  ],
};

const WEATHER_LABELS: Record<number, WeatherLabel> = {
  [-1]: {
    day: {
      'zh-CN': '多云',
      'en-US': 'Cloudy',
      'ja-JP': '曇り',
      'ko-KR': '흐림',
    },
  },
  0: {
    day: {
      'zh-CN': '晴朗',
      'en-US': 'Clear',
      'ja-JP': '快晴',
      'ko-KR': '맑음',
    },
    night: {
      'zh-CN': '夜空晴朗',
      'en-US': 'Clear night sky',
      'ja-JP': '晴れた夜空',
      'ko-KR': '맑은 밤하늘',
    },
  },
  1: {
    day: {
      'zh-CN': '晴间多云',
      'en-US': 'Mostly clear',
      'ja-JP': '晴れ時々曇り',
      'ko-KR': '대체로 맑음',
    },
  },
  2: {
    day: {
      'zh-CN': '多云',
      'en-US': 'Cloudy',
      'ja-JP': '曇り',
      'ko-KR': '흐림',
    },
  },
  3: {
    day: {
      'zh-CN': '阴天',
      'en-US': 'Overcast',
      'ja-JP': '曇天',
      'ko-KR': '잔뜩 흐림',
    },
  },
  45: {
    day: {
      'zh-CN': '有雾',
      'en-US': 'Foggy',
      'ja-JP': '霧',
      'ko-KR': '안개',
    },
  },
  48: {
    day: {
      'zh-CN': '有雾',
      'en-US': 'Foggy',
      'ja-JP': '霧',
      'ko-KR': '안개',
    },
  },
  51: {
    day: {
      'zh-CN': '毛毛雨',
      'en-US': 'Drizzle',
      'ja-JP': '霧雨',
      'ko-KR': '이슬비',
    },
  },
  53: {
    day: {
      'zh-CN': '毛毛雨',
      'en-US': 'Drizzle',
      'ja-JP': '霧雨',
      'ko-KR': '이슬비',
    },
  },
  55: {
    day: {
      'zh-CN': '毛毛雨',
      'en-US': 'Drizzle',
      'ja-JP': '霧雨',
      'ko-KR': '이슬비',
    },
  },
  56: {
    day: {
      'zh-CN': '冻毛毛雨',
      'en-US': 'Freezing drizzle',
      'ja-JP': '着氷性の霧雨',
      'ko-KR': '어는 이슬비',
    },
  },
  57: {
    day: {
      'zh-CN': '冻毛毛雨',
      'en-US': 'Freezing drizzle',
      'ja-JP': '着氷性の霧雨',
      'ko-KR': '어는 이슬비',
    },
  },
  61: {
    day: {
      'zh-CN': '小雨',
      'en-US': 'Light rain',
      'ja-JP': '小雨',
      'ko-KR': '약한 비',
    },
  },
  63: {
    day: {
      'zh-CN': '中雨',
      'en-US': 'Rain',
      'ja-JP': '雨',
      'ko-KR': '비',
    },
  },
  65: {
    day: {
      'zh-CN': '大雨',
      'en-US': 'Heavy rain',
      'ja-JP': '大雨',
      'ko-KR': '강한 비',
    },
  },
  66: {
    day: {
      'zh-CN': '冻雨',
      'en-US': 'Freezing rain',
      'ja-JP': '着氷性の雨',
      'ko-KR': '어는 비',
    },
  },
  67: {
    day: {
      'zh-CN': '冻雨',
      'en-US': 'Freezing rain',
      'ja-JP': '着氷性の雨',
      'ko-KR': '어는 비',
    },
  },
  71: {
    day: {
      'zh-CN': '小雪',
      'en-US': 'Light snow',
      'ja-JP': '小雪',
      'ko-KR': '약한 눈',
    },
  },
  73: {
    day: {
      'zh-CN': '中雪',
      'en-US': 'Snow',
      'ja-JP': '雪',
      'ko-KR': '눈',
    },
  },
  75: {
    day: {
      'zh-CN': '大雪',
      'en-US': 'Heavy snow',
      'ja-JP': '大雪',
      'ko-KR': '강한 눈',
    },
  },
  77: {
    day: {
      'zh-CN': '雪粒',
      'en-US': 'Snow grains',
      'ja-JP': '雪粒',
      'ko-KR': '싸락눈',
    },
  },
  80: {
    day: {
      'zh-CN': '阵雨',
      'en-US': 'Rain showers',
      'ja-JP': 'にわか雨',
      'ko-KR': '소나기',
    },
  },
  81: {
    day: {
      'zh-CN': '较强阵雨',
      'en-US': 'Strong rain showers',
      'ja-JP': '強いにわか雨',
      'ko-KR': '강한 소나기',
    },
  },
  82: {
    day: {
      'zh-CN': '强阵雨',
      'en-US': 'Heavy rain showers',
      'ja-JP': '激しいにわか雨',
      'ko-KR': '매우 강한 소나기',
    },
  },
  85: {
    day: {
      'zh-CN': '阵雪',
      'en-US': 'Snow showers',
      'ja-JP': 'にわか雪',
      'ko-KR': '눈 소나기',
    },
  },
  86: {
    day: {
      'zh-CN': '阵雪',
      'en-US': 'Snow showers',
      'ja-JP': 'にわか雪',
      'ko-KR': '눈 소나기',
    },
  },
  95: {
    day: {
      'zh-CN': '雷阵雨',
      'en-US': 'Thunderstorm',
      'ja-JP': '雷雨',
      'ko-KR': '뇌우',
    },
  },
  96: {
    day: {
      'zh-CN': '雷暴伴冰雹',
      'en-US': 'Thunderstorm with hail',
      'ja-JP': 'ひょうを伴う雷雨',
      'ko-KR': '우박을 동반한 뇌우',
    },
  },
  99: {
    day: {
      'zh-CN': '雷暴伴冰雹',
      'en-US': 'Thunderstorm with hail',
      'ja-JP': 'ひょうを伴う雷雨',
      'ko-KR': '우박을 동반한 뇌우',
    },
  },
};
