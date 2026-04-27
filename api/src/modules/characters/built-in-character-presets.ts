import {
  CELEBRITY_CHARACTER_PRESETS,
  type CelebrityCharacterPreset,
} from './celebrity-character-presets';
import { FIXED_WORLD_CHARACTER_PRESETS } from './fixed-world-character-presets';
import { TEACHER_CHARACTER_PRESETS } from './teacher-character-presets';

export const BUILT_IN_CHARACTER_PRESETS: CelebrityCharacterPreset[] = [
  ...FIXED_WORLD_CHARACTER_PRESETS,
  ...TEACHER_CHARACTER_PRESETS,
  ...CELEBRITY_CHARACTER_PRESETS,
];

export function listBuiltInCharacterPresets() {
  return BUILT_IN_CHARACTER_PRESETS;
}

export function getBuiltInCharacterPreset(presetKey: string) {
  return BUILT_IN_CHARACTER_PRESETS.find(
    (preset) => preset.presetKey === presetKey,
  );
}
