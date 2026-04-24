export type SpeechTranscriptionMode = "dictation" | "voice_call";

export type VoiceCallTranscriptStatus =
  | "completed"
  | "pending"
  | "failed"
  | "skipped";

export interface SpeechTranscriptionResult {
  text: string;
  durationMs: number;
  provider?: string;
}

export interface SpeechSynthesisRequest {
  text: string;
  conversationId?: string;
  characterId?: string;
  voice?: string;
}

export interface SpeechSynthesisResult {
  audioUrl: string;
  mimeType: string;
  fileName: string;
  provider?: string;
  voice?: string;
  durationMs: number;
}

export interface VoiceCallTurnResult {
  conversationId: string;
  characterId: string;
  characterName: string;
  userTranscript?: string;
  transcriptStatus: VoiceCallTranscriptStatus;
  assistantText: string;
  assistantAudioUrl: string;
  assistantAudioFileName: string;
  assistantAudioMimeType: string;
  transcriptionDurationMs?: number;
  synthesisDurationMs: number;
  totalDurationMs: number;
  provider?: string;
  userMessageId: string;
  assistantMessageId: string;
}

export type DigitalHumanCallMode = "desktop_video_call" | "mobile_video_call";

export type DigitalHumanProvider =
  | "mock_digital_human"
  | "external_digital_human";

export type DigitalHumanPresentationMode = "mock_stage" | "provider_stream";

export type DigitalHumanTransport = "audio_poster" | "player_url" | "stream_url";

export type DigitalHumanSessionStatus = "ready" | "playing" | "ended";

export type DigitalHumanRenderStatus =
  | "queued"
  | "rendering"
  | "ready"
  | "failed";

export interface CreateDigitalHumanSessionRequest {
  conversationId: string;
  characterId?: string;
  mode?: DigitalHumanCallMode;
}

export interface UpdateDigitalHumanProviderStateRequest {
  renderStatus: DigitalHumanRenderStatus;
  status?: DigitalHumanSessionStatus;
  playerUrl?: string;
  streamUrl?: string;
  posterUrl?: string;
}

export interface DigitalHumanSession {
  id: string;
  conversationId: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  mode: DigitalHumanCallMode;
  provider: DigitalHumanProvider;
  presentationMode: DigitalHumanPresentationMode;
  transport?: DigitalHumanTransport;
  playerUrl?: string;
  streamUrl?: string;
  posterUrl?: string;
  renderStatus?: DigitalHumanRenderStatus;
  capabilities?: {
    supportsRealtimeStream: boolean;
    supportsInterrupt: boolean;
    supportsSubtitle: boolean;
  };
  status: DigitalHumanSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastTurn?: VoiceCallTurnResult;
}

export interface DigitalHumanTurnResult {
  session: DigitalHumanSession;
  turn: VoiceCallTurnResult;
  renderStatus?: DigitalHumanRenderStatus;
}
