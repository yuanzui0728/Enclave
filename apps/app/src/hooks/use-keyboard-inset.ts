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
  if (input.platform !== "android" || input.nativeKeyboardHeight <= 0) {
    return viewportInset;
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

    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("focusout", handleFocusChange);
    };
  }, [updateInset]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || nativePlatform !== "android") {
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
  }, [nativePlatform, updateInset]);

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
