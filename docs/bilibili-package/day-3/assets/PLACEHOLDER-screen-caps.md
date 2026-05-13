# Day 3 需录屏的镜头（占位说明）

---

## 录屏 1：作息表 UI（如存在）

**对应镜头**：镜头 007

**录制内容**：打开角色资料页，滚动到"作息表"或"当前状态"区块

**如果 app 当前 UI 没有可视化作息表**，跳过录屏，使用 `shot-list.md` 镜头 007 的 GENERATE 提示词生成示意图。

**文件名**：`day-3-cap-01-schedule-ui.mp4`（或 `.png` 单帧）

---

## 录屏 2：三时段对比（45 秒拼接）

**对应镜头**：镜头 009-011

**录制内容**：
- 第 1 段（15 秒）：把系统时间调到凌晨 3:12 → 给老周发"在吗" → 等无回复 → 时间快进到上午 9:00 → 老周延迟回复"昨晚睡了，看到晚了"
- 第 2 段（15 秒）：时间调到中午 12:30 → 发"在吗" → 老周回"在吃饭，等会"
- 第 3 段（15 秒）：时间调到晚上 22:30 → 发"睡了吗" → 老周回"还没，刚回家在听歌"

**操作技巧**：
- 系统时间可通过 admin 后台或 .env 修改（具体参数见 DEVELOPMENT.md）
- 或者用 docker 容器的 `TZ` + 时间 mock 方式（简单粗暴）
- 实在不行可以**录三天，每天选合适时段录一段**，剪辑拼接

**文件名**：`day-3-cap-02-three-time-periods.mp4`

**关键要求**：
- 三段录屏的**回复延迟必须真实**——AI 的回复时间戳要符合该时段的"应有行为"
- 如果 AI 在凌晨实际上"秒回"（说明作息逻辑未生效），需要先修复作息逻辑再录

---

## 临时占位生成提示词

```
Three-panel vertical phone screen mockup:
Panel 1: Chat at "3:12 AM" with sent message "在吗", no reply, empty bubble.
Panel 2: Chat at "12:30 PM", reply "在吃饭，等会"
Panel 3: Chat at "22:30 PM", reply "还没，刚回家在听歌"
Each panel shows the time clearly. Dark UI mockup style.
Add card overlay "📹 录屏待补 / day-3-cap-02"
```
