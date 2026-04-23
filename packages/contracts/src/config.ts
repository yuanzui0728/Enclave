export const AVAILABLE_AI_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-haiku-4-5-20251001-thinking",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514-thinking",
  "claude-sonnet-4-5",
  "deepseek-chat",
  "deepseek-r1",
  "deepseek-r1-0528",
  "deepseek-v3",
  "deepseek-v3-1-think-250821",
  "deepseek-v3.1-fast",
  "deepseek-v3.2-exp-thinking",
  "ERNIE-Tiny-8K",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gpt-4-0613",
  "gpt-4-vision-preview",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-5",
  "gpt-5-all",
  "gpt-5.1-chat-latest",
  "gpt-5.3-chat-latest",
  "glm-4.5",
  "glm-4.5-air",
  "grok-4.1",
  "grok-4.1-fast",
  "hunyuan-t1",
  "kimi-k2",
  "kimi-latest",
  "llama-3.2-1b-instruct",
  "MiniMax-M1",
  "o1",
  "o3",
  "o4-mini-all",
  "qvq-max",
  "qwen-turbo-2025-07-15",
  "qwen3-coder-plus",
  "qwen3-max",
] as const;

export type AvailableAiModel = (typeof AVAILABLE_AI_MODELS)[number];

export interface AiModelResponse {
  model: string;
}

export interface UpdateAiModelRequest {
  model: string;
}

export interface AvailableModelsResponse {
  models: string[];
}
