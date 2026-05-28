// i18n-ignore-start: data / preset content — labels are localized on the client.
// MiniMax 系统音色目录（speech-02-hd 可用）。voice_id 原样透给 t2a_v2 的
// voice_setting.voice_id。labelZh/labelEn 是给前端展示用的人话名字，gender 供
// 前端分组，sampleText 是「试听」默认朗读文本。team 可按需增删。

export type VoiceGender = 'male' | 'female' | 'neutral';

export type VoicePreset = {
  id: string;
  labelZh: string;
  labelEn: string;
  gender: VoiceGender;
};

export const VOICE_PREVIEW_SAMPLE_TEXT = '你好呀，很高兴认识你，这是我现在的声音。';

export const VOICE_PRESETS: readonly VoicePreset[] = [
  { id: 'male-qn-qingse', labelZh: '青涩青年', labelEn: 'Fresh Young Man', gender: 'male' },
  { id: 'male-qn-jingying', labelZh: '精英青年', labelEn: 'Elite Young Man', gender: 'male' },
  { id: 'male-qn-badao', labelZh: '霸道青年', labelEn: 'Dominant Young Man', gender: 'male' },
  { id: 'male-qn-daxuesheng', labelZh: '青年大学生', labelEn: 'College Student (M)', gender: 'male' },
  { id: 'presenter_male', labelZh: '男主持人', labelEn: 'Male Presenter', gender: 'male' },
  { id: 'audiobook_male_1', labelZh: '有声书男声·一', labelEn: 'Audiobook Male 1', gender: 'male' },
  { id: 'audiobook_male_2', labelZh: '有声书男声·二', labelEn: 'Audiobook Male 2', gender: 'male' },
  { id: 'female-shaonv', labelZh: '少女', labelEn: 'Young Girl', gender: 'female' },
  { id: 'female-yujie', labelZh: '御姐', labelEn: 'Mature Lady', gender: 'female' },
  { id: 'female-chengshu', labelZh: '成熟女性', labelEn: 'Mature Woman', gender: 'female' },
  { id: 'female-tianmei', labelZh: '甜美女性', labelEn: 'Sweet Woman', gender: 'female' },
  { id: 'presenter_female', labelZh: '女主持人', labelEn: 'Female Presenter', gender: 'female' },
  { id: 'audiobook_female_1', labelZh: '有声书女声·一', labelEn: 'Audiobook Female 1', gender: 'female' },
  { id: 'audiobook_female_2', labelZh: '有声书女声·二', labelEn: 'Audiobook Female 2', gender: 'female' },
];

const VOICE_PRESET_IDS = new Set(VOICE_PRESETS.map((v) => v.id));

export function isKnownVoicePresetId(id: string): boolean {
  return VOICE_PRESET_IDS.has(id);
}
// i18n-ignore-end
