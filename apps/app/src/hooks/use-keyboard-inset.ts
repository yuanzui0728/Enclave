import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { getNativeShellPlatform } from "../lib/native-shell";

function readKeyboardInset() {
  if (typeof window === "undefined" || !window.visualViewport) {
    return 0;
  }

  const inset =
    window.innerHeight -
    window.visualViewport.height -
    window.visualViewport.offsetTop;
  return inset > 0 ? Math.round(inset) : 0;
}

function readWindowHeight() {
  if (typeof window === "undefined") {
    return 0;
  }

  return Math.round(window.innerHeight);
}

function resolveKeyboardInset(input: {
  layoutHeight: number;
  nativeKeyboardHeight: number;
  platform: string | null;
}) {
  const viewportInset = readKeyboardInset();
  if (input.nativeKeyboardHeight <= 0) {
    return viewportInset;
  }

  if (input.platform === "ios") {
    // iOS Capacitor 在 contentInset:"always" 下 WebView 不会收缩，
    // visualViewport 通常已经反映键盘高度；此处插件值仅作为兜底（max 取较大者）。
    return Math.max(viewportInset, input.nativeKeyboardHeight);
  }

  // Android WebView may overlay the IME without resizing the page.
  const currentWindowHeight = readWindowHeight();
  const windowShrinkInset = Math.max(
    input.layoutHeight - currentWindowHeight,
    0,
  );
  return Math.max(
    viewportInset,
    input.nativeKeyboardHeight - windowShrinkInset,
  );
}

function hasFocusedEditableElement() {
  if (typeof document === "undefined") {
    return false;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return false;
  }

  if (activeElement.isContentEditable) {
    return true;
  }

  if (activeElement instanceof HTMLTextAreaElement) {
    return !activeElement.readOnly && !activeElement.disabled;
  }

  if (!(activeElement instanceof HTMLInputElement)) {
    return false;
  }

  if (activeElement.readOnly || activeElement.disabled) {
    return false;
  }

  const inputType = activeElement.type.toLowerCase();
  return !NON_EDITABLE_INPUT_TYPES.has(inputType);
}

export function useKeyboardInset() {
  const nativePlatform = getNativeShellPlatform();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const layoutHeightRef = useRef(readWindowHeight());
  const nativeKeyboardHeightRef = useRef(0);
  const updateInset = useEffectEvent(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!hasFocusedEditableElement()) {
      if (nativeKeyboardHeightRef.current <= 0) {
        layoutHeightRef.current = readWindowHeight();
      }
      setKeyboardInset(0);
      return;
    }

    setKeyboardInset(
      resolveKeyboardInset({
        layoutHeight: layoutHeightRef.current,
        nativeKeyboardHeight: nativeKeyboardHeightRef.current,
        platform: nativePlatform,
      }),
    );
  });

  useEffect(() => {
    layoutHeightRef.current = readWindowHeight();
    updateInset();

    const viewport = window.visualViewport;
    const syncLayoutHeight = () => {
      if (
        nativeKeyboardHeightRef.current <= 0 &&
        !hasFocusedEditableElement()
      ) {
        layoutHeightRef.current = readWindowHeight();
      }
    };
    const handleViewportChange = () => {
      syncLayoutHeight();
      updateInset();
    };
    const handleFocusChange = () => {
      syncLayoutHeight();
      updateInset();
    };

    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("focusin", handleFocusChange);
    window.addEventListener("focusout", handleFocusChange);
    // BFCache 恢复 / 后台切前台时，iOS Safari 不一定触发 visualViewport.resize
    window.addEventListener("pageshow", handleViewportChange);
    document.addEventListener("visibilitychange", handleViewportChange);

    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("focusout", handleFocusChange);
      window.removeEventListener("pageshow", handleViewportChange);
      document.removeEventListener("visibilitychange", handleViewportChange);
    };
    // 走查 Round 2：useEffectEvent 返回值每渲染都换新身份，按 React 19.2 文档
    // 不应放进 effect deps。原来挂在 [updateInset] 里 → MobileShell 每次重渲
    // (路由变 / TanStack Query 抖 / setKeyboardInset 自己) 都触发 effect 重跑：
    // viewport/window/document 一圈 listener 全部 remove + add 一遍；同帧
    // logcat 里能看到 Capacitor Keyboard 4 add + 4 remove 一组组刷，每秒
    // 数轮，纯白烧主线程。updateInset 是 Effect Event，识别 latest props
    // 但识别符稳定与否对副作用没意义。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !Capacitor.isNativePlatform() ||
      (nativePlatform !== "android" && nativePlatform !== "ios")
    ) {
      return;
    }

    let listenerHandles: PluginListenerHandle[] = [];
    let disposed = false;
    const syncNativeKeyboardHeight = (keyboardHeight: number) => {
      nativeKeyboardHeightRef.current = Math.max(Math.round(keyboardHeight), 0);
      updateInset();
    };

    void Promise.all([
      Keyboard.addListener("keyboardWillShow", (info) => {
        syncNativeKeyboardHeight(info.keyboardHeight);
      }),
      Keyboard.addListener("keyboardDidShow", (info) => {
        syncNativeKeyboardHeight(info.keyboardHeight);
      }),
      Keyboard.addListener("keyboardWillHide", () => {
        syncNativeKeyboardHeight(0);
      }),
      Keyboard.addListener("keyboardDidHide", () => {
        syncNativeKeyboardHeight(0);
      }),
    ])
      .then((handles) => {
        if (disposed) {
          handles.forEach((handle) => {
            void handle.remove();
          });
          return;
        }

        listenerHandles = handles;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      nativeKeyboardHeightRef.current = 0;
      listenerHandles.forEach((handle) => {
        void handle.remove();
      });
    };
    // 走查 Round 2：同上，updateInset (useEffectEvent) 不能进 deps。这条
    // effect 还多挂了 [nativePlatform]，加上 updateInset 不稳定，cycle 更
    // 短——Capacitor Keyboard.addListener 每次都开一个新的 RPC callback
    // slot 同步给 native，最终原生 Java 端 EventEmitter 上挂着上百个孤儿
    // listener。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativePlatform]);

  return {
    keyboardInset,
    keyboardOpen: keyboardInset > 0,
    nativePlatform,
  };
}

const NON_EDITABLE_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
