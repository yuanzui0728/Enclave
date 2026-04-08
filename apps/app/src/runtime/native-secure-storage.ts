import { Capacitor, registerPlugin } from "@capacitor/core";

type SecureSessionStoragePlugin = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

const secureSessionStorage = registerPlugin<SecureSessionStoragePlugin>("YinjieSecureStorage");

export function isNativeSecureStorageAvailable() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
}

export async function getSecureStorageItem(key: string) {
  if (!isNativeSecureStorageAvailable()) {
    return null;
  }

  try {
    const result = await secureSessionStorage.get({ key });
    return result.value ?? null;
  } catch {
    return null;
  }
}

export async function setSecureStorageItem(key: string, value: string) {
  if (!isNativeSecureStorageAvailable()) {
    return false;
  }

  try {
    await secureSessionStorage.set({ key, value });
    return true;
  } catch {
    return false;
  }
}

export async function removeSecureStorageItem(key: string) {
  if (!isNativeSecureStorageAvailable()) {
    return false;
  }

  try {
    await secureSessionStorage.remove({ key });
    return true;
  } catch {
    return false;
  }
}
