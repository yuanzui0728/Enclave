import { useEffect } from "react";
import { DEFAULT_LOCALE, type SupportedLocale } from "../locales";

const SKIP_ELEMENT_SELECTOR = [
  "script",
  "style",
  "noscript",
  "[contenteditable='true']",
  "[data-i18n-skip='true']",
].join(",");

const SKIP_TEXT_ELEMENT_SELECTOR = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "option",
  "[contenteditable='true']",
  "[data-i18n-skip='true']",
].join(",");

const LOCALIZED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;

const originalTextByNode = new WeakMap<Text, string>();
const lastLocalizedTextByNode = new WeakMap<Text, string>();
const originalAttributeByElement = new WeakMap<Element, Map<string, string>>();
const lastLocalizedAttributeByElement = new WeakMap<
  Element,
  Map<string, string>
>();

type DomTextLocalizerProps = {
  dictionary: ReadonlyMap<string, string>;
  locale: SupportedLocale;
  version: number;
};

export function DomTextLocalizer({
  dictionary,
  locale,
  version,
}: DomTextLocalizerProps) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const translateValue = (sourceValue: string) => {
      if (locale === DEFAULT_LOCALE) {
        return sourceValue;
      }

      const trimmedSource = sourceValue.trim();
      if (!trimmedSource) {
        return sourceValue;
      }

      const translatedValue = dictionary.get(trimmedSource);
      const patternedValue =
        translatedValue ??
        translateKnownPattern(trimmedSource, locale, dictionary);
      if (!patternedValue) {
        return sourceValue;
      }

      const leadingWhitespace = sourceValue.match(/^\s*/)?.[0] ?? "";
      const trailingWhitespace = sourceValue.match(/\s*$/)?.[0] ?? "";
      return `${leadingWhitespace}${patternedValue}${trailingWhitespace}`;
    };

    const shouldSkipElement = (element: Element | null) =>
      !element || Boolean(element.closest(SKIP_ELEMENT_SELECTOR));

    const shouldSkipTextElement = (element: Element | null) =>
      !element || Boolean(element.closest(SKIP_TEXT_ELEMENT_SELECTOR));

    const localizeTextNode = (node: Text) => {
      if (shouldSkipTextElement(node.parentElement)) {
        return;
      }

      const currentValue = node.nodeValue ?? "";
      const lastLocalizedValue = lastLocalizedTextByNode.get(node);
      let originalValue = originalTextByNode.get(node);

      if (!originalValue || currentValue !== lastLocalizedValue) {
        originalValue = currentValue;
        originalTextByNode.set(node, originalValue);
      }

      const nextValue = translateValue(originalValue);
      if (currentValue !== nextValue) {
        node.nodeValue = nextValue;
      }
      lastLocalizedTextByNode.set(node, nextValue);
    };

    const localizeElementAttributes = (element: Element) => {
      if (shouldSkipElement(element)) {
        return;
      }

      let originalAttributes = originalAttributeByElement.get(element);
      if (!originalAttributes) {
        originalAttributes = new Map<string, string>();
        originalAttributeByElement.set(element, originalAttributes);
      }

      let lastLocalizedAttributes =
        lastLocalizedAttributeByElement.get(element);
      if (!lastLocalizedAttributes) {
        lastLocalizedAttributes = new Map<string, string>();
        lastLocalizedAttributeByElement.set(element, lastLocalizedAttributes);
      }

      for (const attributeName of LOCALIZED_ATTRIBUTES) {
        const currentValue = element.getAttribute(attributeName);
        if (!currentValue) {
          continue;
        }

        const lastLocalizedValue = lastLocalizedAttributes.get(attributeName);
        let originalValue = originalAttributes.get(attributeName);

        if (!originalValue || currentValue !== lastLocalizedValue) {
          originalValue = currentValue;
          originalAttributes.set(attributeName, originalValue);
        }

        const nextValue = translateValue(originalValue);
        if (currentValue !== nextValue) {
          element.setAttribute(attributeName, nextValue);
        }
        lastLocalizedAttributes.set(attributeName, nextValue);
      }
    };

    const localizeRoot = (root: ParentNode) => {
      const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (textWalker.nextNode()) {
        localizeTextNode(textWalker.currentNode as Text);
      }

      if (root instanceof Element) {
        localizeElementAttributes(root);
      }

      root.querySelectorAll?.("*").forEach(localizeElementAttributes);
    };

    localizeRoot(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "characterData" &&
          mutation.target instanceof Text
        ) {
          localizeTextNode(mutation.target);
          continue;
        }

        if (
          mutation.type === "attributes" &&
          mutation.target instanceof Element
        ) {
          localizeElementAttributes(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Text) {
            localizeTextNode(node);
            return;
          }

          if (node instanceof Element) {
            localizeRoot(node);
          }
        });
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [dictionary, locale, version]);

  return null;
}

function translateKnownPattern(
  sourceValue: string,
  locale: SupportedLocale,
  dictionary: ReadonlyMap<string, string>,
) {
  const translatePatternTarget = (target: string) =>
    dictionary.get(target.trim()) ?? target;

  const popularPlayersMatch = sourceValue.match(/^(\d+(?:\.\d+)?) 万人在玩$/);
  if (popularPlayersMatch) {
    const value = Number(popularPlayersMatch[1] ?? "0");
    const thousandValue = Number.isFinite(value) ? value * 10 : 0;
    const compactValue = `${formatPatternNumber(thousandValue)}K`;
    if (locale === "ja-JP") {
      return `${popularPlayersMatch[1]}万人がプレイ`;
    }
    if (locale === "ko-KR") {
      return `${popularPlayersMatch[1]}만 명 플레이 중`;
    }
    return `${compactValue} players`;
  }

  const friendsPlayingMatch = sourceValue.match(/^(\d+) 位好友常玩$/);
  if (friendsPlayingMatch) {
    const count = friendsPlayingMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}人の友だちがよくプレイ`;
    }
    if (locale === "ko-KR") {
      return `친구 ${count}명이 자주 플레이`;
    }
    return `${count} friends play often`;
  }

  const entryCountMatch = sourceValue.match(/^(\d+) 个入口$/);
  if (entryCountMatch) {
    const count = entryCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}件の入口`;
    }
    if (locale === "ko-KR") {
      return `진입점 ${count}개`;
    }
    return `${count} entries`;
  }

  const postCommentCountMatch = sourceValue.match(
    /^(\d+) 条动态 · (\d+) 条评论$/,
  );
  if (postCommentCountMatch) {
    const postCount = postCommentCountMatch[1] ?? "0";
    const commentCount = postCommentCountMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `${postCount}件の投稿 · ${commentCount}件のコメント`;
    }
    if (locale === "ko-KR") {
      return `게시물 ${postCount}개 · 댓글 ${commentCount}개`;
    }
    return `${postCount} posts · ${commentCount} comments`;
  }

  const likeCommentCountMatch = sourceValue.match(/^(\d+) 赞 · (\d+) 评论$/);
  if (likeCommentCountMatch) {
    const likeCount = likeCommentCountMatch[1] ?? "0";
    const commentCount = likeCommentCountMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `${likeCount}件のいいね · ${commentCount}件のコメント`;
    }
    if (locale === "ko-KR") {
      return `좋아요 ${likeCount}개 · 댓글 ${commentCount}개`;
    }
    return `${likeCount} likes · ${commentCount} comments`;
  }

  const playMetaMatch = sourceValue.match(/^(\d+) 播放 · (\d+) 秒 · (.+)$/);
  if (playMetaMatch) {
    const playCount = playMetaMatch[1] ?? "0";
    const seconds = playMetaMatch[2] ?? "0";
    const tag = translatePatternTarget(playMetaMatch[3] ?? "");
    if (locale === "ja-JP") {
      return `${playCount}回再生 · ${seconds}秒 · ${tag}`;
    }
    if (locale === "ko-KR") {
      return `재생 ${playCount}회 · ${seconds}초 · ${tag}`;
    }
    return `${playCount} plays · ${seconds}s · ${tag}`;
  }

  const labeledDateMatch = sourceValue.match(/^(我的小程序|最近使用) · (.+)$/);
  if (labeledDateMatch) {
    const label = translatePatternTarget(labeledDateMatch[1] ?? "");
    const dateLabel = labeledDateMatch[2] ?? "";
    return `${label} · ${dateLabel}`;
  }

  const viewCharacterMomentsMatch = sourceValue.match(/^查看 (.+) 的朋友圈$/);
  if (viewCharacterMomentsMatch) {
    const target = viewCharacterMomentsMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `${target} のモーメンツを見る`;
    }
    if (locale === "ko-KR") {
      return `${target}의 모멘트 보기`;
    }
    return `View ${target}'s Moments`;
  }

  const characterMomentsMatch = sourceValue.match(/^(.+) 的朋友圈$/);
  if (characterMomentsMatch) {
    const target = characterMomentsMatch[1] ?? "";
    if (target === "Ta") {
      return dictionary.get(sourceValue) ?? "Their Moments";
    }
    if (locale === "ja-JP") {
      return `${target} のモーメンツ`;
    }
    if (locale === "ko-KR") {
      return `${target}의 모멘트`;
    }
    return `${target}'s Moments`;
  }

  const jumpToInitialMatch = sourceValue.match(/^跳转到 ([A-Z])$/);
  if (jumpToInitialMatch) {
    const initial = jumpToInitialMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `${initial} にジャンプ`;
    }
    if (locale === "ko-KR") {
      return `${initial}(으)로 이동`;
    }
    return `Jump to ${initial}`;
  }

  const loadedMessagesMatch = sourceValue.match(/^(.+) · 已加载 (\d+) 条$/);
  if (loadedMessagesMatch) {
    const label = loadedMessagesMatch[1] ?? "";
    const count = loadedMessagesMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `${label} · ${count}件読み込み済み`;
    }
    if (locale === "ko-KR") {
      return `${label} · ${count}개 로드됨`;
    }
    return `${label} · ${count} loaded`;
  }

  const localFeedbackCountMatch = sourceValue.match(
    /^(\d+) 条本地反馈记录，(\d+) 条高优先级$/,
  );
  if (localFeedbackCountMatch) {
    const feedbackCount = localFeedbackCountMatch[1] ?? "0";
    const highPriorityCount = localFeedbackCountMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `ローカルフィードバック ${feedbackCount}件、高優先度 ${highPriorityCount}件`;
    }
    if (locale === "ko-KR") {
      return `로컬 피드백 ${feedbackCount}개, 높은 우선순위 ${highPriorityCount}개`;
    }
    return `${feedbackCount} local feedback records, ${highPriorityCount} high priority`;
  }

  const passedChecklistMatch = sourceValue.match(/^(\d+) \/ (\d+) 项通过$/);
  if (passedChecklistMatch) {
    const passed = passedChecklistMatch[1] ?? "0";
    const total = passedChecklistMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `${passed} / ${total}項目合格`;
    }
    if (locale === "ko-KR") {
      return `${passed} / ${total}개 항목 통과`;
    }
    return `${passed} / ${total} passed`;
  }

  const itemCountMatch = sourceValue.match(/^(\d+) 项$/);
  if (itemCountMatch) {
    const count = itemCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}件`;
    }
    if (locale === "ko-KR") {
      return `${count}개 항목`;
    }
    return `${count} items`;
  }

  const attachmentCountMatch = sourceValue.match(/^(\d+) 项附件$/);
  if (attachmentCountMatch) {
    const count = attachmentCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `添付 ${count}件`;
    }
    if (locale === "ko-KR") {
      return `첨부파일 ${count}개`;
    }
    return `${count} attachments`;
  }

  const messageCountMatch = sourceValue.match(/^(\d+) 条$/);
  if (messageCountMatch) {
    const count = messageCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}件`;
    }
    if (locale === "ko-KR") {
      return `${count}개`;
    }
    return `${count}`;
  }

  const recentMessagesWindowMatch = sourceValue.match(/^最近 (\d+) 条$/);
  if (recentMessagesWindowMatch) {
    const count = recentMessagesWindowMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `直近 ${count}件`;
    }
    if (locale === "ko-KR") {
      return `최근 ${count}개`;
    }
    return `Latest ${count}`;
  }

  const modelPersonaMatch = sourceValue.match(/^(.+) 模型角色$/);
  if (modelPersonaMatch) {
    const provider = modelPersonaMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `${provider} モデル人格`;
    }
    if (locale === "ko-KR") {
      return `${provider} 모델 페르소나`;
    }
    return `${provider} model persona`;
  }

  const bracketedCardMatch = sourceValue.match(/^\[名片\] (.+)$/);
  if (bracketedCardMatch) {
    const target = bracketedCardMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `[連絡先カード] ${target}`;
    }
    if (locale === "ko-KR") {
      return `[연락처 카드] ${target}`;
    }
    return `[Contact card] ${target}`;
  }

  const bracketedImageMatch = sourceValue.match(/^\[图片\](.*)$/);
  if (bracketedImageMatch) {
    const suffix = bracketedImageMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `[画像]${suffix}`;
    }
    if (locale === "ko-KR") {
      return `[이미지]${suffix}`;
    }
    return `[Image]${suffix}`;
  }

  const bracketedVoiceMatch = sourceValue.match(/^\[语音\](.*)$/);
  if (bracketedVoiceMatch) {
    const suffix = bracketedVoiceMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `[音声]${suffix}`;
    }
    if (locale === "ko-KR") {
      return `[음성]${suffix}`;
    }
    return `[Voice]${suffix}`;
  }

  const likeCountMatch = sourceValue.match(/^(\d+) 赞$/);
  if (likeCountMatch) {
    const count = likeCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}件のいいね`;
    }
    if (locale === "ko-KR") {
      return `좋아요 ${count}개`;
    }
    return `${count} likes`;
  }

  const reminderMatch = sourceValue.match(/^(\d+) 条提醒待确认$/);
  if (reminderMatch) {
    const count = reminderMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}件のリマインダーが確認待ち`;
    }
    if (locale === "ko-KR") {
      return `확인 대기 알림 ${count}개`;
    }
    return `${count} reminders to confirm`;
  }

  const openedCountMatch = sourceValue.match(/^已打开 (\d+) 次$/);
  if (openedCountMatch) {
    const count = openedCountMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}回開きました`;
    }
    if (locale === "ko-KR") {
      return `${count}회 열림`;
    }
    return `Opened ${count} times`;
  }

  const countMatch = sourceValue.match(/^(\d+) 次$/);
  if (countMatch) {
    const count = countMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}回`;
    }
    if (locale === "ko-KR") {
      return `${count}회`;
    }
    return `${count} times`;
  }

  const lastOpenedWithCountMatch = sourceValue.match(
    /^上次打开 (.+) · 已打开 (\d+) 次$/,
  );
  if (lastOpenedWithCountMatch) {
    const dateLabel = lastOpenedWithCountMatch[1] ?? "";
    const count = lastOpenedWithCountMatch[2] ?? "0";
    if (locale === "ja-JP") {
      return `前回開いた日 ${dateLabel} · ${count}回開きました`;
    }
    if (locale === "ko-KR") {
      return `마지막으로 연 날짜 ${dateLabel} · ${count}회 열림`;
    }
    return `Last opened ${dateLabel} · opened ${count} times`;
  }

  const lastOpenedMatch = sourceValue.match(/^上次打开 (.+)$/);
  if (lastOpenedMatch) {
    const dateLabel = lastOpenedMatch[1] ?? "";
    if (locale === "ja-JP") {
      return `前回開いた日 ${dateLabel}`;
    }
    if (locale === "ko-KR") {
      return `마지막으로 연 날짜 ${dateLabel}`;
    }
    return `Last opened ${dateLabel}`;
  }

  const minuteMatch = sourceValue.match(/^(\d+) 分钟$/);
  if (minuteMatch) {
    const count = minuteMatch[1] ?? "0";
    if (locale === "ja-JP") {
      return `${count}分`;
    }
    if (locale === "ko-KR") {
      return `${count}분`;
    }
    return `${count} min`;
  }

  const continueUsingMatch = sourceValue.match(/^继续使用 (.+)$/);
  if (continueUsingMatch) {
    const target = translatePatternTarget(continueUsingMatch[1] ?? "");
    if (locale === "ja-JP") {
      return `${target} を続けて使う`;
    }
    if (locale === "ko-KR") {
      return `${target} 계속 사용`;
    }
    return `Continue using ${target}`;
  }

  const continueMatch = sourceValue.match(/^继续 (.+)$/);
  if (continueMatch) {
    const target = translatePatternTarget(continueMatch[1] ?? "");
    if (locale === "ja-JP") {
      return `${target} を続ける`;
    }
    if (locale === "ko-KR") {
      return `${target} 계속`;
    }
    return `Continue ${target}`;
  }

  return null;
}

function formatPatternNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
