import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
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

const TRANSLATION_BATCH_SIZE = 800;
const TRANSLATION_PRIORITY_BATCH_SIZE = 1800;

export function AdminAutoTranslationBoundary({
  children,
}: AdminAutoTranslationBoundaryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textOriginalsRef = useRef(new WeakMap<Text, string>());
  const attributeOriginalsRef = useRef(
    new WeakMap<Element, Partial<Record<(typeof TRANSLATABLE_ATTRIBUTES)[number], string>>>(),
  );
  const observerRef = useRef<MutationObserver | null>(null);
  const idleCallbackIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const { locale } = useAppLocale();

  const translate = useCallback(
    (value: string) => translateAdminUiText(value, locale),
    [locale],
  );

  const applyTranslations = useMemo(
    () => {
      const translateTextNode = (node: Text) => {
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP_SELECTOR)) {
          return;
        }

        const currentValue = node.nodeValue ?? "";
        const existingOriginal = textOriginalsRef.current.get(node);
        const translatedCurrentValue = translate(currentValue);
        if (!existingOriginal && translatedCurrentValue === currentValue) {
          return;
        }

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
          const translatedCurrentValue = translate(currentValue);
          if (!existingOriginal && translatedCurrentValue === currentValue) {
            continue;
          }

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

      const collectTargets = (root: Node) => {
        const targets: Node[] = [];

        if (root.nodeType === Node.TEXT_NODE) {
          targets.push(root);
          return targets;
        }

        if (root.nodeType === Node.ELEMENT_NODE) {
          targets.push(root);
        }

        const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode = textWalker.nextNode();
        while (textNode) {
          targets.push(textNode);
          textNode = textWalker.nextNode();
        }

        const elementWalker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_ELEMENT,
        );
        let elementNode = elementWalker.nextNode();
        while (elementNode) {
          targets.push(elementNode);
          elementNode = elementWalker.nextNode();
        }

        return targets;
      };

      const applyTarget = (target: Node) => {
        if (target.nodeType === Node.TEXT_NODE) {
          translateTextNode(target as Text);
          return;
        }

        if (target.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(target as Element);
        }
      };

      return {
        collectTargets,
        applyTarget,
      };
    },
    [locale, translate],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    let cancelled = false;
    let frameId = 0;
    const pendingTargets = new Set<Node>();

    const clearScheduledWork = () => {
      if (idleCallbackIdRef.current !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackIdRef.current);
        idleCallbackIdRef.current = null;
      }

      if (timeoutIdRef.current !== null) {
        globalThis.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };

    const scheduleBatch = (targets: Node[]) => {
      clearScheduledWork();
      let cursor = 0;

      const runBatch = (batchSize = TRANSLATION_BATCH_SIZE) => {
        if (cancelled) {
          return;
        }

        const observer = observerRef.current;
        observer?.disconnect();

        const end = Math.min(cursor + batchSize, targets.length);
        while (cursor < end) {
          const target = targets[cursor];
          cursor += 1;
          if (target && root.contains(target)) {
            applyTranslations.applyTarget(target);
          }
        }

        observer?.observe(root, {
          attributes: true,
          attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
          childList: true,
          subtree: true,
        });

        if (cursor >= targets.length) {
          idleCallbackIdRef.current = null;
          timeoutIdRef.current = null;
          return;
        }

        scheduleNextBatch();
      };

      const scheduleNextBatch = () => {
        if ("requestIdleCallback" in window) {
          idleCallbackIdRef.current = window.requestIdleCallback(
            () => runBatch(),
            {
              timeout: 120,
            },
          );
          return;
        }

        timeoutIdRef.current = globalThis.setTimeout(() => runBatch(), 16);
      };

      runBatch(TRANSLATION_PRIORITY_BATCH_SIZE);
    };

    scheduleBatch(applyTranslations.collectTargets(root));

    const schedulePendingApply = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const targets = Array.from(pendingTargets).flatMap((target) =>
          applyTranslations.collectTargets(target),
        );
        pendingTargets.clear();
        scheduleBatch(targets);
      });
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => pendingTargets.add(node));
          continue;
        }

        pendingTargets.add(mutation.target);
      }

      if (pendingTargets.size > 0) {
        schedulePendingApply();
      }
    });
    observerRef.current = observer;

    observer.observe(root, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (observerRef.current === observer) {
        observerRef.current = null;
      }
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      clearScheduledWork();
    };
  }, [applyTranslations]);

  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
