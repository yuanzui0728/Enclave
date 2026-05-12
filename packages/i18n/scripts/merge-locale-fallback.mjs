#!/usr/bin/env node
// lingui compile 后置脚本：把 en-US catalog 作为 ja-JP / ko-KR 的兜底合并进来。
//
// 历史：catalog-loaders.ts 原本在 runtime 每次首屏都额外拉一份 en-US catalog，
// 用 isLikelyMissingLocaleMessage 启发式（看 ja-JP 文本是否纯简中字符且无日文
// 假名）判定"未翻译"并替换。这套兜底在公网隧道 ~430ms RTT 下，给每个 ja/ko
// 用户都多了 2 个并行 HTTP 请求 (~280KB 流量、~1 个并发槽) + runtime 全表扫描。
//
// 5643 keys 里只有约 24 个 ja/ko 完全未译；99.6% 翻译已存在。把 fallback 提前
// 到 build 期一次性合并到 ja-JP.ts / ko-KR.ts 里，runtime 就只需要拉本地化 catalog
// 一份，省 1 个 RTT (~430ms 公网隧道) 并删除 runtime 启发式扫描。
//
// 使用：在 lingui compile 之后调用，会就地修改各 surface 下 ja-JP.ts / ko-KR.ts。
// en-US.ts / zh-CN.ts 不动。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const catalogsRoot = resolve(__dirname, "..", "catalogs");

const SURFACES = ["shared", "app", "admin", "cloud-console", "site", "wiki"];
const FALLBACK_TARGETS = ["ja-JP", "ko-KR"];
const FALLBACK_SOURCE = "en-US";

const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿]/;
const JAPANESE_KANA_PATTERN = /[぀-ヿ]/;
const KOREAN_HANGUL_PATTERN = /[가-힯]/;
const SIMPLIFIED_CHINESE_MARKER_PATTERN =
  /[个条项进运这为时对队关务续联调实测门复义状数读写优级险备错页启线]/;

function serializeMessageForScan(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((piece) => (typeof piece === "string" ? piece : "")).join("");
  }
  return "";
}

function isLikelyMissingLocaleMessage(value, locale) {
  const serialized = serializeMessageForScan(value);
  if (!serialized || !CJK_PATTERN.test(serialized)) return false;
  if (locale === "ja-JP") {
    return (
      !JAPANESE_KANA_PATTERN.test(serialized) &&
      SIMPLIFIED_CHINESE_MARKER_PATTERN.test(serialized)
    );
  }
  if (locale === "ko-KR") {
    return !KOREAN_HANGUL_PATTERN.test(serialized);
  }
  return false;
}

// lingui compile --typescript 产出形如：
//   /*eslint-disable*/import type{Messages}from"@lingui/core";export const messages=JSON.parse("...")as Messages;
// 所有键值压在一段 JSON-encoded 字符串里。这里就地替换 JSON.parse(...) 里面的字符串。
// 用 greedy 匹配并锚到尾部的 "as Messages"，避免被消息内嵌的 ")" 截断（非 greedy
// 会停在第一个 ")"，但消息文本里可能有 "..returned \")\".." 这种自然 ")"）。
const MESSAGES_LITERAL_PATTERN = /JSON\.parse\((".*")\)as Messages/s;

function readCatalogFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const match = MESSAGES_LITERAL_PATTERN.exec(content);
  if (!match) {
    throw new Error(`failed to parse compiled catalog at ${filePath}`);
  }
  // match[1] 是带双引号的 JSON 字符串字面量，外层 JSON.parse 把它解码成内部 JSON
  const innerJson = JSON.parse(match[1]);
  const messages = JSON.parse(innerJson);
  return { content, match, messages };
}

function writeCatalogFile(filePath, original, messages) {
  const innerJson = JSON.stringify(messages);
  const literal = JSON.stringify(innerJson);
  // String#replace 把替换串里的 $ 视为引用语义 ($&, $1, etc.)；catalog 里含
  // $0/$1 等占位符，被解读后会把 capture group 复制进去，破坏 JSON。改用
  // 替换函数形式，可以原样传入字面量。
  const next = original.content.replace(
    MESSAGES_LITERAL_PATTERN,
    () => `JSON.parse(${literal})as Messages`,
  );
  if (next === original.content) return false;
  writeFileSync(filePath, next, "utf8");
  return true;
}

let totalReplaced = 0;
let totalEnUsMissing = 0;
let surfacesTouched = 0;

for (const surface of SURFACES) {
  const sourceFile = resolve(catalogsRoot, surface, `${FALLBACK_SOURCE}.ts`);
  if (!existsSync(sourceFile)) {
    continue;
  }
  const source = readCatalogFile(sourceFile);

  for (const locale of FALLBACK_TARGETS) {
    const targetFile = resolve(catalogsRoot, surface, `${locale}.ts`);
    if (!existsSync(targetFile)) continue;

    const target = readCatalogFile(targetFile);
    let replaced = 0;
    let skippedBecauseSame = 0;
    for (const [key, value] of Object.entries(target.messages)) {
      if (!isLikelyMissingLocaleMessage(value, locale)) continue;
      const fallback = source.messages[key];
      if (fallback === undefined) {
        totalEnUsMissing += 1;
        continue;
      }
      // 现状：很多 ja-JP/ko-KR 未译键的 en-US 值也是同样的中文（en-US 也没
      // 翻译），fallback 拿不出更好的值。跳过这种 same-as-target 的情况，
      // 避免日志噪音。如果未来 en-US 先于 ja/ko 被翻译，这里就能自动捡漏。
      if (JSON.stringify(fallback) === JSON.stringify(value)) {
        skippedBecauseSame += 1;
        continue;
      }
      target.messages[key] = fallback;
      replaced += 1;
    }
    if (replaced > 0) {
      const wrote = writeCatalogFile(targetFile, target, target.messages);
      if (wrote) {
        surfacesTouched += 1;
        totalReplaced += replaced;
        console.log(
          `[i18n-merge] ${surface}/${locale}: replaced ${replaced} keys with en-US fallback`,
        );
      }
    }
  }
}

console.log(
  `[i18n-merge] done. ${surfacesTouched} catalog files modified; ${totalReplaced} total replacements; ${totalEnUsMissing} en-US-missing keys skipped.`,
);
