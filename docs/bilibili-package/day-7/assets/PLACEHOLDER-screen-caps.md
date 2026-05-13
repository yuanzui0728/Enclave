# Day 7 需录屏的镜头（占位说明）

> 收官集，需要的是 Day 7 当天的真实"数据截图"——不是产品录屏。

---

## 截图 1：GitHub Star History 当天最新

**对应镜头**：镜头 004

**操作**：
- 浏览器打开 `https://star-history.com/#yuanzui0728/enclave`
- 等图表加载完成
- 全屏截图（保留浏览器地址栏，证明真实性）
- 或者截取图表区域（更干净）

**文件名**：`day-7-cap-01-star-history.png`，1920×1080 以上

---

## 截图 2：B 站后台数据

**对应镜头**：镜头 005

**操作**：
- 登录 B 站创作中心 → 数据中心
- 截取"近 7 天数据"区块（粉丝增长曲线 / 累计播放 / 完播率）
- 把账号名等敏感信息打码

**文件名**：`day-7-cap-02-bili-backend.png`

---

## 截图 3：GitHub Issue 列表

**对应镜头**：镜头 006

**操作**：
- 打开 `https://github.com/yuanzui0728/enclave/issues`
- 按时间排序，截图近 7 天新增的 issue 列表
- 如果有 Apple Watch / 语音电话相关 issue，**单独再截一张特写**用于镜头 009

**文件名**：
- `day-7-cap-03-issues.png`（列表）
- `day-7-cap-04-issue-applewatch.png`（特写 1）
- `day-7-cap-05-issue-voice.png`（特写 2）

---

## 数据占位符替换清单

`script.md` 和 `shot-list.md` 里出现的占位符，Day 7 当天 UP 主必须替换为真实数字：

| 占位符 | 来源 | 类型 |
|---|---|---|
| `{{STAR_BEFORE}}` | 开播前 GitHub Star 数 | 整数 |
| `{{STAR_AFTER}}` | Day 7 当天 GitHub Star 数 | 整数 |
| `{{STAR_COUNT}}` | After - Before 差值 | 整数 |
| `{{FAN_COUNT}}` | B 站累计粉丝增长 | 整数 |
| `{{VIEW_COUNT}}` | B 站累计播放 | 整数（可保留千位分隔） |
| `{{ISSUE_COUNT}}` | 新增 issue 数 | 整数 |

manus 生产时把占位符保留为字面文本，UP 主用剪映替换。或者 manus 在拿到真实数字后输出最终版本。
