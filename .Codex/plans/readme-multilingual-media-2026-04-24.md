# 多语言 README 媒体同步

## Summary

- 参考中文 `README.md`，补齐 `README.en.md`、`README.ja.md`、`README.ko.md` 的首屏核心 GIF、演示视频标题、核心截图 gallery。
- 新增三套本地化媒体资源，图片里的 UI 与演示文案使用对应语言，而不是复用中文截图。
- 不改应用代码、API、路由、实体或 `AGENTS.md`；只改文档与文档资产。

## Key Changes

- 新增 GIF：
  - `docs/assets/yinjie-core-loop.en.gif`
  - `docs/assets/yinjie-core-loop.ja.gif`
  - `docs/assets/yinjie-core-loop.ko.gif`
- 新增截图：
  - `docs/screenshots/core-{chat,moments,feed,group,onboarding,self-character}.{en,ja,ko}.png`
- README 更新：
  - 在三份多语言 README 顶部 contact 区后插入本语言 GIF。
  - 给现有 GitHub user-attachments 链接补上本语言演示视频标题。
  - 在产品介绍段后插入与中文 README 相同的 2x3 核心截图表格。

## Test Plan

- `file docs/assets/yinjie-core-loop.*.gif docs/screenshots/core-*.{en,ja,ko}.png`
- `rg "yinjie-core-loop\\.(en|ja|ko)\\.gif|core-chat\\.(en|ja|ko)\\.png" README.en.md README.ja.md README.ko.md`
- `rg "docs/assets/yinjie-core-loop.gif|docs/screenshots/core-(chat|moments|feed|group|onboarding|self-character)\\.png" README.en.md README.ja.md README.ko.md`
- `git diff --check -- README.en.md README.ja.md README.ko.md docs/assets docs/screenshots .Codex/plans/readme-multilingual-media-2026-04-24.md`

## Assumptions

- “韩国版本”指 `README.ko.md`。
- 本次只同步中文 README 近期新增的 GIF 与核心截图展示，不重写三份 README 的全文结构。
- 不新增测试文件；文档资源任务的最小验证以媒体格式、引用路径和 diff whitespace 检查为准。
