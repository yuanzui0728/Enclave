# Changelog

本项目所有重要变更都会记录在这个文件里。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [0.1.1] - 2026-04-24

> 首次公开之后第一个节奏更新：把"能跑起来"升级到"路人点开就能玩得顺"。

### ✨ 新增 New

- **3 分钟 Docker 一键部署**：README 顶部新增"clone → cp .env → docker compose up"三步走流程，路人可以在不读整篇文档的情况下跑起来
- **多平台联系人导入层**：真实可用的数据源扩展到微信 4.x（wechat-decrypt HTTP）、WeFlow 本地桥接、ChatLab JSON/JSONL；文件导入覆盖 QQ / Telegram / Discord / WhatsApp / LINE / Instagram 等
- **"自己"角色 × 赛博分身闭环**：自聊天路由到 self-agent、管理后台控制台、实时 heartbeat，Cyber Avatar 的 `real_world_sync` 模式接通
- **多模态聊天**：图像 / 音频 / 文档全链路，PDF 走 OCR 兜底，文档抽取增加 pure-js fallback，群聊也支持多模态回复
- **提醒任务系统**：自然语言解析（含口语化时间）+ 管理后台提醒运行时规则编辑器 + LLM 兜底解析
- **真实世界同步**：默认 provider 接 Google News RSS，角色会把你关心领域的新闻带进聊天、朋友圈、群聊
- **多模型推理路由**：按角色 / 场景分发到不同模型；模型人格可被批量运维
- **新角色预设**：健身教练、英语教练、酒吧老炮（bar expert，含评测用例）
- **WeChat 社群二维码** + 双语用户反馈 Issue 模板 + PR 模板
- **管理后台 UX 大升级**：需求发现 / 角色中心 / 游戏目录 / 推理工作台 / Token 用量 / 实时同步 工作台全面重做
- **语言切换器**全端铺开（App / Desktop / Admin），日/韩种子翻译完成

### 🔧 改进 Improved

- 回复失败时的兜底：移动端数百处 share / copy / forward / favorite 的 notice retry
- 桌面端 shell 大规模重构：共享 chat / contacts / moments / official / favorites / search 的 route shells，懒加载多个桌面 overlay
- 提醒相关 UI：默认折叠、修改后刷新、collapse 后重新挂载
- CI：i18n 硬编码文案 ratchet，新增文案默认不能出现硬编码中文

### 🐛 修复 Fixed

- 桌面端路由尾斜杠归一化（数十个路径）
- 移动端 Web 运行时与路由一揽子修复
- WeFlow 启动流程、上游服务查询错误现形
- 群聊邀请 / 分享 / 复制回退、朋友圈返回路径、探针会话污染聊天列表 等长尾 bug

### 📚 文档 Docs

- README 加入"⭐ Star CTA"、SEO 关键词（Character.AI / Replika 开源替代）
- 新增 [ROADMAP.md](ROADMAP.md)
- 本文件

### ⚠️ 已知问题 Known Issues

- 在线体验 demo 仍是裸 IP，未切 HTTPS 域名 —— 下个版本前会换
- 英 / 日 / 韩 README 需要母语者校对（欢迎贡献，见 #5）

---

## [0.1.0] - 2026-04-19

> 首次公开：一个属于你的 AI 虚拟世界。

完整介绍见 [release notes](https://github.com/yuanzui0728/enclave/releases/tag/v0.1.0)。

核心能力：

- AI 居民的人格 / 作息 / 多场景人设 / 与你的亲密度
- AI 与 AI 之间的关系网（熟人 / 朋友 / 对手 / 导师 / 恋人）
- 共享世界时间：季节 / 天气 / 时段 / 节假日 / 虚拟位置
- 叙事弧线：每段关系的进度、阶段、里程碑
- 社交闭环：聊天 / 群聊 / 朋友圈 / 视频号 / 发现
- 通向现实的两座桥：Action 执行框架 + 真实世界信号
- 一套 monorepo：api / apps/app / apps/admin / apps/desktop / 移动端壳

---

[0.1.1]: https://github.com/yuanzui0728/enclave/releases/tag/v0.1.1
[0.1.0]: https://github.com/yuanzui0728/enclave/releases/tag/v0.1.0
