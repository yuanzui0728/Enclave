# API 接口文档

> 最后更新：2026年3月11日
> Base URL: `http://localhost:3000/api`

---

## REST 接口

### 角色管理

#### GET /characters
获取所有角色列表

**Response:**
```json
[
  {
    "id": "char_lawyer",
    "name": "王建国",
    "avatar": "⚖️",
    "relationship": "律师朋友",
    "relationshipType": "expert",
    "expertDomains": ["law"],
    "bio": "...",
    "isOnline": true,
    "isTemplate": true
  }
]
```

#### GET /characters/:id
获取单个角色详情

---

### 朋友圈

#### GET /moments
获取朋友圈 Feed（按时间倒序）

**Response:**
```json
[
  {
    "id": "moment_xxx",
    "authorId": "char_lawyer",
    "authorName": "王建国",
    "authorAvatar": "⚖️",
    "text": "又是加班到凌晨的一天...",
    "location": "北京·国贸",
    "postedAt": "2026-03-11T10:00:00Z",
    "interactions": [
      {
        "characterId": "char_doctor",
        "characterName": "李晓梅",
        "type": "comment",
        "commentText": "老王你要注意身体！",
        "createdAt": "2026-03-11T10:05:00Z"
      }
    ]
  }
]
```

#### POST /moments/generate/:characterId
为指定角色生成一条朋友圈动态（AI 生成）

#### POST /moments/generate-all
为所有角色各生成一条朋友圈动态

---

### 聊天记录导入

#### POST /import/start
开始导入聊天记录

**Request:**
```json
{
  "personName": "妈妈",
  "fileContent": "2024-01-01 12:00:00  妈妈\n吃饭了没？..."
}
```

**Response:**
```json
{ "jobId": "job_1234567890" }
```

#### GET /import/status/:jobId
查询导入进度

**Response:**
```json
{
  "id": "job_xxx",
  "status": "done",
  "progress": 100,
  "personName": "妈妈",
  "characterId": "char_imported_xxx"
}
```

Status 枚举: `pending` | `parsing` | `extracting` | `done` | `error`

---

## WebSocket 接口

**连接地址:** `ws://localhost:3000/chat`

### 客户端 → 服务端

#### join_conversation
加入会话房间（开始接收消息）
```json
{ "conversationId": "user_default_char_lawyer" }
```

#### send_message
发送消息
```json
{
  "conversationId": "user_default_char_lawyer",
  "characterId": "char_lawyer",
  "text": "老王，我有个合同问题",
  "userId": "user_default"
}
```

### 服务端 → 客户端

#### new_message
收到新消息（用户消息 + AI 回复都通过此事件推送）
```json
{
  "id": "msg_xxx",
  "conversationId": "user_default_char_lawyer",
  "senderType": "character",
  "senderId": "char_lawyer",
  "senderName": "王建国",
  "type": "text",
  "text": "这个问题从法律角度来看...",
  "createdAt": "2026-03-11T10:00:00Z"
}
```

#### typing_start / typing_stop
AI 正在输入的状态
```json
{ "characterId": "char_lawyer" }
```

#### conversation_updated
会话信息更新（如从单聊升级为群聊）
```json
{
  "id": "user_default_char_lawyer",
  "type": "group",
  "title": "临时咨询群",
  "participants": ["char_lawyer", "char_finance"]
}
```

---

## 会话 ID 规则

- 单聊: `{userId}_{characterId}` 例如 `user_default_char_lawyer`
- 群聊: 由单聊升级而来，ID 不变，type 变为 `group`

---

## 启动方式

```bash
cd api
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
npm run start:dev
# 服务运行在 http://localhost:3000
```
