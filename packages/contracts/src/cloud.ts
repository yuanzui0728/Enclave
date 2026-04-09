export type CloudWorldStatus = "none" | "pending" | "provisioning" | "active" | "rejected" | "disabled";

export interface SendPhoneCodeRequest {
  phone: string;
}

export interface SendPhoneCodeResponse {
  phone: string;
  expiresAt: string;
  debugCode?: string | null;
}

export interface VerifyPhoneCodeRequest {
  phone: string;
  code: string;
}

export interface VerifyPhoneCodeResponse {
  accessToken: string;
  phone: string;
  expiresAt: string;
}

export interface CreateCloudWorldRequest {
  worldName: string;
}

export interface CloudWorldSummary {
  id: string;
  phone: string;
  name: string;
  status: Exclude<CloudWorldStatus, "none">;
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorldRequestRecord {
  id: string;
  phone: string;
  worldName: string;
  status: Exclude<CloudWorldStatus, "none">;
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorldLookupResponse {
  phone: string;
  status: CloudWorldStatus;
  world: CloudWorldSummary | null;
  latestRequest: CloudWorldRequestRecord | null;
}
