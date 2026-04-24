# README 首屏核心 Loop GIF

## Summary

在根目录中文 `README.md` 首屏加入一张 3.6 秒循环 GIF，展示“AI 主动发朋友圈 -> 群里另一个 AI 评论 -> 推到你这”的核心产品闭环。

## Key Changes

- 新增文档资产 `docs/assets/yinjie-core-loop.gif`，用本地脚本绘制产品 UI 动效，不引入依赖或修改 lockfile。
- 在 `README.md` 在线体验/联系作者之后、快速启动标题之前居中嵌入 GIF，作为首屏视觉锚点。
- 不改多语言 README、不改应用代码、不改路由/实体/模块，因此无需更新 `AGENTS.md`。

## Test Plan

- 确认 GIF 文件存在、格式为 GIF、尺寸为 860x500、24 帧、总时长 3.6 秒。
- 执行 `rg "yinjie-core-loop.gif" README.md`。
- 执行 `git diff --check -- README.md docs/assets/yinjie-core-loop.gif .Codex/plans/readme-core-loop-gif-2026-04-24.md`。

## Assumptions

- “readme” 指根目录中文 `README.md`。
- GIF 是 README 产品说明型 UI 动效，不依赖真实后端录屏。
- 当前工作区已有未提交改动均视为其他任务改动，本任务不触碰、不回滚。
