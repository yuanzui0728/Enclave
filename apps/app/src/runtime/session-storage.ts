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
            // 写 Keychain 成功后顺手清掉同名 localStorage / memory 旧拷贝。
            // 老版本 app 装在同台设备过、或者上一次 secure 不可用临时落到
            // localStorage，都会留下副本——如果不清，getItem 在某次 keychain
            // 读失败时就会回退读到陈年遗留状态（旧 owner / 旧 session token）。
            getLocalStorage()?.removeItem(name);
            memoryStorage.delete(name);
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
            // 删 Keychain 成功也必须清 localStorage / memory 旧拷贝，否则
            // 「登出」之后 secure storage 没了，回退读路径还在 localStorage
            // 里读得到旧 token，等于没删干净。
            getLocalStorage()?.removeItem(name);
            memoryStorage.delete(name);
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
