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

const TRANSLATION_BATCH_SIZE = 150;
const TRANSLATION_PRIORITY_BATCH_SIZE = 300;
const MAX_AUTO_TRANSLATION_TARGETS = 650;
const MAX_AUTO_TRANSLATION_TEXT_LENGTH = 240;
const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const JAPANESE_KANA_PATTERN = /[\u3040-\u30ff]/;
const KOREAN_HANGUL_PATTERN = /[\uac00-\ud7af]/;
const ADMIN_ENGLISH_UI_PATTERN =
  /\b(API|Actions?|Agent|Analytics|Avatar|Catalog|Center|Chat|Configuration|Console|Cyber|Digital|Discovery|Edit|Evals|Follow|Game|Healthy|Inference|Models?|Navigation|Normal|Offline|Online|Operations?|Overview|Owner|Preview|Proactive|Ready|Records?|Reminder|Routing|Rules?|Runtime|Save|Self|Snapshot|Status|Sync|Token|Usage|View|Workspace)\b/i;

function isTranslatableTextValue(value: string) {
  const normalizedValue = value.trim().replace(/\s+/g, " ");
  return (
    normalizedValue.length > 0 &&
    normalizedValue.length <= MAX_AUTO_TRANSLATION_TEXT_LENGTH
  );
}

function isPotentialAutoTranslationText(
  value: string,
  locale: string,
) {
  if (!isTranslatableTextValue(value)) {
    return false;
  }

  if (CJK_PATTERN.test(value)) {
    return true;
  }

  if (locale === "zh-CN") {
    return (
      JAPANESE_KANA_PATTERN.test(value) ||
      KOREAN_HANGUL_PATTERN.test(value) ||
      ADMIN_ENGLISH_UI_PATTERN.test(value)
    );
  }

  if (locale === "ja-JP" || locale === "ko-KR") {
    return (
      JAPANESE_KANA_PATTERN.test(value) ||
      KOREAN_HANGUL_PATTERN.test(value) ||
      ADMIN_ENGLISH_UI_PATTERN.test(value)
    );
  }

  return false;
}

function isCanonicalAdminOriginalValue(value: string) {
  const normalizedValue = value.trim().replace(/\s+/g, " ");
  return (
    CJK_PATTERN.test(normalizedValue) &&
    !JAPANESE_KANA_PATTERN.test(normalizedValue) &&
    !KOREAN_HANGUL_PATTERN.test(normalizedValue) &&
    translateAdminUiText(normalizedValue, "en-US") !== normalizedValue
  );
}

export function AdminAutoTranslationBoundary({
  children,
}: AdminAutoTranslationBoundaryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textOriginalsRef = useRef(new WeakMap<Text, string>());
  const attributeOriginalsRef = useRef(
    new WeakMap<Element, Partial<Record<(typeof TRANSLATABLE_ATTRIBUTES)[number], string>>>(),
  );
  const hasStoredOriginalsRef = useRef(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const idleCallbackIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const { activationVersion, locale } = useAppLocale();

  const translate = useCallback(
    (value: string) => translateAdminUiText(value, locale),
    [activationVersion, locale],
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

        if (
          !existingOriginal &&
          locale !== "zh-CN" &&
          !isCanonicalAdminOriginalValue(currentValue)
        ) {
          if (node.nodeValue !== translatedCurrentValue) {
            node.nodeValue = translatedCurrentValue;
          }
          return;
        }

        const shouldRefreshOriginal =
          !existingOriginal ||
          (locale === "zh-CN" &&
            currentValue !== existingOriginal &&
            isCanonicalAdminOriginalValue(currentValue));
        const originalValue = shouldRefreshOriginal
          ? currentValue
          : existingOriginal;

        if (!originalValue) {
          return;
        }

        textOriginalsRef.current.set(node, originalValue);
        hasStoredOriginalsRef.current = true;
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

          if (
            !existingOriginal &&
            locale !== "zh-CN" &&
            !isCanonicalAdminOriginalValue(currentValue)
          ) {
            if (element.getAttribute(attribute) !== translatedCurrentValue) {
              element.setAttribute(attribute, translatedCurrentValue);
            }
            continue;
          }

          const shouldRefreshOriginal =
            !existingOriginal ||
            (locale === "zh-CN" &&
              currentValue !== existingOriginal &&
              isCanonicalAdminOriginalValue(currentValue));
          const originalValue = shouldRefreshOriginal
            ? currentValue
            : existingOriginal;

          if (!originalValue) {
            continue;
          }

          storedAttributes[attribute] = originalValue;
          attributeOriginalsRef.current.set(element, storedAttributes);
          hasStoredOriginalsRef.current = true;
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
          if (isPotentialAutoTranslationText(root.nodeValue ?? "", locale)) {
            targets.push(root);
          }
          return targets;
        }

        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                if (element !== root && element.matches(SKIP_SELECTOR)) {
                  return NodeFilter.FILTER_REJECT;
                }

                return TRANSLATABLE_ATTRIBUTES.some((attribute) =>
                  element.hasAttribute(attribute),
                )
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_SKIP;
              }

              const parent = node.parentElement;
              return !parent ||
                parent.closest(SKIP_SELECTOR) ||
                !isPotentialAutoTranslationText(node.nodeValue ?? "", locale)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
            },
          },
        );
        let node = walker.nextNode();
        while (node && targets.length < MAX_AUTO_TRANSLATION_TARGETS) {
          targets.push(node);
          node = walker.nextNode();
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
    [activationVersion, locale, translate],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    if (locale === "zh-CN" && !hasStoredOriginalsRef.current) {
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
