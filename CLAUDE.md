# 隐界APP 项目规则

## 代码生成规则

- 跳过所有测试代码生成（不生成 .test.ts、.spec.ts、__tests__ 等测试文件）
- 不生成测试用例、单元测试、集成测试相关代码
- 不建议或提示添加测试覆盖

## 权限规则

- 用户已授予最高权限，直接执行所有代码生成、文件读写、命令运行等操作
- 不需要为常规开发操作（编辑文件、创建文件、运行构建命令等）寻求确认
- 直接完成任务，无需反复询问是否继续

## 规划与执行规则

### 规划阶段
- 当进入 Plan Mode 时，必须将规划结果保存到 `.claude/plans/` 目录
- 规划文件命名格式：`{任务描述}-{日期}.md`
- 规划内容必须包含：
  1. 任务背景和目标
  2. 涉及的文件路径（新增/修改）
  3. 详细实施步骤
  4. 验证方案
  5. 注意事项

### 执行阶段
- 退出 Plan Mode 后，严格按照规划文件执行
- 每完成一个步骤，在规划文件中标记完成状态
- 如遇到与规划不符的情况，先更新规划文件再继续执行
- 执行完成后，在规划文件末尾添加执行总结

### 结构变更追踪
- 每次代码调整后，检查是否有以下结构变更：
  1. 新增/删除模块目录
  2. 新增/删除实体（Entity）
  3. 新增/删除路由/页面
  4. 新增/删除 API 接口
  5. 数据库表结构变更
- 如有结构变更，立即更新本文件的"项目结构"章节
- 在 commit message 中明确标注结构变更

## 项目结构

### 技术栈
- **后端**: NestJS + TypeORM + SQLite + Socket.IO
- **前端（主线）**: React + Vite + H5（web/）
- **移动端（已冻结）**: React Native + Expo + Zustand（mobile/）
- **管理后台**: React + Vite + Ant Design

> **开发策略**：mobile 版本已冻结，后续所有功能迭代只在 `web/` 中进行。

### 目录结构
```
隐界APP/
├── api/                    # NestJS 后端
│   ├── src/
│   │   ├── modules/
│   │   │   ├── ai/        # AI 服务（DeepSeek/OpenAI 兼容）
│   │   │   ├── auth/      # 用户认证（JWT）
│   │   │   ├── characters/# 角色管理
│   │   │   ├── chat/      # 聊天服务（WebSocket + REST）
│   │   │   ├── config/    # 系统配置（模型切换）
│   │   │   ├── import/    # 数据导入
│   │   │   └── moments/   # 动态/朋友圈
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── database.sqlite    # SQLite 数据库
│   └── package.json
│
├── web/                   # ★ H5 前端（当前主线）
│   ├── src/
│   │   ├── pages/        # 路由页面
│   │   ├── store/        # Zustand 状态管理
│   │   ├── services/     # api.ts + socket.ts
│   │   ├── components/   # 公共组件
│   │   └── theme/        # 颜色主题
│   └── package.json
│
├── mobile/                # React Native 移动端（已冻结，不再迭代）
│   ├── app/
│   │   ├── (tabs)/       # 底部导航页面
│   │   │   ├── index.tsx # 会话列表
│   │   │   ├── character.tsx # 角色列表
│   │   │   └── moments.tsx   # 动态
│   │   ├── chat/[id].tsx # 聊天室
│   │   ├── login.tsx     # 登录/注册
│   │   └── _layout.tsx   # 路由守卫
│   ├── store/            # Zustand 状态管理
│   ├── services/
│   └── package.json
│
└── admin/                # React 管理后台
    ├── src/
    │   ├── pages/
    │   │   ├── CharacterList.tsx  # 角色列表
    │   │   ├── CharacterEdit.tsx  # 角色编辑
    │   │   └── ModelConfig.tsx    # 模型配置
    │   ├── services/
    │   │   └── api.ts    # API 客户端
    │   ├── App.tsx       # 路由 + 导航
    │   └── main.tsx
    └── package.json
```

### 数据库实体（TypeORM）
1. **UserEntity** - 用户表（username, password, createdAt）
2. **CharacterEntity** - 角色表（name, avatar, personality, traits, domains）
3. **ConversationEntity** - 会话表（userId, characterIds, lastMessage, updatedAt）
4. **MessageEntity** - 消息表（conversationId, senderId, content, timestamp）
5. **SystemConfigEntity** - 系统配置表（key, value, updatedAt）
6. **MomentEntity** - 动态表（authorId, authorName, authorAvatar, text, interactions, postedAt）

### API 路由
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/characters` - 获取角色列表
- `POST /api/characters` - 创建角色
- `PATCH /api/characters/:id` - 更新角色
- `DELETE /api/characters/:id` - 删除角色
- `GET /api/conversations?userId=xxx` - 获取会话列表
- `POST /api/conversations` - 创建/获取会话（getOrCreate，by userId + characterId）
- `GET /api/conversations/:id/messages` - 获取消息历史
- `GET /api/config/ai-model` - 获取当前 AI 模型
- `PUT /api/config/ai-model` - 切换 AI 模型
- `GET /api/config/available-models` - 获取可用模型列表
- `WebSocket /chat` - 实时聊天（sendMessage, receiveMessage）

### 环境变量（api/.env）
```
DEEPSEEK_API_KEY=sk-xxx
OPENAI_BASE_URL=https://n1n.ai/v1
JWT_SECRET=your-secret-key
```

### 启动命令
- 后端：`cd api && npm run start:dev`（端口 3000）
- **H5 前端（主线）**：`cd web && npm run dev`（端口 5174）
- 管理后台：`cd admin && npm run dev`（端口 5173）
- 移动端（已冻结）：`cd mobile && npx expo start`

---

**最后更新**: 2026-03-12
**最后变更**: 去除 mock 数据，改为真实实现；新增 MomentEntity 持久化；新增 POST /api/conversations；修复 CharacterDetail 发消息、ChatRoom 消息重复、ChatList ＋按钮、Profile 设置菜单
