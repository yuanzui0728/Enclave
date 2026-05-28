# 贡献指南

感谢你对隐界项目的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

- Node.js >= 18
- pnpm >= 8.15
- SQLite（内置，无需额外安装）

```bash
pnpm install
cp .env.example .env
cp api/.env.example api/.env
# 编辑 .env 文件填入你的 API Key
pnpm dev
```

## 提交规范

使用语义化提交信息：

- `feat:` 新功能
- `fix:` 修复
- `chore:` 构建/工具/依赖变更
- `docs:` 文档
- `refactor:` 重构

## Pull Request

1. Fork 本仓库并创建分支
2. 确保代码可以正常构建（`pnpm build`）
3. 提交 PR 并描述你的改动

## 报告问题

请通过 GitHub Issues 提交，附上复现步骤和环境信息。
