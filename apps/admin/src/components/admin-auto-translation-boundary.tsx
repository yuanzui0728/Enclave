import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAppLocale } from "@yinjie/i18n";
import { translateAdminUiText } from "../lib/admin-ui-translation";

type AdminAutoTranslationBoundaryProps = {
  children: ReactNode;
};

const TRANSLATABLE_ATTRIBUTES = [
  "aria-label",
  "placeholder",
  "title",
] as const;

const SKIP_SELECTOR = [
  "[data-i18n-skip]",
  "[data-admin-i18n-skip]",
  "code",
  "pre",
  "script",
  "style",
  "textarea",
].join(",");

export function AdminAutoTranslationBoundary({
  children,
}: AdminAutoTranslationBoundaryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textOriginalsRef = useRef(new WeakMap<Text, string>());
  const attributeOriginalsRef = useRef(
    new WeakMap<Element, Partial<Record<(typeof TRANSLATABLE_ATTRIBUTES)[number], string>>>(),
  );
  const { locale } = useAppLocale();

  const translate = useCallback(
    (value: string) => translateAdminUiText(value, locale),
    [locale],
  );

  const applyTranslations = useMemo(
    () => (root: ParentNode) => {
      const translateTextNode = (node: Text) => {
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP_SELECTOR)) {
          return;
        }

        const currentValue = node.nodeValue ?? "";
        const existingOriginal = textOriginalsRef.current.get(node);
        const translatedExistingOriginal = existingOriginal
          ? translate(existingOriginal)
          : null;
        const shouldRefreshOriginal =
          !existingOriginal ||
          (currentValue !== existingOriginal &&
            currentValue !== translatedExistingOriginal &&
            translate(currentValue) !== currentValue);
        const originalValue = shouldRefreshOriginal
          ? currentValue
          : existingOriginal;

        if (!originalValue) {
          return;
        }

        textOriginalsRef.current.set(node, originalValue);
        const nextValue = locale === "zh-CN" ? originalValue : translate(originalValue);
        if (node.nodeValue !== nextValue) {
          node.nodeValue = nextValue;
        }
      };

      const translateElementAttributes = (element: Element) => {
        if (element.closest(SKIP_SELECTOR)) {
          return;
        }

        for (const attribute of TRANSLATABLE_ATTRIBUTES) {
          if (!element.hasAttribute(attribute)) {
            continue;
          }

          const currentValue = element.getAttribute(attribute) ?? "";
          const storedAttributes =
            attributeOriginalsRef.current.get(element) ?? {};
          const existingOriginal = storedAttributes[attribute];
          const translatedExistingOriginal = existingOriginal
            ? translate(existingOriginal)
            : null;
          const shouldRefreshOriginal =
            !existingOriginal ||
            (currentValue !== existingOriginal &&
              currentValue !== translatedExistingOriginal &&
              translate(currentValue) !== currentValue);
          const originalValue = shouldRefreshOriginal
            ? currentValue
            : existingOriginal;

          if (!originalValue) {
            continue;
          }

          storedAttributes[attribute] = originalValue;
          attributeOriginalsRef.current.set(element, storedAttributes);
          const nextValue =
            locale === "zh-CN" ? originalValue : translate(originalValue);
          if (element.getAttribute(attribute) !== nextValue) {
            element.setAttribute(attribute, nextValue);
          }
        }
      };

      const textWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
      );
      let textNode = textWalker.nextNode();
      while (textNode) {
        translateTextNode(textNode as Text);
        textNode = textWalker.nextNode();
      }

      const elementWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      let elementNode = elementWalker.nextNode();
      while (elementNode) {
        translateElementAttributes(elementNode as Element);
        elementNode = elementWalker.nextNode();
      }
    },
    [locale, translate],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    applyTranslations(root);
    let frameId = 0;
    const scheduleApply = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        applyTranslations(root);
      });
    };

    const observer = new MutationObserver(scheduleApply);

    observer.observe(root, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [applyTranslations]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
