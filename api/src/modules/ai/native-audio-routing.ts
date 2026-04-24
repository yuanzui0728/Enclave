const PREFERRED_NATIVE_AUDIO_MODEL_IDS = [
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-audio-2025-08-28',
] as const;

function normalizeModelId(modelId: string) {
  return modelId.trim();
}

export function isDedicatedNativeAudioModel(modelId: string) {
  const normalized = normalizeModelId(modelId).toLowerCase();
  if (!normalized) {
    return false;
  }

  return /(^|[-_])(audio|audio-preview|realtime)([-_]|$)/i.test(normalized);
}

export function canUseOpenAiNativeAudioFallback(modelId: string) {
  const normalized = normalizeModelId(modelId).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith('gpt-') ||
    /^o\d/i.test(normalized) ||
    normalized.includes('gpt-4o')
  );
}

export function buildNativeAudioModelCandidates(modelId: string) {
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return [];
  }

  if (
    isDedicatedNativeAudioModel(normalized) ||
    !canUseOpenAiNativeAudioFallback(normalized)
  ) {
    return [normalized];
  }

  return [
    ...PREFERRED_NATIVE_AUDIO_MODEL_IDS.filter((item) => item !== normalized),
    normalized,
  ];
}
