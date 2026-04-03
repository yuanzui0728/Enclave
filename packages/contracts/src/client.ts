import type { AuthSession, InitUserRequest, LoginRequest, SuccessResponse, RegisterRequest, UpdateUserRequest } from "./auth";
import type { Character, CharacterDraft } from "./characters";
import type { AiModelResponse, AvailableModelsResponse, UpdateAiModelRequest } from "./config";
import type {
  LogIndexResponse,
  OperationResult,
  ProviderTestRequest,
  ProviderTestResult,
  SystemStatus,
} from "./system";
import { LEGACY_API_PREFIX } from "./api";

export const DEFAULT_CORE_API_BASE_URL = "http://127.0.0.1:39091";

export function resolveCoreApiBaseUrl(override?: string) {
  return override || DEFAULT_CORE_API_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${resolveCoreApiBaseUrl(baseUrl)}${path}`, {
    headers,
    ...init,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    let body: { message?: string } | null = null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as { message?: string };
      } catch {
        body = null;
      }
    }

    const message = body?.message ?? rawBody;
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return (rawBody ? (JSON.parse(rawBody) as T) : undefined) as T;
}

function requestLegacyApi<T>(path: string, init?: RequestInit, baseUrl?: string) {
  return request<T>(`${LEGACY_API_PREFIX}${path}`, init, baseUrl);
}

export function getSystemStatus(baseUrl?: string) {
  return request<SystemStatus>("/system/status", undefined, baseUrl);
}

export function testProviderConnection(payload: ProviderTestRequest, baseUrl?: string) {
  return request<ProviderTestResult>(
    "/system/provider/test",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getSystemLogs(baseUrl?: string) {
  return request<LogIndexResponse>("/system/logs", undefined, baseUrl);
}

export function exportDiagnostics(baseUrl?: string) {
  return request<OperationResult>(
    "/system/diag/export",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function createBackup(baseUrl?: string) {
  return request<OperationResult>(
    "/system/backup/create",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function restoreBackup(baseUrl?: string) {
  return request<OperationResult>(
    "/system/backup/restore",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function registerUser(payload: RegisterRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function loginUser(payload: LoginRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function initUser(payload: InitUserRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/init",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function completeOnboarding(userId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/users/${userId}/onboarding-complete`,
    {
      method: "PATCH",
    },
    baseUrl,
  );
}

export function updateUser(userId: string, payload: UpdateUserRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/users/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getAiModel(baseUrl?: string) {
  return requestLegacyApi<AiModelResponse>("/config/ai-model", undefined, baseUrl);
}

export function setAiModel(payload: UpdateAiModelRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    "/config/ai-model",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getAvailableModels(baseUrl?: string) {
  return requestLegacyApi<AvailableModelsResponse>("/config/available-models", undefined, baseUrl);
}

export function listCharacters(baseUrl?: string) {
  return requestLegacyApi<Character[]>("/characters", undefined, baseUrl);
}

export function getCharacter(id: string, baseUrl?: string) {
  return requestLegacyApi<Character>(`/characters/${id}`, undefined, baseUrl);
}

export function createCharacter(payload: CharacterDraft, baseUrl?: string) {
  return requestLegacyApi<Character>(
    "/characters",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function updateCharacter(id: string, payload: CharacterDraft, baseUrl?: string) {
  return requestLegacyApi<Character>(
    `/characters/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function deleteCharacter(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/characters/${id}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}
