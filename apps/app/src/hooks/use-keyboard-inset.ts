import { useEffect, useEffectEvent, useState } from "react";
import { getNativeShellPlatform } from "../lib/native-shell";

function readKeyboardInset() {
  if (typeof window === "undefined" || !window.visualViewport) {
    return 0;
  }

  const inset = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
  return inset > 0 ? Math.round(inset) : 0;
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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const updateInset = useEffectEvent(() => {
    setKeyboardInset(hasFocusedEditableElement() ? readKeyboardInset() : 0);
  });

  useEffect(() => {
    updateInset();

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    window.addEventListener("focusin", updateInset);
    window.addEventListener("focusout", updateInset);

    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      window.removeEventListener("focusin", updateInset);
      window.removeEventListener("focusout", updateInset);
    };
  }, [updateInset]);

  return {
    keyboardInset,
    keyboardOpen: keyboardInset > 0,
    nativePlatform: getNativeShellPlatform(),
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
