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
    getItem(name) {
      if (isNativeSecureStorageAvailable()) {
        return getSecureStorageItem(name).then((secureValue) => {
          if (secureValue !== null) {
            return secureValue;
          }

          const storage = getLocalStorage();
          return storage ? storage.getItem(name) : memoryStorage.get(name) ?? null;
        });
      }

      const storage = getLocalStorage();
      return storage ? storage.getItem(name) : memoryStorage.get(name) ?? null;
    },
    setItem(name, value) {
      if (isNativeSecureStorageAvailable()) {
        return setSecureStorageItem(name, value).then((storedSecurely) => {
          if (storedSecurely) {
            return;
          }

          const storage = getLocalStorage();
          if (storage) {
            storage.setItem(name, value);
            return;
          }

          memoryStorage.set(name, value);
        });
      }

      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(name, value);
        return;
      }

      memoryStorage.set(name, value);
    },
    removeItem(name) {
      if (isNativeSecureStorageAvailable()) {
        return removeSecureStorageItem(name).then((removedSecurely) => {
          if (removedSecurely) {
            return;
          }

          const storage = getLocalStorage();
          if (storage) {
            storage.removeItem(name);
            return;
          }

          memoryStorage.delete(name);
        });
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
