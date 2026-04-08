export interface SuccessResponse {
  success: boolean;
}

export interface SessionPayload {
  token: string;
  userId: string;
  username: string;
  onboardingCompleted: boolean;
  avatar?: string;
  signature?: string;
  hasCustomApiKey: boolean;
  customApiBase?: string | null;
}
