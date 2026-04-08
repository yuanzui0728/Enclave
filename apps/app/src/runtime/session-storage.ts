import { createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  getSecureStorageItem,
  isNativeSecureStorageAvailable,
  removeSecureStorageItem,
  setSecureStorageItem,
} from "./native-secure-storage";

const memoryStorage = new Map<string, string>();

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createStateStorage(): StateStorage {
  return {
    async getItem(name) {
      const secureValue = await getSecureStorageItem(name);
      if (secureValue !== null) {
        return secureValue;
      }

      const storage = getLocalStorage();
      return storage ? storage.getItem(name) : memoryStorage.get(name) ?? null;
    },
    async setItem(name, value) {
      const storedSecurely = await setSecureStorageItem(name, value);
      if (storedSecurely) {
        return;
      }

      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(name, value);
        return;
      }

      memoryStorage.set(name, value);
    },
    async removeItem(name) {
      const removedSecurely = await removeSecureStorageItem(name);
      if (removedSecurely) {
        return;
      }

      const storage = getLocalStorage();
      if (storage) {
        storage.removeItem(name);
        return;
      }

      memoryStorage.delete(name);
    },
  };
}

export function createSessionStateStorage() {
  return createJSONStorage(() => createStateStorage());
}

export function getSessionStorageMode() {
  return isNativeSecureStorageAvailable() ? "secure-storage" : "web-storage";
}
