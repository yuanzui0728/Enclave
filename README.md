# 隐界 APP

一个基于 AI 的角色陪伴应用，支持多角色对话、朋友圈动态、角色管理等功能。

## 技术栈

- **后端**: NestJS + TypeORM + SQLite + Socket.IO
- **前端**: React + Vite + TypeScript
- **管理后台**: React + Ant Design
- **AI 服务**: DeepSeek / OpenAI 兼容接口

## 项目结构

```
隐界APP/
├── api/          # NestJS 后端服务（端口 3000）
├── web/          # H5 前端（端口 5174）
├── admin/        # 管理后台（端口 5173）
└── docs/         # 技术文档
```

## 快速开始

### 1. 环境要求

- Node.js >= 18
- npm >= 9

### 2. 安装依赖

```bash
# 后端
cd api && npm install

# 前端
cd web && npm install

# 管理后台
cd admin && npm install
```

### 3. 配置环境变量

复制 `api/.env.example` 为 `api/.env`，填入你的配置：

```env
DEEPSEEK_API_KEY=sk-xxx
OPENAI_BASE_URL=https://n1n.ai/v1
JWT_SECRET=your-secret-key
```

### 4. 启动服务

**方式一：使用启动脚本（Windows）**

```bash
start.bat
```

**方式二：手动启动**

```bash
# 后端
cd api && npm run start:dev

# 前端
cd web && npm run dev

# 管理后台
cd admin && npm run dev
```

### 5. 访问应用

- 前端：http://localhost:5174
- 管理后台：http://localhost:5173
- 后端 API：http://localhost:3000/api

## 功能特性

### 用户端（web/）

- 用户注册/登录
- 多角色对话（支持 WebSocket 实时通信）
- 会话列表与历史记录
- 角色详情与创建
- 朋友圈动态
- 数据导入

### 管理后台（admin/）

- 角色管理（增删改查）
- AI 模型切换（DeepSeek / OpenAI）
- 角色特征配置（性格、专长、领域）

## 核心模块

### 后端模块

- `auth` - 用户认证（JWT）
- `characters` - 角色管理
- `chat` - 聊天服务（WebSocket + REST）
- `ai` - AI 调用编排（支持多模型）
- `config` - 系统配置
- `moments` - 朋友圈动态
- `import` - 数据导入

### 数据库实体

- UserEntity - 用户表
- CharacterEntity - 角色表
- ConversationEntity - 会话表
- MessageEntity - 消息表
- SystemConfigEntity - 系统配置表
- MomentEntity - 动态表

## API 文档

详见 [docs/API接口文档.md](docs/API接口文档.md)

主要接口：

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/characters` - 获取角色列表
- `POST /api/conversations` - 创建/获取会话
- `GET /api/conversations/:id/messages` - 获取消息历史
- `WebSocket /chat` - 实时聊天

## 开发规范

详见 [CLAUDE.md](CLAUDE.md)

- 不生成测试文件
- 代码简洁，避免过度工程化
- 结构变更需更新文档

## 许可证

MIT
