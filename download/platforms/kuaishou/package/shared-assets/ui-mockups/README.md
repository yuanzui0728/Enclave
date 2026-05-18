# UI Mockup SVG 索引 + 落地说明

> 这些 SVG 是给 Manus 直接拿来用的"已成型 UI 资产"，不需要 Manus 从零做隐界 APP UI 复刻。
>
> 用法：
> 1. **作为 AE/PR 图层**：直接拖入项目，作为视频前景"屏幕里的画面"
> 2. **作为 Figma 模板**：在 Figma 里打开 SVG，替换字段后导出 PNG/JPG
> 3. **作为录屏参考**：在测试 world 里照此布局配置后录真实屏幕

---

## 文件索引

| 文件 | 用途 | 关键字段 |
|---|---|---|
| `app-push-notification.svg` | 锁屏 APP 推送卡片（D1/D2/D3/D5/D6） | `[SENDER]` `[CONTENT]` |
| `lock-screen-missed-call.svg` | 锁屏未接来电（D5 镜头 2 + D5 封面） | 时间戳/联系人=我儿子/视频通话 |
| `group-chat-page.svg` | 群「磊总朋友圈」聊天页（D1/D2/D4/D5） | 已配置 D4 吵架场景 |
| `direct-chat-page.svg` | 1v1 聊天页（D3/D6/D7） | 已配置 D6 老周语音条场景 |
| `character-profile-page.svg` | 角色资料页（D1 镜头 7 + D7 镜头 5） | `[ROLE_NAME]` `[ACTIVE_HOURS]` 等 |
| `d7-character-edit-page.svg` | ⭐ D7 镜头 6 角色编辑页（金钱镜头） | 角色描述字段一字不差 |
| `d7-character-description-fullscreen.svg` | ⭐ D7 镜头 7 全屏揭示画面 | 整条 D7 的爆点 |
| `12306-ticket-d6.svg` | D6 镜头 8 购票成功页（反卖惨锚点） | K8421 / 硬卧中铺 / ¥156.50 |

---

## 字幕样式 CSS 模板（黄金字幕）

> 给 Manus 在 AE 里做字幕用的精确参数。直接复制粘贴。

### 标准字幕（72px 白）

```css
font-family: "Source Han Sans CN", "思源黑体 CN", "PingFang SC", sans-serif;
font-weight: 700;  /* Bold */
font-size: 72px;
color: #FFFFFF;
text-stroke: 3px #000000;  /* 实心黑描边 */
-webkit-text-stroke: 3px #000000;
text-shadow: 2px 4px 8px rgba(0, 0, 0, 0.3);
line-height: 1.3;
text-align: center;
position: 屏幕中心偏下，Y 中心 = 1300（距底 620px）
max-width: 单行 14 中文字（超过强制换行）
出场: fade-in 100ms 或 硬切
退场: fade-out 200ms，下一句进来前留 80ms 空白
```

### 强调字幕（88px 橙）

```css
/* 在标准字幕基础上修改 */
font-size: 88px;
color: #f97316;  /* 隐界橙 */
animation: 1 帧抖动（位移 ±4px，仅 1 帧）;
```

### 落幕扎心字幕（70px 白）

```css
font-family: "Source Han Sans CN", "思源黑体 CN", sans-serif;
font-weight: 500;
font-size: 70px;
color: #FFFFFF;
text-stroke: 2px #000000;
position: 屏幕居中，Y = 900
duration: 0.5 秒淡入 + 1 秒停留 + 0.5 秒淡出
```

### 大字号开头（如 D6 镜头 7 "十年了"）

```css
font-size: 100px;  /* 比强调字幕再加大 */
color: #f97316;
font-weight: 900;  /* Black */
animation: 1 帧抖动 + fade-in 200ms
```

---

## AE 字幕模板使用流程（推荐）

1. 在 AE 里新建一个 1080×1920 合成
2. 用上面的 CSS 参数建一个"标准字幕"文字图层
3. 复制为预设："黄金字幕模板"
4. 之后每条字幕复制这个预设，只改文字内容
5. 强调字幕单独建一个预设（"强调字幕橙"）
6. 落幕字幕单独建一个预设（"落幕扎心"）

---

## 字体获取

### 思源黑体 CN（首选）
- 免费商用 SIL OFL 1.1 许可
- 下载：[GitHub - adobe-fonts/source-han-sans](https://github.com/adobe-fonts/source-han-sans/releases)
- 文件名：`SourceHanSansCN-Bold.otf` + `SourceHanSansCN-Black.otf`

### PingFang SC（次选）
- macOS 系统自带
- Windows 需安装

### 备选
- 阿里巴巴普惠体（免费商用）
- 站酷高端黑（免费商用）

**禁用**：方正字体未授权版本（B 站、抖音都开始打字体侵权了，快手不远）。

---

## 关键 UI 还原对照

Manus 在做录屏时，画面里的隐界 APP UI 必须与这些 SVG 一致：

| 元素 | 视觉规范 |
|---|---|
| 用户消息气泡 | 橙色背景 `#f97316`，文字 `#ffffff`，圆角 18px |
| AI 消息气泡 | 浅灰背景 `#ffffff`，文字 `#1a0f05`，圆角 18px，1px 浅灰边框 |
| 群聊页背景 | 暖米色 `#fef7ed` |
| 1v1 页背景 | 暖米色 `#fef7ed` |
| 在线小绿点 | `#10b981` 直径 16px |
| AI 角色徽章 | 橙色背景 `#f97316`，白字，圆角 32px |
| 主操作按钮 | 橙色背景 `#f97316`，白字，圆角 60px |
| 辅助按钮 | 白底橙边 `#f97316` 3px，橙字 |
| 分割线 | `#f1f1f1` 2px |

如有不一致，**以这些 SVG 为准**——它们是真实隐界 APP 的 UI 简化版。
