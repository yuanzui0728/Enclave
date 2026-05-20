import { useCallback } from "react";
import {
  getActiveLocale,
  getSurfaceTextDictionary,
  resolveSupportedLocale,
  useAppLocale,
  type SupportedLocale,
} from "@yinjie/i18n";

export type CloudConsoleLocale = SupportedLocale;

export const CLOUD_CONSOLE_ENGLISH_LOCALE: CloudConsoleLocale = "en-US";

type LocalizedTextSet = Record<CloudConsoleLocale, string>;

type CloudConsoleRuntimeDictionary = Partial<
  Record<CloudConsoleLocale, Record<string, string>>
>;

// i18n-ignore-start: Runtime dictionaries intentionally contain source and target copy.
const cloudConsoleRuntimeText: CloudConsoleRuntimeDictionary = {
  "zh-CN": {
    "Token Usage": "Token 用量",
    "Token Usage Detail": "Token 用量明细",
    "LLM consumption and cost": "LLM 用量与成本",
    "Track LLM token consumption and cost across worlds, with platform-level budgets and pricing.":
      "跨世界追踪 LLM Token 消耗与成本，配置平台级预算与定价。",
    "Drill into one world's LLM token consumption by character, model, scene, and conversation.":
      "按角色 / 模型 / 场景 / 会话维度查看单个世界的 Token 消耗。",
    "Cloud monetization": "云端商业化",
    "Last 7 days": "近 7 天",
    "Last 30 days": "近 30 天",
    "Last 90 days": "近 90 天",
    "days": "天",
    "Worlds": "世界列表",
    "Budget": "预算",
    "Pricing": "定价",
    "Total tokens": "总 Token 数",
    "Estimated cost": "预计成本",
    "Request count": "请求数",
    "Active worlds": "活跃世界",
    "Successful requests": "成功请求",
    "Failed requests": "失败请求",
    "Active characters": "活跃角色",
    "Daily trends": "每日趋势",
    "Failure rate": "失败率",
    "Last synced": "最近同步",
    "Search worlds": "搜索世界",
    "Sort by tokens": "按 Token 排序",
    "Sort by cost": "按成本排序",
    "Sort by requests": "按请求数排序",
    "Sort by failure rate": "按失败率排序",
    "Loading…": "加载中…",
    "No data for the selected range yet.": "所选时间段内暂无数据。",
    "Platform-default budget": "平台默认预算",
    "Applied as the default platform budget; per-world overrides take precedence.":
      "作为平台默认预算；每个世界的单独覆盖优先生效。",
    "Per-world overrides": "按世界覆盖",
    "Add per-world override": "新增世界覆盖",
    "World ID": "世界 ID",
    "Enabled": "启用",
    "Disabled": "停用",
    "Metric": "计量维度",
    "Tokens": "Token",
    "Cost": "成本",
    "Enforcement": "执行策略",
    "Monitor": "仅监控",
    "Downgrade model": "降级模型",
    "Block": "拦截",
    "Daily limit": "每日上限",
    "Monthly limit": "每月上限",
    "Warning ratio (0-1)": "预警比例 (0-1)",
    "Note": "备注",
    "Optional": "可选",
    "Save": "保存",
    "Pricing catalog": "定价目录",
    "Add or update pricing": "新增或更新定价",
    "Currency": "币种",
    "Model": "模型",
    "Input / 1k tokens": "输入 / 千 Token",
    "Output / 1k tokens": "输出 / 千 Token",
    "No pricing entries yet.": "暂无定价条目。",
    "Budget saved.": "预算已保存。",
    "Budget removed.": "预算已删除。",
    "Pricing saved.": "定价已保存。",
    "Pricing removed.": "定价已删除。",
    "Sync from n1n.ai": "从 n1n.ai 同步",
    "Syncing…": "同步中…",
    "Synced {count} models from n1n.ai": "已从 n1n.ai 同步 {count} 个模型",
    "Synced {count} models, recomputed {days} days of cost.":
      "已同步 {count} 个模型，重算 {days} 天费用。", // i18n-ignore-line: runtime dict value
    "Back to token usage": "返回 Token 用量",
    "Breakdown": "维度拆解",
    "By character": "按角色",
    "By model": "按模型",
    "By scene": "按场景",
    "By conversation": "按会话",
    "By billing source": "按计费来源",
    "Label": "标签",
    "Share": "占比",
    "CLOUD_ADMIN_SECRET is required.": "请输入 CLOUD_ADMIN_SECRET。",
    "CLOUD_ADMIN_SECRET is invalid.": "CLOUD_ADMIN_SECRET 无效。",
    "Cloud admin session is invalid or expired.":
      "云世界管理会话无效或已过期。",
    "Cloud admin token exchange returned an empty response.":
      "云世界管理令牌交换返回空响应。",
    "Cloud admin refresh returned an empty response.":
      "云世界管理会话刷新返回空响应。",
    "Cloud admin request failed.": "云世界管理请求失败。",
    "Network request failed.": "网络请求失败。",
    "Cloud admin API error": "云世界管理 API 错误",
    "Unknown admin sessions error.": "未知管理会话错误。",
    "Clipboard copy failed in this environment.":
      "当前环境无法复制到剪贴板。",
    "Waiting sync task action failed.": "等待同步任务操作失败。",
    "Admin sessions permalink copied.": "管理会话固定链接已复制。",
    "Worlds permalink copied.": "世界列表固定链接已复制。",
    "Enter admin": "进入后台",
    "Opening admin…": "正在打开后台…",
    "World is sleeping. Wake it up before entering admin.":
      "世界处于休眠状态，请先唤醒后再进入后台。",
    "Browser blocked the popup. Allow popups for this site and retry.":
      "浏览器拦截了弹窗。请在本站允许弹窗后重试。",

    "Downloaded admin session audit snapshot for": "已下载管理会话审计快照：",
    "Downloaded focused source snapshot for": "已下载聚焦来源快照：",
    "Downloaded risk snapshot for": "已下载风险快照：",
    "Downloaded risk groups CSV for": "已下载风险分组 CSV：",
    "Downloaded risk sessions CSV for": "已下载风险会话 CSV：",
    "Downloaded risk timeline CSV for": "已下载风险时间线 CSV：",
    "Downloaded daily risk timeline CSV for": "已下载每日风险时间线 CSV：",
    "Downloaded weekly risk timeline CSV for": "已下载每周风险时间线 CSV：",
    "Admin session audit snapshot is ready, but this browser could not start the download.":
      "管理会话审计快照已准备好，但当前浏览器无法开始下载。",
    "Focused source snapshot is ready, but this browser could not start the download.":
      "聚焦来源快照已准备好，但当前浏览器无法开始下载。",
    "Risk snapshot is ready, but this browser could not start the download.":
      "风险快照已准备好，但当前浏览器无法开始下载。",
    "Risk groups CSV is ready, but this browser could not start the download.":
      "风险分组 CSV 已准备好，但当前浏览器无法开始下载。",
    "Risk sessions CSV is ready, but this browser could not start the download.":
      "风险会话 CSV 已准备好，但当前浏览器无法开始下载。",
    "Risk timeline CSV is ready, but this browser could not start the download.":
      "风险时间线 CSV 已准备好，但当前浏览器无法开始下载。",
    "Focused source snapshot is not available.": "聚焦来源快照不可用。",
    "Risk timeline data is not ready for export yet.":
      "风险时间线数据尚未准备好，暂时无法导出。",

    "Waiting sync task replay queued.": "等待同步任务重放已入队。",
    "Waiting sync task replay was skipped.": "等待同步任务重放已跳过。",
    "Waiting sync task cleared.": "等待同步任务已清理。",
    "Waiting sync task clear was skipped.": "等待同步任务清理已跳过。",
    "No matching failed waiting sync tasks to replay.":
      "没有匹配的失败等待同步任务可重放。",
    "No matching failed waiting sync tasks to clear.":
      "没有匹配的失败等待同步任务可清理。",
    "Waiting sync context CSV download failed.":
      "等待同步上下文 CSV 下载失败。",
    "Waiting sync focus CSV download failed.":
      "等待同步聚焦 CSV 下载失败。",
    "Waiting sync CSV download failed.": "等待同步 CSV 下载失败。",
    "Waiting sync context snapshot download failed.":
      "等待同步上下文快照下载失败。",
    "Waiting sync focus snapshot download failed.":
      "等待同步聚焦快照下载失败。",
    "Waiting sync snapshot download failed.": "等待同步快照下载失败。",
    "Waiting sync context groups CSV download failed.":
      "等待同步上下文分组 CSV 下载失败。",
    "Waiting sync context groups snapshot download failed.":
      "等待同步上下文分组快照下载失败。",
    "Waiting sync permalink copied.": "等待同步固定链接已复制。",
    "Waiting sync review context copied.": "等待同步复核上下文已复制。",
    "Waiting sync task context copied.": "等待同步任务上下文已复制。",
    "Waiting sync permalink copy failed.": "等待同步固定链接复制失败。",
    "Waiting sync review context copy failed.":
      "等待同步复核上下文复制失败。",
    "Waiting sync task context copy failed.": "等待同步任务上下文复制失败。",

    "Switch status to All or Failed before running batch failed-task actions.":
      "请先将状态切换为全部或失败，再执行失败任务批量操作。",
    "All failed tasks across every page.": "所有页面中的全部失败任务。",
    "Focus snapshot appears when the current query exactly matches a visible context or target.":
      "当前查询精确匹配可见上下文或目标时，将显示聚焦快照。",
    "Add a context or target query to export a tighter investigation snapshot.":
      "请输入上下文或目标查询，以导出更聚焦的排查快照。",

    "Refresh world": "刷新世界",
    "Refresh phone": "刷新手机号",
    "Invalidate phone": "失效手机号",
    Failed: "失败",
    Pending: "待处理",
    Running: "运行中",
    "Not available": "不可用",
    None: "无",
    All: "全部",
    "Task key": "任务键",
    "Task type": "任务类型",
    Status: "状态",
    Target: "目标",
    Context: "上下文",
    Attempt: "尝试次数",
    Available: "可执行时间",
    Updated: "更新时间",
    Finished: "完成时间",
    "Lease owner": "租约持有者",
    "Last error": "最近错误",
    "Review permalink": "复核固定链接",
    "Requests path": "申请路径",
    "Worlds path": "世界路径",
    "World detail": "世界详情",
    "Visible tasks": "可见任务",
    "Task types": "任务类型",
    "Latest update": "最近更新",
    "Focus path": "聚焦路径",
    "Task ids": "任务 ID",
    "Task keys": "任务键",
    "Target values": "目标值",

    sourceKey: "来源键",
    riskLevel: "风险等级",
    riskSignals: "风险信号",
    issuedFromIp: "签发 IP",
    issuedUserAgent: "签发客户端",
    totalSessions: "总会话数",
    activeSessions: "活跃会话数",
    expiredSessions: "过期会话数",
    revokedSessions: "吊销会话数",
    refreshTokenReuseRevocations: "刷新令牌复用吊销数",
    currentSessions: "当前会话数",
    latestCreatedAt: "最近创建时间",
    latestLastUsedAt: "最近使用时间",
    latestRevokedAt: "最近吊销时间",
    sessionId: "会话 ID",
    status: "状态",
    isCurrent: "是否当前会话",
    expiresAt: "过期时间",
    lastUsedAt: "最近使用时间",
    lastUsedIp: "最近使用 IP",
    lastUsedUserAgent: "最近使用客户端",
    lastRefreshedAt: "最近刷新时间",
    revokedAt: "吊销时间",
    revokedBySessionId: "吊销方会话 ID",
    revocationReason: "吊销原因",
    createdAt: "创建时间",
    updatedAt: "更新时间",
    timestamp: "时间戳",
    eventSummary: "事件摘要",
    day: "日期",
    weekStart: "周开始",
    weekEnd: "周结束",
    pointCount: "点位数",
    id: "ID",
    taskKey: "任务键",
    taskType: "任务类型",
    attempt: "尝试次数",
    maxAttempts: "最大尝试次数",
    targetValue: "目标值",
    context: "上下文",
    availableAt: "可执行时间",
    finishedAt: "完成时间",
    lastError: "最近错误",
    leaseOwner: "租约持有者",
    requestsPath: "申请路径",
    worldsPath: "世界路径",
    worldDetailPath: "世界详情路径",
    total: "总数",
    failed: "失败",
    pending: "待处理",
    running: "运行中",
    taskTypes: "任务类型",
    latestUpdatedAt: "最近更新时间",
    refreshWorldTarget: "刷新世界目标",
    focusPath: "聚焦路径",
    taskIds: "任务 ID",
    taskKeys: "任务键",
    targetValues: "目标值",

    Feedbacks: "意见反馈",
    "User-submitted reports": "用户提交的反馈",
    "User-submitted desktop and web feedback":
      "用户提交的桌面与 Web 反馈",
    "Review user-submitted desktop and web feedback, triage status, and assign handler notes.":
      "查看用户提交的桌面与 Web 反馈，流转状态并填写处理备注。",
    "Loading feedbacks...": "正在加载反馈…",
    "Failed to load feedbacks.": "加载反馈失败。",
    "No feedback matched the current filters.": "没有符合当前筛选条件的反馈。",
    "Search title, detail, owner, phone, email":
      "搜索标题、内容、世界主人、手机号、邮箱",
    "All statuses": "全部状态",
    "All priorities": "全部优先级",
    "All categories": "全部分类",
    "All sources": "全部来源",
    "High priority active": "未完结高优先级",
    Page: "第",
    entries: "条",
    Previous: "上一页",
    Next: "下一页",
    "First page": "首页",
    "Last page": "末页",
    "Jump to page": "跳至",
    Go: "跳转",
    "This page is empty. Use the pager to jump back.":
      "本页无数据，请通过分页器跳回。",
    "{total} total": "共 {total} 条",
    "Handler note": "处理备注",
    "Internal note for this feedback. Saved when you change status.":
      "针对该反馈的内部备注，切换状态时一并保存。",
    Detail: "问题描述",
    Reproduction: "复现步骤",
    Expected: "期望结果",
    "Diagnostic summary": "诊断摘要",
    Phone: "手机号",
    Email: "邮箱",
    Registered: "注册时间",
    "Registration IP": "注册 IP",
    "Last login": "上次登录时间",
    "Last login IP": "当前 IP",
    "Last chat": "上次发言时间", // i18n-ignore-line: runtime dict value
    "Real users": "用户总数（不含测试号）", // i18n-ignore-line: runtime dict value
    "Member users": "会员用户数（订阅有效）", // i18n-ignore-line: runtime dict value
    Device: "上次登录设备",
    "Region distribution": "地区分布",
    "Device distribution": "设备分布",
    "No data yet.": "暂无数据",
    "Sort by last login": "按上次登录时间排序",
    "Last user message": "上次用户消息时间", // i18n-ignore-line: runtime dict value
    "Sort by last user message": "按上次用户消息时间排序", // i18n-ignore-line: runtime dict value
    "Membership expires": "会员到期时间",
    "Membership registered": "会员注册时间",
    "Sort by membership registered": "按会员注册时间排序",
    "Sort by membership expires": "按会员到期时间排序",
    Owner: "世界主人",
    "Owner signature": "世界主人签名",
    "App platform": "运行平台",
    "API base url": "实例地址",
    "Submitter IP": "提交方 IP",
    "User agent": "User-Agent",
    "Client record id": "客户端记录 ID",
    "Client submitted at": "客户端提交时间",
    "Created at": "创建时间",
    "Handled at": "处理时间",
    New: "待处理",
    "In progress": "处理中",
    Resolved: "已解决",
    Archived: "已归档",
    new: "待处理",
    in_progress: "处理中",
    resolved: "已解决",
    archived: "已归档",
    High: "高",
    Medium: "中",
    Low: "低",
    high: "高",
    medium: "中",
    low: "低",
    Bug: "功能异常",
    Interaction: "交互体验",
    Performance: "性能",
    Content: "内容口径",
    Feature: "能力建议",
    bug: "功能异常",
    interaction: "交互体验",
    performance: "性能",
    content: "内容口径",
    feature: "能力建议",
    Desktop: "桌面",
    Web: "Web",
    Mobile: "移动端",
    WeChat: "微信",
    desktop: "桌面",
    web: "Web",
    mobile: "移动端",
    wechat: "微信",
    "(no phone)": "（无手机号）",
    "(no email)": "（无邮箱）",
    "Code:": "邀请码：",
    "Status:": "状态：",
    "IP:": "IP：",
    "Device:": "设备：",
    "Created at:": "创建时间：",
    "Reason:": "原因：",
    "Account:": "账号：",
    "Subscription:": "订阅：",
    "Current plan:": "当前套餐：",
    "Expires at:": "到期时间：",
    "Invite code:": "邀请码：",
    "World status:": "世界状态：",
    "World:": "世界：",
    Overview: "概览",
    Events: "事件",
    Funnel: "漏斗",
    "API health": "API 健康度",
    Errors: "错误",
    "Client telemetry, PV/UV, API health and frontend errors.":
      "客户端埋点上报、PV/UV、API 健康度与前端错误。",
    "Page views (by app)": "页面浏览（按端分组）",
    "Page views": "页面浏览",
    "Failed to load overview": "加载概览失败",
    "Failed to load line chart": "加载折线失败",
    "Failed to load events": "加载事件失败",
    "Failed to load funnel": "加载漏斗失败",
    "Failed to load API health": "加载 API 健康度失败",
    "Failed to load error list": "加载错误列表失败",
    "Page views PV": "页面浏览 PV",
    "Unique visitors UV": "独立访客 UV",
    Sessions: "会话数",
    "Frontend errors": "前端错误",
    "Average session duration": "平均会话时长",
    "24 hours": "24 小时",
    "7 days": "7 天",
    "30 days": "30 天",
    "All apps": "全部端",
    "Comma-separated event names (in order)": "逗号分隔的事件名（按顺序）",
    "Apply funnel": "更新漏斗",
    "Funnel is empty. Please enter steps first.": "漏斗为空。请先输入步骤。",
    "No events in the current range.": "当前范围内无事件。",
    "No API telemetry in the current range.": "当前范围内无 API 调用埋点。",
    "No error events in the current range.": "当前范围内无错误事件。",
    "Collapse stack": "收起堆栈",
    "Expand stack": "展开堆栈",
    Start: "起点",
    Telemetry: "遥测",
    Path: "路径",
    Calls: "调用次数",
    "MiniMax calls & rate-limit (hourly)": "MiniMax 调用与限流（按小时）",
    "RPM/Concurrency limited": "RPM/并发受限",
    "Quota exhausted": "配额耗尽",
    "Failed to load MiniMax usage": "加载 MiniMax 用量失败",
    Success: "成功率",
    p50: "p50",
    p95: "p95",
    Event: "事件",
    Type: "类型",
    Count: "数量",
    "Unique users": "独立用户",
    "Unique anons": "独立匿名",
    World: "世界",
    "All worlds": "全部世界",
    "Active users": "活跃用户",
    "Recent activity": "最近活动",
    "Top worlds by activity": "世界活跃度排行",
    "Page views (this world)": "页面浏览（本世界）",
    "Failed to load world ranking": "加载世界排行失败",
    "No world activity in the current range.": "当前范围内无世界活动。",
    "Page views, active users and top operations captured for this world by client telemetry.":
      "客户端埋点采集到的本世界页面浏览、活跃用户与高频操作。",

    Confirm: "确认",
    Cancel: "取消",
    Close: "关闭",
    "Working...": "处理中…",
    Unleased: "未持有租约",
    "Delayed jobs in filter": "当前筛选的延期任务",
    "Inspect provisioning, resume, suspend, and reconcile work for the selected world.":
      "查看所选世界的开通、恢复、暂停与对账工作。",
    "Inspect provisioning, resume, suspend, and reconcile work across the managed world fleet.":
      "查看托管世界全队的开通、恢复、暂停与对账工作。",
    "Existing bootstrap packages and runtime env overlays will become stale until operators redeploy the updated token.":
      "已有的引导包与运行时环境覆盖层会失效，需要运维重新下发新令牌后才会同步。",
    "Rotate token": "轮换令牌",
    "Rotating...": "轮换中…",
    "System ready": "系统正常",
    "System warning": "系统告警",

    App: "应用",
    Site: "站点",
    Wiki: "Wiki",
    "queue: all": "队列：全部",
    "queue: running": "队列：运行中",
    "queue: lease expired": "队列：租约过期",
    "queue: delayed": "队列：延迟",
    "Lease expired": "租约过期",
    Delayed: "延迟",
    Other: "其他",
    "Session id, IP, client, revoker": "会话 ID、IP、客户端、撤销人",
    "Waiting sync status": "等待同步状态",
    "Waiting sync task type": "等待同步任务类型",
    "Waiting sync search": "等待同步搜索",
    "task key, target, context, or error": "任务键、目标、上下文或错误",
    "Waiting sync page size": "等待同步分页大小",
    "Context task review": "上下文任务复核",
    "Recent task receipts": "最近任务回执",

    "Admin sessions": "管理员会话",
    "Review live admin sessions, inspect where they were issued from, filter by revocation path, and page through longer audit history.":
      "查看实时的管理员会话、签发来源、按撤销路径筛选，并翻阅更长的审计历史。",
    "Source groups": "来源分组",
    "Aggregate sessions by issue IP and client under the current filters, then revoke an entire source in one action.":
      "在当前筛选条件下按签发 IP 与客户端聚合会话，并可一键撤销整个来源。",
    "Risk timeline": "风险时间线",
    "Derived from session issue, expiry, and revoke events inside the focused source group under the current filters.":
      "依据当前筛选下聚焦来源分组的会话签发、过期与撤销事件计算得出。",
    "Current rationale": "当前判定依据",
    "Select all active admin sessions": "选中全部活跃的管理员会话",
    "Recent operation receipts": "最近操作回执",
    "Revoke admin session?": "撤销管理员会话？",
    "Revoke selected admin sessions?": "撤销所选的管理员会话？",
    "Revoke all matching admin sessions?": "撤销全部匹配的管理员会话？",
    "Revoke matching risk groups?": "撤销匹配的风险分组？",
    "Revoke source group?": "撤销来源分组？",

    Search: "搜索",
    Revocation: "吊销",
    Scope: "范围",
    "Sort by": "排序字段",
    Direction: "方向",
    "Page size": "每页条数",
    "Source sort": "来源排序",
    "Source direction": "来源方向",
    "Source risk": "来源风险",
    "Source page size": "来源每页条数",
    "All risk": "全部风险",
    "Critical risk": "严重风险",
    "Watch risk": "观察风险",
    "Normal risk": "正常风险",
    Reset: "重置",
    "Request id": "请求 ID",
    "{0} per page": "每页 {0} 条",
    "Focused context": "聚焦上下文",
    "Focused target": "聚焦目标",
    "Artifact summary": "产物摘要",
    API: "API",

    // admin-session-meta.ts 标签
    Active: "活跃",
    Expired: "已过期",
    Revoked: "已撤销",
    Unknown: "未知",
    Logout: "退出登录",
    "Manual revoke": "手动撤销",
    "Refresh reuse": "令牌复用",
    "All reasons": "全部原因",
    "All sessions": "全部会话",
    "Current only": "仅当前",
    Created: "创建时间",
    "Refresh expiry": "刷新令牌到期",
    "Last used": "最近使用",
    "Revoked at": "撤销时间",
    Ascending: "升序",
    Descending: "降序",
    "Active sessions": "活跃会话",
    "Total sessions": "总会话数",
    "Latest used": "最近使用",
    "Latest created": "最近创建",
    "Latest revoked": "最近撤销",
    "All risk levels": "全部风险级别",
    "Critical only": "仅严重",
    "Watch only": "仅观察",
    "Normal only": "仅正常",
    "Refresh reuse detected": "检测到令牌复用",
    "Repeated revocations": "重复撤销",
    "Multiple active sessions": "多个活跃会话",

    // 风险阈值规则
    "Watch threshold": "观察阈值",
    "Critical threshold": "严重阈值",
    "2+ active or 2+ revoked": "2 个以上活跃或已撤销",
    "4+ active or any refresh reuse": "4 个以上活跃或存在令牌复用",

    // 撤销确认弹窗描述
    "Risk filter: {0}.": "风险筛选：{0}。",
    "This will revoke the current active admin session if it still matches the focused source group and current filters.":
      "如果当前活跃管理员会话仍符合聚焦来源分组和当前筛选条件，将撤销该会话。",
    "This will revoke the current active admin session if it still matches the current filters.":
      "如果当前活跃管理员会话仍符合当前筛选条件，将撤销该会话。",
    "This will revoke every active admin session in the focused source group that still matches the current filters, including sessions on other pages.":
      "将撤销聚焦来源分组中所有仍符合当前筛选条件的活跃管理员会话，包括其他页面上的会话。",
    "This will revoke every active admin session matching the current filters, including sessions on other pages.":
      "将撤销所有符合当前筛选条件的活跃管理员会话，包括其他页面上的会话。",
    "This focused source group includes the current console session. Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session, and the next admin request will need to exchange a fresh short-lived token.":
      "该聚焦来源分组包含当前控制台会话。此聚焦来源分组中的所有活跃会话将立即停止授权管理请求，即使当前列表已缩小到一个会话，下次管理请求也需要交换一个新的短期令牌。",
    "Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session.":
      "此聚焦来源分组中的所有活跃会话将立即停止授权管理请求，即使当前列表已缩小到一个会话。",
    "This source group includes the current console session. Every matching active session in this source group will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "该来源分组包含当前控制台会话。此来源分组中所有匹配的活跃会话将立即停止授权管理请求，下次管理请求需要交换一个新的短期令牌。",
    "Every matching active session in this source group will stop authorizing admin requests immediately.":
      "此来源分组中所有匹配的活跃会话将立即停止授权管理请求。",
    "This will revoke every active session in source groups marked {0} that still match the focused source group and current filters.":
      "将撤销标记为 {0} 的来源分组中所有仍符合聚焦来源分组和当前筛选条件的活跃会话。",
    "This will revoke every active session in source groups marked {0} that still match the current filters, including groups on other pages.":
      "将撤销标记为 {0} 的来源分组中所有仍符合当前筛选条件的活跃会话，包括其他页面上的分组。",

    // admin-sessions-page 其他字符串
    "Unknown IP": "未知 IP",
    "By unknown session": "来自未知会话",
    "Active threshold match": "活跃阈值匹配",
    "Revoked threshold match": "撤销阈值匹配",
    "Refresh reuse match": "令牌复用匹配",
    "Source state changed": "来源状态变更",
    "Refresh reuse revoke": "令牌复用撤销",
    "Last refreshed": "最近刷新时间",
    "No risk signals at this point.": "此时间点无风险信号。",
    "Hide matched sessions": "收起匹配会话",
    "Show matched sessions": "展开匹配会话",
    "Matched sessions at this point": "此时间点的匹配会话",
    "Revoking...": "撤销中…",
    "Revoke matching sessions": "撤销匹配会话",
    "Revoke risk groups": "撤销风险分组",
    "This is the current console session. New admin requests will need to exchange a fresh short-lived token.":
      "这是当前控制台会话。新的管理请求需要交换一个新的短期令牌。",
    "The selected session will stop authorizing admin requests immediately.":
      "所选会话将立即停止授权管理请求。",
    "This selection includes the current console session. {0} selected session(s) will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "此选择包含当前控制台会话。{0} 个选中的会话将立即停止授权管理请求，下次管理请求需要交换一个新的短期令牌。",
    "{0} selected session(s) will stop authorizing admin requests immediately.":
      "{0} 个选中的会话将立即停止授权管理请求。",

    // waiting-session-sync-page 字符串
    "Reviewing tasks": "正在查看任务",
    "Review tasks": "查看任务",
    "Context focused": "上下文已聚焦",
    "Focus context": "聚焦上下文",
    "Clear failed task": "清除失败任务",
    "Clearing...": "清除中…",
    "Delete failed task {0}. This removes the durable record from the retry queue.":
      "删除失败任务 {0}，将从重试队列中移除该持久记录。",
    "Delete all matching failed waiting sync tasks for the current task type and search filters.":
      "删除当前任务类型和搜索筛选条件匹配的所有失败等待同步任务。",

    // waiting-session-sync-fragments 状态 pills 和 artifact summary
    "Failed {0}": "失败 {0}",
    "Pending {0}": "待处理 {0}",
    "Running {0}": "运行中 {0}",
    "Ids {0}": "ID {0} 个",
    "Keys {0}": "键 {0} 个",
    "Targets {0}": "目标 {0} 个",
    "Target values: {0}": "目标值：{0}",
    "World detail: {0}": "世界详情：{0}",
    "Daily summary of {0} timeline point(s)": "每日摘要（{0} 个时间线节点）",
    "Weekly summary of {0} timeline point(s)": "每周摘要（{0} 个时间线节点）",
    "Focused source risk": "聚焦来源风险",
    "Focused from the risk timeline so you can verify audit fields before taking session actions.":
      "从风险时间线聚焦，可在执行会话操作前验证审计字段。",
    "Export focused source snapshot": "导出聚焦来源快照",
    "Revoke": "撤销",
    "Current": "当前",
    "Revoke focused source": "撤销聚焦来源",
    "Latest timeline snapshot": "最新时间线快照",
    "Synced with {0}.": "已与{0}同步。",
    "{0} timeline point(s)": "{0} 个时间线节点",
    "{0} matched session(s)": "{0} 个匹配会话",
    "Issued": "签发时间",
    "Viewing source group": "查看来源分组",
    "Clear source focus": "清除来源聚焦",
    "Loading risk timeline...": "正在加载风险时间线…",
    "No timeline points are available for the focused source group.":
      "当前聚焦的来源分组暂无时间线节点。",
    "View in sessions list": "在会话列表中查看",
    "Current admin session revoked. Console will re-issue a short-lived token on the next request.":
      "当前管理员会话已撤销，控制台将在下次请求时重新签发短期令牌。",
    "Admin session revoked.": "管理员会话已撤销。",
    "No selected admin sessions were revoked. The list may already be stale.":
      "未撤销任何所选管理员会话，列表可能已过期。",
    "Revoked {0} selected session(s).": "已撤销 {0} 个所选会话。",
    "{0} session(s) were already unavailable.": "{0} 个会话已不可用。",
    "No matching active admin sessions were revoked.": "未撤销任何匹配的活跃管理员会话。",
    "Revoked {0} matching active session(s).": "已撤销 {0} 个匹配的活跃会话。",
    "{0} session(s) were skipped because they were already unavailable.":
      "{0} 个会话因已不可用而被跳过。",
    "No active admin sessions in the selected source group were revoked.":
      "所选来源分组中无活跃管理员会话被撤销。",
    "Revoked {0} matching active session(s) in the selected source group.":
      "已撤销所选来源分组中 {0} 个匹配的活跃会话。",
    "Open task permalink": "打开任务永久链接",
    "Open review permalink": "打开查看永久链接",
  },
  "ja-JP": {
    "Token Usage": "Token 使用量",
    "Token Usage Detail": "Token 使用量の詳細",
    "LLM consumption and cost": "LLM 消費量とコスト",
    "Track LLM token consumption and cost across worlds, with platform-level budgets and pricing.":
      "ワールド全体の LLM トークン消費量とコストを追跡し、プラットフォーム単位の予算と料金を管理します。",
    "Drill into one world's LLM token consumption by character, model, scene, and conversation.":
      "キャラクター / モデル / シーン / 会話別に、単一ワールドの Token 消費量をドリルダウンします。",
    "Cloud monetization": "クラウド収益化",
    "Last 7 days": "直近 7 日間",
    "Last 30 days": "直近 30 日間",
    "Last 90 days": "直近 90 日間",
    "days": "日間",
    "Worlds": "ワールド一覧",
    "Budget": "予算",
    "Pricing": "料金",
    "Total tokens": "合計 Token 数",
    "Estimated cost": "推定コスト",
    "Request count": "リクエスト数",
    "Active worlds": "アクティブワールド",
    "Successful requests": "成功リクエスト",
    "Failed requests": "失敗リクエスト",
    "Active characters": "アクティブキャラクター",
    "Daily trends": "日次トレンド",
    "Failure rate": "失敗率",
    "Last synced": "最終同期",
    "Search worlds": "ワールドを検索",
    "Sort by tokens": "Token で並び替え",
    "Sort by cost": "コストで並び替え",
    "Sort by requests": "リクエスト数で並び替え",
    "Sort by failure rate": "失敗率で並び替え",
    "Loading…": "読み込み中…",
    "No data for the selected range yet.": "選択した期間内のデータはまだありません。",
    "Platform-default budget": "プラットフォーム既定予算",
    "Applied as the default platform budget; per-world overrides take precedence.":
      "プラットフォーム既定予算として適用され、ワールド単位の上書きが優先されます。",
    "Per-world overrides": "ワールド別上書き",
    "Add per-world override": "ワールド単位の上書きを追加",
    "World ID": "ワールド ID",
    "Enabled": "有効",
    "Disabled": "無効",
    "Metric": "計測対象",
    "Tokens": "Token",
    "Cost": "コスト",
    "Enforcement": "適用ポリシー",
    "Monitor": "モニターのみ",
    "Downgrade model": "モデルをダウングレード",
    "Block": "ブロック",
    "Daily limit": "日次上限",
    "Monthly limit": "月次上限",
    "Warning ratio (0-1)": "警告比率 (0-1)",
    "Note": "備考",
    "Optional": "任意",
    "Save": "保存",
    "Pricing catalog": "料金カタログ",
    "Add or update pricing": "料金の追加または更新",
    "Currency": "通貨",
    "Model": "モデル",
    "Input / 1k tokens": "入力 / 1k Token",
    "Output / 1k tokens": "出力 / 1k Token",
    "No pricing entries yet.": "料金エントリはまだありません。",
    "Budget saved.": "予算を保存しました。",
    "Budget removed.": "予算を削除しました。",
    "Pricing saved.": "料金を保存しました。",
    "Pricing removed.": "料金を削除しました。",
    "Sync from n1n.ai": "n1n.ai から同期",
    "Syncing…": "同期中…",
    "Synced {count} models from n1n.ai":
      "n1n.ai から {count} 件のモデルを同期しました",
    "Synced {count} models, recomputed {days} days of cost.":
      "{count} 件のモデルを同期し、{days} 日分の費用を再計算しました。", // i18n-ignore-line: runtime dict value
    "Back to token usage": "Token 使用量に戻る",
    "Breakdown": "内訳",
    "By character": "キャラクター別",
    "By model": "モデル別",
    "By scene": "シーン別",
    "By conversation": "会話別",
    "By billing source": "課金ソース別",
    "Label": "ラベル",
    "Share": "シェア",
    "CLOUD_ADMIN_SECRET is required.": "CLOUD_ADMIN_SECRET を入力してください。",
    "CLOUD_ADMIN_SECRET is invalid.": "CLOUD_ADMIN_SECRET が無効です。",
    "Cloud admin session is invalid or expired.":
      "クラウド管理セッションが無効、または期限切れです。",
    "Cloud admin token exchange returned an empty response.":
      "クラウド管理トークン交換が空のレスポンスを返しました。",
    "Cloud admin refresh returned an empty response.":
      "クラウド管理セッション更新が空のレスポンスを返しました。",
    "Cloud admin request failed.": "クラウド管理リクエストに失敗しました。",
    "Network request failed.": "ネットワークリクエストに失敗しました。",
    "Cloud admin API error": "クラウド管理 API エラー",
    "Unknown admin sessions error.": "不明な管理セッションエラーです。",
    "Clipboard copy failed in this environment.":
      "この環境ではクリップボードへコピーできません。",

    "Downloaded admin session audit snapshot for":
      "管理セッション監査スナップショットをダウンロードしました:",
    "Downloaded focused source snapshot for":
      "フォーカス元スナップショットをダウンロードしました:",
    "Downloaded risk snapshot for":
      "リスクスナップショットをダウンロードしました:",
    "Downloaded risk groups CSV for":
      "リスクグループ CSV をダウンロードしました:",
    "Downloaded risk sessions CSV for":
      "リスクセッション CSV をダウンロードしました:",
    "Downloaded risk timeline CSV for":
      "リスクタイムライン CSV をダウンロードしました:",
    "Downloaded daily risk timeline CSV for":
      "日次リスクタイムライン CSV をダウンロードしました:",
    "Downloaded weekly risk timeline CSV for":
      "週次リスクタイムライン CSV をダウンロードしました:",
    "Admin session audit snapshot is ready, but this browser could not start the download.":
      "管理セッション監査スナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
    "Focused source snapshot is ready, but this browser could not start the download.":
      "フォーカス元スナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
    "Risk snapshot is ready, but this browser could not start the download.":
      "リスクスナップショットは準備できていますが、このブラウザではダウンロードを開始できません。",
    "Risk groups CSV is ready, but this browser could not start the download.":
      "リスクグループ CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
    "Risk sessions CSV is ready, but this browser could not start the download.":
      "リスクセッション CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
    "Risk timeline CSV is ready, but this browser could not start the download.":
      "リスクタイムライン CSV は準備できていますが、このブラウザではダウンロードを開始できません。",
    "Focused source snapshot is not available.":
      "フォーカス元スナップショットは利用できません。",
    "Risk timeline data is not ready for export yet.":
      "リスクタイムラインデータはまだエクスポートできません。",

    "Waiting sync task replay queued.": "待機同期タスクの再実行をキューに追加しました。",
    "Waiting sync task replay was skipped.":
      "待機同期タスクの再実行はスキップされました。",
    "Waiting sync task cleared.": "待機同期タスクをクリアしました。",
    "Waiting sync task clear was skipped.":
      "待機同期タスクのクリアはスキップされました。",
    "No matching failed waiting sync tasks to replay.":
      "再実行できる一致した失敗待機同期タスクはありません。",
    "No matching failed waiting sync tasks to clear.":
      "クリアできる一致した失敗待機同期タスクはありません。",
    "Waiting sync context CSV download failed.":
      "待機同期コンテキスト CSV のダウンロードに失敗しました。",
    "Waiting sync focus CSV download failed.":
      "待機同期フォーカス CSV のダウンロードに失敗しました。",
    "Waiting sync CSV download failed.":
      "待機同期 CSV のダウンロードに失敗しました。",
    "Waiting sync context snapshot download failed.":
      "待機同期コンテキストスナップショットのダウンロードに失敗しました。",
    "Waiting sync focus snapshot download failed.":
      "待機同期フォーカススナップショットのダウンロードに失敗しました。",
    "Waiting sync snapshot download failed.":
      "待機同期スナップショットのダウンロードに失敗しました。",
    "Waiting sync context groups CSV download failed.":
      "待機同期コンテキストグループ CSV のダウンロードに失敗しました。",
    "Waiting sync context groups snapshot download failed.":
      "待機同期コンテキストグループスナップショットのダウンロードに失敗しました。",
    "Waiting sync permalink copied.": "待機同期の固定リンクをコピーしました。",
    "Waiting sync review context copied.":
      "待機同期のレビューコンテキストをコピーしました。",
    "Waiting sync task context copied.":
      "待機同期タスクのコンテキストをコピーしました。",
    "Waiting sync permalink copy failed.":
      "待機同期の固定リンクをコピーできませんでした。",
    "Waiting sync review context copy failed.":
      "待機同期のレビューコンテキストをコピーできませんでした。",
    "Waiting sync task context copy failed.":
      "待機同期タスクのコンテキストをコピーできませんでした。",

    "Switch status to All or Failed before running batch failed-task actions.":
      "失敗タスクの一括操作を実行する前に、ステータスを All または Failed に切り替えてください。",
    "All failed tasks across every page.": "全ページのすべての失敗タスク。",
    "Focus snapshot appears when the current query exactly matches a visible context or target.":
      "現在の検索が表示中のコンテキストまたはターゲットに完全一致すると、フォーカススナップショットが表示されます。",
    "Add a context or target query to export a tighter investigation snapshot.":
      "より絞り込んだ調査スナップショットを出力するには、コンテキストまたはターゲット検索を入力してください。",

    "Refresh world": "ワールド更新",
    "Refresh phone": "電話番号更新",
    "Invalidate phone": "電話番号無効化",
    Failed: "失敗",
    Pending: "保留中",
    Running: "実行中",
    "Not available": "利用不可",
    None: "なし",
    All: "すべて",
    "Task key": "タスクキー",
    "Task type": "タスクタイプ",
    Status: "ステータス",
    Target: "ターゲット",
    Context: "コンテキスト",
    Attempt: "試行",
    Available: "実行可能時刻",
    Updated: "更新日時",
    Finished: "完了日時",
    "Lease owner": "リース所有者",
    "Last error": "最新エラー",
    "Review permalink": "レビュー固定リンク",
    "Requests path": "申請パス",
    "Worlds path": "ワールドパス",
    "World detail": "ワールド詳細",
    "Visible tasks": "表示タスク",
    "Task types": "タスクタイプ",
    "Latest update": "最新更新",
    "Focus path": "フォーカスパス",
    "Task ids": "タスク ID",
    "Task keys": "タスクキー",
    "Target values": "ターゲット値",
    "Waiting sync task action failed.":
      "待機同期タスク操作に失敗しました。",
    "Admin sessions permalink copied.":
      "管理セッションの固定リンクをコピーしました。",
    "Worlds permalink copied.": "ワールド一覧の固定リンクをコピーしました。",
    sourceKey: "ソースキー",
    riskLevel: "リスクレベル",
    riskSignals: "リスクシグナル",
    issuedFromIp: "発行元 IP",
    issuedUserAgent: "発行元クライアント",
    totalSessions: "総セッション数",
    activeSessions: "アクティブセッション数",
    expiredSessions: "期限切れセッション数",
    revokedSessions: "取り消し済みセッション数",
    refreshTokenReuseRevocations: "更新トークン再利用取り消し数",
    currentSessions: "現在のセッション数",
    latestCreatedAt: "最新作成日時",
    latestLastUsedAt: "最新使用日時",
    latestRevokedAt: "最新取り消し日時",
    sessionId: "セッション ID",
    status: "ステータス",
    isCurrent: "現在のセッション",
    expiresAt: "期限日時",
    lastUsedAt: "最終使用日時",
    lastUsedIp: "最終使用 IP",
    lastUsedUserAgent: "最終使用クライアント",
    lastRefreshedAt: "最終更新日時",
    revokedAt: "取り消し日時",
    revokedBySessionId: "取り消し元セッション ID",
    revocationReason: "取り消し理由",
    createdAt: "作成日時",
    updatedAt: "更新日時",
    timestamp: "タイムスタンプ",
    eventSummary: "イベント概要",
    day: "日付",
    weekStart: "週開始",
    weekEnd: "週終了",
    pointCount: "ポイント数",
    id: "ID",
    taskKey: "タスクキー",
    taskType: "タスクタイプ",
    attempt: "試行",
    maxAttempts: "最大試行回数",
    targetValue: "ターゲット値",
    context: "コンテキスト",
    availableAt: "実行可能時刻",
    finishedAt: "完了日時",
    lastError: "最新エラー",
    leaseOwner: "リース所有者",
    requestsPath: "申請パス",
    worldsPath: "ワールドパス",
    worldDetailPath: "ワールド詳細パス",
    total: "合計",
    failed: "失敗",
    pending: "保留中",
    running: "実行中",
    taskTypes: "タスクタイプ",
    latestUpdatedAt: "最新更新日時",
    refreshWorldTarget: "ワールド更新ターゲット",
    focusPath: "フォーカスパス",
    taskIds: "タスク ID",
    taskKeys: "タスクキー",
    targetValues: "ターゲット値",

    Feedbacks: "フィードバック",
    "User-submitted reports": "ユーザーから寄せられた報告",
    "User-submitted desktop and web feedback":
      "ユーザーから寄せられたデスクトップ／Web のフィードバック",
    "Review user-submitted desktop and web feedback, triage status, and assign handler notes.":
      "デスクトップと Web のユーザーフィードバックを確認し、ステータスを切り替え、対応メモを残します。",
    "Loading feedbacks...": "フィードバックを読み込み中…",
    "Failed to load feedbacks.": "フィードバックの読み込みに失敗しました。",
    "No feedback matched the current filters.":
      "現在のフィルタに該当するフィードバックはありません。",
    "Search title, detail, owner, phone, email":
      "タイトル、本文、ワールドオーナー、電話番号、メールで検索",
    "All statuses": "すべての状態",
    "All priorities": "すべての優先度",
    "All categories": "すべてのカテゴリ",
    "All sources": "すべてのソース",
    "High priority active": "未完了の高優先度",
    Page: "ページ",
    entries: "件",
    Previous: "前へ",
    Next: "次へ",
    "First page": "最初",
    "Last page": "最後",
    "Jump to page": "ページへジャンプ",
    Go: "移動",
    "This page is empty. Use the pager to jump back.":
      "このページにデータはありません。ページャーで前のページに戻ってください。",
    "{total} total": "全 {total} 件",
    "Handler note": "対応メモ",
    "Internal note for this feedback. Saved when you change status.":
      "このフィードバックに対する社内メモ。ステータス変更時に保存されます。",
    Detail: "詳細",
    Reproduction: "再現手順",
    Expected: "期待結果",
    "Diagnostic summary": "診断サマリ",
    Phone: "電話番号",
    Email: "メール",
    Registered: "登録日時",
    "Registration IP": "登録 IP",
    "Last login": "最終ログイン日時",
    "Last login IP": "現在の IP",
    "Last chat": "最終発言日時", // i18n-ignore-line: runtime dict value
    "Real users": "実ユーザー数（テスト除外）", // i18n-ignore-line: runtime dict value
    "Member users": "有効サブスクユーザー数", // i18n-ignore-line: runtime dict value
    Device: "最終ログイン端末",
    "Region distribution": "地域分布",
    "Device distribution": "端末分布",
    "No data yet.": "データがまだありません",
    "Sort by last login": "最終ログイン日時で並び替え",
    "Last user message": "最終ユーザーメッセージ日時", // i18n-ignore-line: runtime dict value
    "Sort by last user message": "最終ユーザーメッセージ日時で並び替え", // i18n-ignore-line: runtime dict value
    "Membership expires": "会員有効期限",
    "Membership registered": "会員登録日時",
    "Sort by membership registered": "会員登録日時で並び替え",
    "Sort by membership expires": "会員有効期限で並び替え",
    Owner: "ワールドオーナー",
    "Owner signature": "オーナーの署名",
    "App platform": "実行プラットフォーム",
    "API base url": "API ベース URL",
    "Submitter IP": "送信者 IP",
    "User agent": "User-Agent",
    "Client record id": "クライアント記録 ID",
    "Client submitted at": "クライアント送信時刻",
    "Created at": "作成日時",
    "Handled at": "対応日時",
    New: "新規",
    "In progress": "対応中",
    Resolved: "解決済み",
    Archived: "アーカイブ済み",
    new: "新規",
    in_progress: "対応中",
    resolved: "解決済み",
    archived: "アーカイブ済み",
    High: "高",
    Medium: "中",
    Low: "低",
    high: "高",
    medium: "中",
    low: "低",
    Bug: "不具合",
    Interaction: "操作性",
    Performance: "パフォーマンス",
    Content: "表現整合",
    Feature: "機能要望",
    bug: "不具合",
    interaction: "操作性",
    performance: "パフォーマンス",
    content: "表現整合",
    feature: "機能要望",
    Desktop: "デスクトップ",
    Web: "Web",
    Mobile: "モバイル",
    WeChat: "WeChat",
    desktop: "デスクトップ",
    web: "Web",
    mobile: "モバイル",
    wechat: "WeChat",
    "(no phone)": "（電話番号なし）",
    "Code:": "招待コード:",
    "Status:": "ステータス:",
    "IP:": "IP:",
    "Device:": "デバイス:",
    "Created at:": "作成日時:",
    "Reason:": "理由:",
    "Account:": "アカウント:",
    "Subscription:": "サブスクリプション:",
    "Current plan:": "現在のプラン:",
    "Expires at:": "有効期限:",
    "Invite code:": "招待コード:",
    "World status:": "ワールドステータス:",
    "World:": "ワールド:",
    Overview: "概要",
    Events: "イベント",
    Funnel: "ファネル",
    "API health": "API ヘルス",
    Errors: "エラー",
    "Client telemetry, PV/UV, API health and frontend errors.":
      "クライアント計測（PV/UV）、API ヘルス、フロントエンドエラー。",
    "Page views (by app)": "ページビュー（アプリ別）",
    "Page views": "ページビュー",
    "Failed to load overview": "概要の読み込みに失敗しました",
    "Failed to load line chart": "折れ線グラフの読み込みに失敗しました",
    "Failed to load events": "イベントの読み込みに失敗しました",
    "Failed to load funnel": "ファネルの読み込みに失敗しました",
    "Failed to load API health": "API ヘルスの読み込みに失敗しました",
    "Failed to load error list": "エラー一覧の読み込みに失敗しました",
    "Page views PV": "ページビュー PV",
    "Unique visitors UV": "ユニークビジター UV",
    Sessions: "セッション数",
    "Frontend errors": "フロントエンドエラー",
    "Average session duration": "平均セッション時間",
    "24 hours": "24 時間",
    "7 days": "7 日間",
    "30 days": "30 日間",
    "All apps": "すべてのアプリ",
    "Comma-separated event names (in order)":
      "カンマ区切りのイベント名（順番通り）",
    "Apply funnel": "ファネルを適用",
    "Funnel is empty. Please enter steps first.":
      "ファネルが空です。先にステップを入力してください。",
    "No events in the current range.": "現在の範囲にイベントがありません。",
    "No API telemetry in the current range.":
      "現在の範囲に API 計測がありません。",
    "No error events in the current range.":
      "現在の範囲にエラーイベントがありません。",
    "Collapse stack": "スタックを折りたたむ",
    "Expand stack": "スタックを展開",
    Start: "起点",
    Telemetry: "テレメトリ",
    Path: "パス",
    Calls: "呼び出し数",
    "MiniMax calls & rate-limit (hourly)": "MiniMax 呼び出しとレート制限（毎時）",
    "RPM/Concurrency limited": "RPM/同時実行制限",
    "Quota exhausted": "クォータ枯渇",
    "Failed to load MiniMax usage": "MiniMax 使用量の読み込みに失敗しました",
    Success: "成功率",
    p50: "p50",
    p95: "p95",
    Event: "イベント",
    Type: "タイプ",
    Count: "件数",
    "Unique users": "ユニークユーザー",
    "Unique anons": "ユニーク匿名",
    World: "ワールド",
    "All worlds": "すべてのワールド",
    "Active users": "アクティブユーザー",
    "Recent activity": "最近のアクティビティ",
    "Top worlds by activity": "アクティビティ別ワールドランキング",
    "Page views (this world)": "ページビュー（このワールド）",
    "Failed to load world ranking": "ワールドランキングの読み込みに失敗しました",
    "No world activity in the current range.":
      "現在の期間にワールド活動はありません。",
    "Page views, active users and top operations captured for this world by client telemetry.":
      "クライアント計測で取得したこのワールドのページビュー、アクティブユーザー、上位操作。",

    Confirm: "確認",
    Cancel: "キャンセル",
    Close: "閉じる",
    "Working...": "処理中…",
    Unleased: "リース未取得",
    "Delayed jobs in filter": "現在のフィルターで遅延中のジョブ",
    "Inspect provisioning, resume, suspend, and reconcile work for the selected world.":
      "選択したワールドのプロビジョニング・再開・一時停止・整合性確認を確認します。",
    "Inspect provisioning, resume, suspend, and reconcile work across the managed world fleet.":
      "管理対象ワールド全体のプロビジョニング・再開・一時停止・整合性確認を確認します。",
    "Existing bootstrap packages and runtime env overlays will become stale until operators redeploy the updated token.":
      "既存のブートストラップパッケージとランタイム環境のオーバーレイは、運用担当者が更新後のトークンを再デプロイするまで古い状態のままになります。",
    "Rotate token": "トークンをローテーション",
    "Rotating...": "ローテーション中…",
    "System ready": "システム正常",
    "System warning": "システム警告",

    App: "アプリ",
    Site: "サイト",
    Wiki: "Wiki",
    "queue: all": "キュー：すべて",
    "queue: running": "キュー：実行中",
    "queue: lease expired": "キュー：リース期限切れ",
    "queue: delayed": "キュー：遅延",
    "Lease expired": "リース期限切れ",
    Delayed: "遅延",
    Other: "その他",
    "Session id, IP, client, revoker":
      "セッション ID、IP、クライアント、取り消し者",
    "Waiting sync status": "待機同期ステータス",
    "Waiting sync task type": "待機同期タスク種別",
    "Waiting sync search": "待機同期検索",
    "task key, target, context, or error":
      "タスクキー、対象、コンテキスト、またはエラー",
    "Waiting sync page size": "待機同期ページサイズ",
    "Context task review": "コンテキストタスクレビュー",
    "Recent task receipts": "最近のタスク受領",

    "Admin sessions": "管理者セッション",
    "Review live admin sessions, inspect where they were issued from, filter by revocation path, and page through longer audit history.":
      "稼働中の管理者セッションを確認し、発行元を調べ、取り消し経路でフィルタリングし、より長い監査履歴をページングできます。",
    "Source groups": "発行元グループ",
    "Aggregate sessions by issue IP and client under the current filters, then revoke an entire source in one action.":
      "現在のフィルター条件で発行 IP とクライアント単位にセッションを集計し、一括で発行元全体を取り消せます。",
    "Risk timeline": "リスクタイムライン",
    "Derived from session issue, expiry, and revoke events inside the focused source group under the current filters.":
      "現在のフィルター条件で注目している発行元グループ内のセッション発行・期限・取り消しイベントから算出します。",
    "Current rationale": "現在の判定根拠",
    "Select all active admin sessions": "稼働中の管理者セッションをすべて選択",
    "Recent operation receipts": "最近の操作受領",
    "Revoke admin session?": "管理者セッションを取り消しますか？",
    "Revoke selected admin sessions?":
      "選択した管理者セッションを取り消しますか？",
    "Revoke all matching admin sessions?":
      "条件に一致する管理者セッションをすべて取り消しますか？",
    "Revoke matching risk groups?":
      "条件に一致するリスクグループを取り消しますか？",
    "Revoke source group?": "発行元グループを取り消しますか？",

    Search: "検索",
    Revocation: "取り消し",
    Scope: "スコープ",
    "Sort by": "ソートキー",
    Direction: "並び順",
    "Page size": "ページあたりの件数",
    "Source sort": "ソース並び替え",
    "Source direction": "ソース並び順",
    "Source risk": "ソースリスク",
    "Source page size": "ソースのページ件数",
    "All risk": "全リスク",
    "Critical risk": "重大リスク",
    "Watch risk": "監視リスク",
    "Normal risk": "通常リスク",
    Reset: "リセット",
    "Request id": "リクエスト ID",
    "{0} per page": "1 ページあたり {0} 件",
    "Focused context": "フォーカスしたコンテキスト",
    "Focused target": "フォーカスしたターゲット",
    "Artifact summary": "アーティファクトサマリー",
    API: "API",

    // admin-session-meta.ts 標識ラベル
    Active: "アクティブ",
    Expired: "期限切れ",
    Revoked: "取り消し済み",
    Unknown: "不明",
    Logout: "ログアウト",
    "Manual revoke": "手動取り消し",
    "Refresh reuse": "トークン再使用",
    "All reasons": "すべての原因",
    "All sessions": "すべてのセッション",
    "Current only": "現在のみ",
    Created: "作成日時",
    "Refresh expiry": "リフレッシュ有効期限",
    "Last used": "最終使用",
    "Revoked at": "取り消し日時",
    Ascending: "昇順",
    Descending: "降順",
    "Active sessions": "アクティブセッション",
    "Total sessions": "全セッション数",
    "Latest used": "最終使用",
    "Latest created": "最終作成",
    "Latest revoked": "最終取り消し",
    "All risk levels": "全リスクレベル",
    "Critical only": "重大のみ",
    "Watch only": "監視のみ",
    "Normal only": "通常のみ",
    "Refresh reuse detected": "トークン再使用を検出",
    "Repeated revocations": "繰り返しの取り消し",
    "Multiple active sessions": "複数のアクティブセッション",

    // リスクしきい値ルール
    "Watch threshold": "監視しきい値",
    "Critical threshold": "重大しきい値",
    "2+ active or 2+ revoked": "アクティブまたは取り消し済みが 2 以上",
    "4+ active or any refresh reuse": "アクティブが 4 以上またはトークン再使用あり",

    // 取り消し確認モーダルの説明
    "Risk filter: {0}.": "リスクフィルター: {0}。",
    "This will revoke the current active admin session if it still matches the focused source group and current filters.":
      "現在のアクティブな管理者セッションが注目している発行元グループと現在のフィルターに一致する場合、取り消します。",
    "This will revoke the current active admin session if it still matches the current filters.":
      "現在のアクティブな管理者セッションが現在のフィルターに一致する場合、取り消します。",
    "This will revoke every active admin session in the focused source group that still matches the current filters, including sessions on other pages.":
      "現在のフィルターに一致する注目している発行元グループ内のすべてのアクティブな管理者セッションを取り消します（他のページのセッションを含む）。",
    "This will revoke every active admin session matching the current filters, including sessions on other pages.":
      "現在のフィルターに一致するすべてのアクティブな管理者セッションを取り消します（他のページのセッションを含む）。",
    "This focused source group includes the current console session. Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session, and the next admin request will need to exchange a fresh short-lived token.":
      "この注目している発行元グループには現在のコンソールセッションが含まれています。現在のリストが 1 つのセッションに絞られていても、このグループ内のすべてのアクティブセッションは管理リクエストの認可を即座に停止し、次の管理リクエストでは新しい短期トークンの交換が必要になります。",
    "Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session.":
      "現在のリストが 1 つのセッションに絞られていても、この注目している発行元グループ内のすべてのアクティブセッションは管理リクエストの認可を即座に停止します。",
    "This source group includes the current console session. Every matching active session in this source group will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "この発行元グループには現在のコンソールセッションが含まれています。このグループ内のすべての一致するアクティブセッションは管理リクエストの認可を即座に停止し、次の管理リクエストでは新しい短期トークンの交換が必要になります。",
    "Every matching active session in this source group will stop authorizing admin requests immediately.":
      "このグループ内のすべての一致するアクティブセッションは管理リクエストの認可を即座に停止します。",
    "This will revoke every active session in source groups marked {0} that still match the focused source group and current filters.":
      "{0} とマークされた発行元グループ内で注目している発行元グループと現在のフィルターに一致するすべてのアクティブセッションを取り消します。",
    "This will revoke every active session in source groups marked {0} that still match the current filters, including groups on other pages.":
      "{0} とマークされた発行元グループ内で現在のフィルターに一致するすべてのアクティブセッションを取り消します（他のページのグループを含む）。",

    // admin-sessions-page その他の文字列
    "Unknown IP": "不明な IP",
    "By unknown session": "不明なセッションによる",
    "Active threshold match": "アクティブしきい値一致",
    "Revoked threshold match": "取り消しきい値一致",
    "Refresh reuse match": "トークン再使用一致",
    "Source state changed": "ソース状態変更",
    "Refresh reuse revoke": "トークン再使用取り消し",
    "Last refreshed": "最終リフレッシュ",
    "No risk signals at this point.": "この時点でリスクシグナルはありません。",
    "Hide matched sessions": "一致セッションを折りたたむ",
    "Show matched sessions": "一致セッションを展開",
    "Matched sessions at this point": "この時点での一致セッション",
    "Revoking...": "取り消し中…",
    "Revoke matching sessions": "一致するセッションを取り消す",
    "Revoke risk groups": "リスクグループを取り消す",
    "This is the current console session. New admin requests will need to exchange a fresh short-lived token.":
      "これは現在のコンソールセッションです。新しい管理リクエストには新しい短期トークンの交換が必要です。",
    "The selected session will stop authorizing admin requests immediately.":
      "選択したセッションは管理リクエストの認可を即座に停止します。",
    "This selection includes the current console session. {0} selected session(s) will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "この選択には現在のコンソールセッションが含まれます。選択した {0} 件のセッションは管理リクエストの認可を即座に停止し、次の管理リクエストでは新しい短期トークンの交換が必要です。",
    "{0} selected session(s) will stop authorizing admin requests immediately.":
      "選択した {0} 件のセッションは管理リクエストの認可を即座に停止します。",

    // waiting-session-sync-page
    "Reviewing tasks": "タスクを確認中",
    "Review tasks": "タスクを確認",
    "Context focused": "コンテキスト絞り込み済み",
    "Focus context": "コンテキストを絞り込む",
    "Clear failed task": "失敗タスクをクリア",
    "Clearing...": "クリア中…",
    "Delete failed task {0}. This removes the durable record from the retry queue.":
      "失敗タスク {0} を削除します。リトライキューから永続レコードが削除されます。",
    "Delete all matching failed waiting sync tasks for the current task type and search filters.":
      "現在のタスクタイプと検索フィルターに一致するすべての失敗した待機同期タスクを削除します。",

    // waiting-session-sync-fragments
    "Failed {0}": "失敗 {0}",
    "Pending {0}": "待機中 {0}",
    "Running {0}": "実行中 {0}",
    "Ids {0}": "ID {0} 件",
    "Keys {0}": "キー {0} 件",
    "Targets {0}": "ターゲット {0} 件",
    "Target values: {0}": "ターゲット値: {0}",
    "World detail: {0}": "ワールド詳細: {0}",
    "Daily summary of {0} timeline point(s)": "日次サマリー（タイムライン {0} 件）",
    "Weekly summary of {0} timeline point(s)": "週次サマリー（タイムライン {0} 件）",
    "Focused source risk": "フォーカスしたソースのリスク",
    "Focused from the risk timeline so you can verify audit fields before taking session actions.":
      "セッション操作の前に監査フィールドを確認できるよう、リスクタイムラインからフォーカスしています。",
    "Export focused source snapshot": "フォーカスしたソースのスナップショットをエクスポート",
    "Revoke": "取り消す",
    "Current": "現在",
    "Revoke focused source": "フォーカスしたソースを取り消す",
    "Latest timeline snapshot": "最新タイムラインスナップショット",
    "Synced with {0}.": "{0}と同期中。",
    "{0} timeline point(s)": "タイムライン {0} 件",
    "{0} matched session(s)": "一致セッション {0} 件",
    "Issued": "発行日時",
    "Viewing source group": "発行元グループを表示",
    "Clear source focus": "ソースフォーカスをクリア",
    "Loading risk timeline...": "リスクタイムラインを読み込み中…",
    "No timeline points are available for the focused source group.":
      "フォーカスしたソースグループにタイムラインポイントがありません。",
    "View in sessions list": "セッション一覧で確認",
    "Current admin session revoked. Console will re-issue a short-lived token on the next request.":
      "現在の管理者セッションが取り消されました。コンソールは次のリクエスト時に短期トークンを再発行します。",
    "Admin session revoked.": "管理者セッションが取り消されました。",
    "No selected admin sessions were revoked. The list may already be stale.":
      "選択した管理者セッションは取り消されませんでした。リストが古い可能性があります。",
    "Revoked {0} selected session(s).": "{0} 件の選択したセッションを取り消しました。",
    "{0} session(s) were already unavailable.": "{0} 件のセッションはすでに利用不可でした。",
    "No matching active admin sessions were revoked.": "一致する有効な管理者セッションは取り消されませんでした。",
    "Revoked {0} matching active session(s).": "{0} 件の一致する有効なセッションを取り消しました。",
    "{0} session(s) were skipped because they were already unavailable.":
      "{0} 件のセッションはすでに利用不可のためスキップされました。",
    "No active admin sessions in the selected source group were revoked.":
      "選択したソースグループ内の有効な管理者セッションは取り消されませんでした。",
    "Revoked {0} matching active session(s) in the selected source group.":
      "選択したソースグループ内の {0} 件の一致する有効なセッションを取り消しました。",
    "Open task permalink": "タスクのパーマリンクを開く",
    "Open review permalink": "レビューのパーマリンクを開く",
  },
  "ko-KR": {
    "Token Usage": "토큰 사용량",
    "Token Usage Detail": "토큰 사용 상세",
    "LLM consumption and cost": "LLM 사용량과 비용",
    "Track LLM token consumption and cost across worlds, with platform-level budgets and pricing.":
      "월드 전반의 LLM 토큰 사용량과 비용을 추적하고, 플랫폼 단위 예산과 단가를 관리합니다.",
    "Drill into one world's LLM token consumption by character, model, scene, and conversation.":
      "캐릭터 / 모델 / 장면 / 대화 차원으로 단일 월드의 토큰 사용량을 분석합니다.",
    "Cloud monetization": "클라우드 수익화",
    "Last 7 days": "최근 7일",
    "Last 30 days": "최근 30일",
    "Last 90 days": "최근 90일",
    "days": "일",
    "Worlds": "월드 목록",
    "Budget": "예산",
    "Pricing": "단가",
    "Total tokens": "총 토큰 수",
    "Estimated cost": "예상 비용",
    "Request count": "요청 수",
    "Active worlds": "활성 월드",
    "Successful requests": "성공한 요청",
    "Failed requests": "실패한 요청",
    "Active characters": "활성 캐릭터",
    "Daily trends": "일일 추이",
    "Failure rate": "실패율",
    "Last synced": "마지막 동기화",
    "Search worlds": "월드 검색",
    "Sort by tokens": "토큰 기준 정렬",
    "Sort by cost": "비용 기준 정렬",
    "Sort by requests": "요청 수 기준 정렬",
    "Sort by failure rate": "실패율 기준 정렬",
    "Loading…": "불러오는 중…",
    "No data for the selected range yet.": "선택한 기간의 데이터가 아직 없습니다.",
    "Platform-default budget": "플랫폼 기본 예산",
    "Applied as the default platform budget; per-world overrides take precedence.":
      "플랫폼 기본 예산으로 적용되며, 월드별 재정의가 우선됩니다.",
    "Per-world overrides": "월드별 재정의",
    "Add per-world override": "월드 재정의 추가",
    "World ID": "월드 ID",
    "Enabled": "활성화",
    "Disabled": "비활성화",
    "Metric": "측정 항목",
    "Tokens": "토큰",
    "Cost": "비용",
    "Enforcement": "집행 방식",
    "Monitor": "모니터링만",
    "Downgrade model": "모델 다운그레이드",
    "Block": "차단",
    "Daily limit": "일일 한도",
    "Monthly limit": "월간 한도",
    "Warning ratio (0-1)": "경고 비율 (0-1)",
    "Note": "메모",
    "Optional": "선택 사항",
    "Save": "저장",
    "Pricing catalog": "단가 카탈로그",
    "Add or update pricing": "단가 추가 또는 업데이트",
    "Currency": "통화",
    "Model": "모델",
    "Input / 1k tokens": "입력 / 1k 토큰",
    "Output / 1k tokens": "출력 / 1k 토큰",
    "No pricing entries yet.": "단가 항목이 아직 없습니다.",
    "Budget saved.": "예산이 저장되었습니다.",
    "Budget removed.": "예산이 삭제되었습니다.",
    "Pricing saved.": "단가가 저장되었습니다.",
    "Pricing removed.": "단가가 삭제되었습니다.",
    "Sync from n1n.ai": "n1n.ai에서 동기화",
    "Syncing…": "동기화 중…",
    "Synced {count} models from n1n.ai":
      "n1n.ai에서 모델 {count}개를 동기화했습니다",
    "Synced {count} models, recomputed {days} days of cost.":
      "모델 {count}개 동기화, {days}일 비용 재계산 완료.",
    "Back to token usage": "토큰 사용량으로 돌아가기",
    "Breakdown": "분석",
    "By character": "캐릭터별",
    "By model": "모델별",
    "By scene": "장면별",
    "By conversation": "대화별",
    "By billing source": "과금 소스별",
    "Label": "라벨",
    "Share": "비중",
    "CLOUD_ADMIN_SECRET is required.": "CLOUD_ADMIN_SECRET을 입력하세요.",
    "CLOUD_ADMIN_SECRET is invalid.": "CLOUD_ADMIN_SECRET이 올바르지 않습니다.",
    "Cloud admin session is invalid or expired.":
      "클라우드 관리자 세션이 유효하지 않거나 만료되었습니다.",
    "Cloud admin token exchange returned an empty response.":
      "클라우드 관리자 토큰 교환이 빈 응답을 반환했습니다.",
    "Cloud admin refresh returned an empty response.":
      "클라우드 관리자 세션 갱신이 빈 응답을 반환했습니다.",
    "Cloud admin request failed.": "클라우드 관리자 요청에 실패했습니다.",
    "Network request failed.": "네트워크 요청에 실패했습니다.",
    "Cloud admin API error": "클라우드 관리자 API 오류",
    "Unknown admin sessions error.": "알 수 없는 관리자 세션 오류입니다.",
    "Clipboard copy failed in this environment.":
      "현재 환경에서는 클립보드에 복사할 수 없습니다.",

    "Downloaded admin session audit snapshot for":
      "관리자 세션 감사 스냅샷을 다운로드했습니다:",
    "Downloaded focused source snapshot for":
      "포커스 소스 스냅샷을 다운로드했습니다:",
    "Downloaded risk snapshot for": "위험 스냅샷을 다운로드했습니다:",
    "Downloaded risk groups CSV for": "위험 그룹 CSV를 다운로드했습니다:",
    "Downloaded risk sessions CSV for": "위험 세션 CSV를 다운로드했습니다:",
    "Downloaded risk timeline CSV for": "위험 타임라인 CSV를 다운로드했습니다:",
    "Downloaded daily risk timeline CSV for":
      "일별 위험 타임라인 CSV를 다운로드했습니다:",
    "Downloaded weekly risk timeline CSV for":
      "주별 위험 타임라인 CSV를 다운로드했습니다:",
    "Admin session audit snapshot is ready, but this browser could not start the download.":
      "관리자 세션 감사 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Focused source snapshot is ready, but this browser could not start the download.":
      "포커스 소스 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Risk snapshot is ready, but this browser could not start the download.":
      "위험 스냅샷은 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Risk groups CSV is ready, but this browser could not start the download.":
      "위험 그룹 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Risk sessions CSV is ready, but this browser could not start the download.":
      "위험 세션 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Risk timeline CSV is ready, but this browser could not start the download.":
      "위험 타임라인 CSV는 준비되었지만 이 브라우저에서 다운로드를 시작할 수 없습니다.",
    "Focused source snapshot is not available.":
      "포커스 소스 스냅샷을 사용할 수 없습니다.",
    "Risk timeline data is not ready for export yet.":
      "위험 타임라인 데이터를 아직 내보낼 수 없습니다.",

    "Waiting sync task replay queued.": "대기 동기화 작업 재실행이 큐에 등록되었습니다.",
    "Waiting sync task replay was skipped.":
      "대기 동기화 작업 재실행을 건너뛰었습니다.",
    "Waiting sync task cleared.": "대기 동기화 작업을 정리했습니다.",
    "Waiting sync task clear was skipped.":
      "대기 동기화 작업 정리를 건너뛰었습니다.",
    "No matching failed waiting sync tasks to replay.":
      "재실행할 일치하는 실패 대기 동기화 작업이 없습니다.",
    "No matching failed waiting sync tasks to clear.":
      "정리할 일치하는 실패 대기 동기화 작업이 없습니다.",
    "Waiting sync context CSV download failed.":
      "대기 동기화 컨텍스트 CSV 다운로드에 실패했습니다.",
    "Waiting sync focus CSV download failed.":
      "대기 동기화 포커스 CSV 다운로드에 실패했습니다.",
    "Waiting sync CSV download failed.":
      "대기 동기화 CSV 다운로드에 실패했습니다.",
    "Waiting sync context snapshot download failed.":
      "대기 동기화 컨텍스트 스냅샷 다운로드에 실패했습니다.",
    "Waiting sync focus snapshot download failed.":
      "대기 동기화 포커스 스냅샷 다운로드에 실패했습니다.",
    "Waiting sync snapshot download failed.":
      "대기 동기화 스냅샷 다운로드에 실패했습니다.",
    "Waiting sync context groups CSV download failed.":
      "대기 동기화 컨텍스트 그룹 CSV 다운로드에 실패했습니다.",
    "Waiting sync context groups snapshot download failed.":
      "대기 동기화 컨텍스트 그룹 스냅샷 다운로드에 실패했습니다.",
    "Waiting sync permalink copied.": "대기 동기화 고정 링크를 복사했습니다.",
    "Waiting sync review context copied.":
      "대기 동기화 검토 컨텍스트를 복사했습니다.",
    "Waiting sync task context copied.":
      "대기 동기화 작업 컨텍스트를 복사했습니다.",
    "Waiting sync permalink copy failed.":
      "대기 동기화 고정 링크 복사에 실패했습니다.",
    "Waiting sync review context copy failed.":
      "대기 동기화 검토 컨텍스트 복사에 실패했습니다.",
    "Waiting sync task context copy failed.":
      "대기 동기화 작업 컨텍스트 복사에 실패했습니다.",

    "Switch status to All or Failed before running batch failed-task actions.":
      "실패 작업 일괄 작업을 실행하기 전에 상태를 All 또는 Failed로 전환하세요.",
    "All failed tasks across every page.": "모든 페이지의 전체 실패 작업.",
    "Focus snapshot appears when the current query exactly matches a visible context or target.":
      "현재 검색어가 표시된 컨텍스트 또는 대상과 정확히 일치하면 포커스 스냅샷이 표시됩니다.",
    "Add a context or target query to export a tighter investigation snapshot.":
      "더 좁은 조사 스냅샷을 내보내려면 컨텍스트 또는 대상 검색어를 입력하세요.",

    "Refresh world": "월드 새로고침",
    "Refresh phone": "전화번호 새로고침",
    "Invalidate phone": "전화번호 무효화",
    Failed: "실패",
    Pending: "대기 중",
    Running: "실행 중",
    "Not available": "사용 불가",
    None: "없음",
    All: "전체",
    "Task key": "작업 키",
    "Task type": "작업 유형",
    Status: "상태",
    Target: "대상",
    Context: "컨텍스트",
    Attempt: "시도",
    Available: "실행 가능 시간",
    Updated: "업데이트 시간",
    Finished: "완료 시간",
    "Lease owner": "리스 소유자",
    "Last error": "최근 오류",
    "Review permalink": "검토 고정 링크",
    "Requests path": "요청 경로",
    "Worlds path": "월드 경로",
    "World detail": "월드 상세",
    "Visible tasks": "표시 작업",
    "Task types": "작업 유형",
    "Latest update": "최근 업데이트",
    "Focus path": "포커스 경로",
    "Task ids": "작업 ID",
    "Task keys": "작업 키",
    "Target values": "대상 값",
    "Waiting sync task action failed.":
      "대기 동기화 작업 동작에 실패했습니다.",
    "Admin sessions permalink copied.":
      "관리자 세션 고정 링크를 복사했습니다.",
    "Worlds permalink copied.": "월드 목록 고정 링크를 복사했습니다.",
    sourceKey: "소스 키",
    riskLevel: "위험 수준",
    riskSignals: "위험 신호",
    issuedFromIp: "발급 IP",
    issuedUserAgent: "발급 클라이언트",
    totalSessions: "전체 세션 수",
    activeSessions: "활성 세션 수",
    expiredSessions: "만료 세션 수",
    revokedSessions: "취소 세션 수",
    refreshTokenReuseRevocations: "갱신 토큰 재사용 취소 수",
    currentSessions: "현재 세션 수",
    latestCreatedAt: "최근 생성 시간",
    latestLastUsedAt: "최근 사용 시간",
    latestRevokedAt: "최근 취소 시간",
    sessionId: "세션 ID",
    status: "상태",
    isCurrent: "현재 세션 여부",
    expiresAt: "만료 시간",
    lastUsedAt: "최근 사용 시간",
    lastUsedIp: "최근 사용 IP",
    lastUsedUserAgent: "최근 사용 클라이언트",
    lastRefreshedAt: "최근 갱신 시간",
    revokedAt: "취소 시간",
    revokedBySessionId: "취소한 세션 ID",
    revocationReason: "취소 이유",
    createdAt: "생성 시간",
    updatedAt: "업데이트 시간",
    timestamp: "타임스탬프",
    eventSummary: "이벤트 요약",
    day: "날짜",
    weekStart: "주 시작",
    weekEnd: "주 종료",
    pointCount: "지점 수",
    id: "ID",
    taskKey: "작업 키",
    taskType: "작업 유형",
    attempt: "시도",
    maxAttempts: "최대 시도",
    targetValue: "대상 값",
    context: "컨텍스트",
    availableAt: "실행 가능 시간",
    finishedAt: "완료 시간",
    lastError: "최근 오류",
    leaseOwner: "리스 소유자",
    requestsPath: "요청 경로",
    worldsPath: "월드 경로",
    worldDetailPath: "월드 상세 경로",
    total: "전체",
    failed: "실패",
    pending: "대기 중",
    running: "실행 중",
    taskTypes: "작업 유형",
    latestUpdatedAt: "최근 업데이트 시간",
    refreshWorldTarget: "월드 새로고침 대상",
    focusPath: "포커스 경로",
    taskIds: "작업 ID",
    taskKeys: "작업 키",
    targetValues: "대상 값",

    Feedbacks: "피드백",
    "User-submitted reports": "사용자 제보",
    "User-submitted desktop and web feedback":
      "사용자가 제출한 데스크톱·웹 피드백",
    "Review user-submitted desktop and web feedback, triage status, and assign handler notes.":
      "데스크톱·웹 사용자 피드백을 확인하고 상태를 전환하며 처리 메모를 작성합니다.",
    "Loading feedbacks...": "피드백을 불러오는 중…",
    "Failed to load feedbacks.": "피드백을 불러오지 못했습니다.",
    "No feedback matched the current filters.":
      "현재 필터에 해당하는 피드백이 없습니다.",
    "Search title, detail, owner, phone, email":
      "제목·본문·월드 오너·전화번호·이메일 검색",
    "All statuses": "모든 상태",
    "All priorities": "모든 우선순위",
    "All categories": "모든 카테고리",
    "All sources": "모든 출처",
    "High priority active": "미완료 높은 우선순위",
    Page: "페이지",
    entries: "건",
    Previous: "이전",
    Next: "다음",
    "First page": "처음",
    "Last page": "마지막",
    "Jump to page": "페이지 이동",
    Go: "이동",
    "This page is empty. Use the pager to jump back.":
      "이 페이지에는 데이터가 없습니다. 페이지네이션으로 이전 페이지로 돌아가세요.",
    "{total} total": "총 {total}개",
    "Handler note": "처리 메모",
    "Internal note for this feedback. Saved when you change status.":
      "이 피드백에 대한 내부 메모입니다. 상태 변경 시 함께 저장됩니다.",
    Detail: "상세 내용",
    Reproduction: "재현 절차",
    Expected: "기대 결과",
    "Diagnostic summary": "진단 요약",
    Phone: "전화번호",
    Email: "이메일",
    Registered: "가입 시각",
    "Registration IP": "가입 IP",
    "Last login": "마지막 로그인 시각",
    "Last login IP": "현재 IP",
    "Last chat": "마지막 발언 시각", // i18n-ignore-line: runtime dict value
    "Real users": "실제 사용자 수(테스트 제외)", // i18n-ignore-line: runtime dict value
    "Member users": "유효 구독 사용자 수", // i18n-ignore-line: runtime dict value
    Device: "마지막 로그인 단말",
    "Region distribution": "지역 분포",
    "Device distribution": "단말 분포",
    "No data yet.": "데이터가 없습니다.",
    "Sort by last login": "마지막 로그인 시각으로 정렬",
    "Last user message": "마지막 사용자 메시지 시각",
    "Sort by last user message": "마지막 사용자 메시지 시각으로 정렬",
    "Membership expires": "멤버십 만료 시각",
    "Membership registered": "멤버십 가입 시각",
    "Sort by membership registered": "멤버십 가입 시각으로 정렬",
    "Sort by membership expires": "멤버십 만료 시각으로 정렬",
    Owner: "월드 오너",
    "Owner signature": "오너 서명",
    "App platform": "실행 플랫폼",
    "API base url": "API 기본 URL",
    "Submitter IP": "제출자 IP",
    "User agent": "User-Agent",
    "Client record id": "클라이언트 기록 ID",
    "Client submitted at": "클라이언트 제출 시각",
    "Created at": "생성 시각",
    "Handled at": "처리 시각",
    New: "신규",
    "In progress": "처리 중",
    Resolved: "해결됨",
    Archived: "보관됨",
    new: "신규",
    in_progress: "처리 중",
    resolved: "해결됨",
    archived: "보관됨",
    High: "높음",
    Medium: "보통",
    Low: "낮음",
    high: "높음",
    medium: "보통",
    low: "낮음",
    Bug: "기능 결함",
    Interaction: "사용성",
    Performance: "성능",
    Content: "표현 정합성",
    Feature: "기능 제안",
    bug: "기능 결함",
    interaction: "사용성",
    performance: "성능",
    content: "표현 정합성",
    feature: "기능 제안",
    Desktop: "데스크톱",
    Web: "웹",
    Mobile: "모바일",
    WeChat: "WeChat",
    desktop: "데스크톱",
    web: "웹",
    mobile: "모바일",
    wechat: "WeChat",
    "(no phone)": "(전화번호 없음)",
    "Code:": "초대 코드:",
    "Status:": "상태:",
    "IP:": "IP:",
    "Device:": "디바이스:",
    "Created at:": "생성 시각:",
    "Reason:": "사유:",
    "Account:": "계정:",
    "Subscription:": "구독:",
    "Current plan:": "현재 요금제:",
    "Expires at:": "만료 시각:",
    "Invite code:": "초대 코드:",
    "World status:": "월드 상태:",
    "World:": "월드:",
    Overview: "개요",
    Events: "이벤트",
    Funnel: "퍼널",
    "API health": "API 상태",
    Errors: "오류",
    "Client telemetry, PV/UV, API health and frontend errors.":
      "클라이언트 텔레메트리(PV/UV), API 상태 및 프런트엔드 오류.",
    "Page views (by app)": "페이지 조회수(앱별)",
    "Page views": "페이지 조회수",
    "Failed to load overview": "개요를 불러오지 못했습니다",
    "Failed to load line chart": "라인 차트를 불러오지 못했습니다",
    "Failed to load events": "이벤트를 불러오지 못했습니다",
    "Failed to load funnel": "퍼널을 불러오지 못했습니다",
    "Failed to load API health": "API 상태를 불러오지 못했습니다",
    "Failed to load error list": "오류 목록을 불러오지 못했습니다",
    "Page views PV": "페이지 조회수 PV",
    "Unique visitors UV": "순방문자 UV",
    Sessions: "세션 수",
    "Frontend errors": "프런트엔드 오류",
    "Average session duration": "평균 세션 시간",
    "24 hours": "24시간",
    "7 days": "7일",
    "30 days": "30일",
    "All apps": "모든 앱",
    "Comma-separated event names (in order)":
      "쉼표로 구분된 이벤트 이름(순서대로)",
    "Apply funnel": "퍼널 적용",
    "Funnel is empty. Please enter steps first.":
      "퍼널이 비어 있습니다. 먼저 단계를 입력하세요.",
    "No events in the current range.": "현재 범위에 이벤트가 없습니다.",
    "No API telemetry in the current range.":
      "현재 범위에 API 텔레메트리가 없습니다.",
    "No error events in the current range.":
      "현재 범위에 오류 이벤트가 없습니다.",
    "Collapse stack": "스택 접기",
    "Expand stack": "스택 펼치기",
    Start: "시작점",
    Telemetry: "텔레메트리",
    Path: "경로",
    Calls: "호출 수",
    "MiniMax calls & rate-limit (hourly)": "MiniMax 호출 및 레이트 리밋(시간별)",
    "RPM/Concurrency limited": "RPM/동시성 제한",
    "Quota exhausted": "쿼터 소진",
    "Failed to load MiniMax usage": "MiniMax 사용량 로드 실패",
    Success: "성공률",
    p50: "p50",
    p95: "p95",
    Event: "이벤트",
    Type: "유형",
    Count: "건수",
    "Unique users": "순 사용자",
    "Unique anons": "순 익명",
    World: "월드",
    "All worlds": "모든 월드",
    "Active users": "활성 사용자",
    "Recent activity": "최근 활동",
    "Top worlds by activity": "활동량 상위 월드",
    "Page views (this world)": "페이지 뷰(이 월드)",
    "Failed to load world ranking": "월드 순위 로드 실패",
    "No world activity in the current range.":
      "현재 범위에 월드 활동이 없습니다.",
    "Page views, active users and top operations captured for this world by client telemetry.":
      "클라이언트 텔레메트리로 수집한 이 월드의 페이지 뷰, 활성 사용자, 상위 작업.",

    Confirm: "확인",
    Cancel: "취소",
    Close: "닫기",
    "Working...": "처리 중…",
    Unleased: "리스 미보유",
    "Delayed jobs in filter": "현재 필터에서 지연된 작업",
    "Inspect provisioning, resume, suspend, and reconcile work for the selected world.":
      "선택한 월드의 프로비저닝, 재개, 일시 중지 및 정합성 작업을 확인하세요.",
    "Inspect provisioning, resume, suspend, and reconcile work across the managed world fleet.":
      "관리되는 월드 플릿 전체의 프로비저닝, 재개, 일시 중지 및 정합성 작업을 확인하세요.",
    "Existing bootstrap packages and runtime env overlays will become stale until operators redeploy the updated token.":
      "기존 부트스트랩 패키지와 런타임 환경 오버레이는 운영자가 새 토큰을 다시 배포하기 전까지 오래된 상태로 남습니다.",
    "Rotate token": "토큰 교체",
    "Rotating...": "교체 중…",
    "System ready": "시스템 정상",
    "System warning": "시스템 경고",

    App: "앱",
    Site: "사이트",
    Wiki: "Wiki",
    "queue: all": "큐: 전체",
    "queue: running": "큐: 실행 중",
    "queue: lease expired": "큐: 리스 만료",
    "queue: delayed": "큐: 지연",
    "Lease expired": "리스 만료",
    Delayed: "지연",
    Other: "기타",
    "Session id, IP, client, revoker":
      "세션 ID, IP, 클라이언트, 취소자",
    "Waiting sync status": "대기 동기화 상태",
    "Waiting sync task type": "대기 동기화 작업 유형",
    "Waiting sync search": "대기 동기화 검색",
    "task key, target, context, or error":
      "작업 키, 대상, 컨텍스트 또는 오류",
    "Waiting sync page size": "대기 동기화 페이지 크기",
    "Context task review": "컨텍스트 작업 검토",
    "Recent task receipts": "최근 작업 영수증",

    "Admin sessions": "관리자 세션",
    "Review live admin sessions, inspect where they were issued from, filter by revocation path, and page through longer audit history.":
      "활성 관리자 세션을 검토하고 발급 위치를 조사하며 취소 경로별로 필터링하고 더 긴 감사 이력을 페이지로 탐색합니다.",
    "Source groups": "발급 그룹",
    "Aggregate sessions by issue IP and client under the current filters, then revoke an entire source in one action.":
      "현재 필터에서 발급 IP와 클라이언트별로 세션을 집계하고 한 번의 동작으로 발급원 전체를 취소합니다.",
    "Risk timeline": "위험 타임라인",
    "Derived from session issue, expiry, and revoke events inside the focused source group under the current filters.":
      "현재 필터에서 주목 중인 발급 그룹 내의 세션 발급, 만료, 취소 이벤트에서 도출됩니다.",
    "Current rationale": "현재 근거",
    "Select all active admin sessions": "활성 관리자 세션 모두 선택",
    "Recent operation receipts": "최근 작업 영수증",
    "Revoke admin session?": "관리자 세션을 취소할까요?",
    "Revoke selected admin sessions?": "선택한 관리자 세션을 취소할까요?",
    "Revoke all matching admin sessions?":
      "일치하는 모든 관리자 세션을 취소할까요?",
    "Revoke matching risk groups?": "일치하는 위험 그룹을 취소할까요?",
    "Revoke source group?": "발급 그룹을 취소할까요?",

    Search: "검색",
    Revocation: "취소",
    Scope: "범위",
    "Sort by": "정렬 기준",
    Direction: "방향",
    "Page size": "페이지당 항목 수",
    "Source sort": "출처 정렬",
    "Source direction": "출처 방향",
    "Source risk": "출처 위험도",
    "Source page size": "출처 페이지 항목 수",
    "All risk": "전체 위험도",
    "Critical risk": "심각 위험",
    "Watch risk": "관찰 위험",
    "Normal risk": "일반 위험",
    Reset: "초기화",
    "Request id": "요청 ID",
    "{0} per page": "페이지당 {0}개",
    "Focused context": "집중된 컨텍스트",
    "Focused target": "집중된 대상",
    "Artifact summary": "아티팩트 요약",
    API: "API",

    // admin-session-meta.ts 레이블
    Active: "활성",
    Expired: "만료됨",
    Revoked: "취소됨",
    Unknown: "알 수 없음",
    Logout: "로그아웃",
    "Manual revoke": "수동 취소",
    "Refresh reuse": "토큰 재사용",
    "All reasons": "모든 이유",
    "All sessions": "모든 세션",
    "Current only": "현재만",
    Created: "생성",
    "Refresh expiry": "리프레시 만료",
    "Last used": "최근 사용",
    "Revoked at": "취소 시간",
    Ascending: "오름차순",
    Descending: "내림차순",
    "Active sessions": "활성 세션",
    "Total sessions": "전체 세션",
    "Latest used": "최근 사용",
    "Latest created": "최근 생성",
    "Latest revoked": "최근 취소",
    "All risk levels": "전체 위험 수준",
    "Critical only": "심각만",
    "Watch only": "관찰만",
    "Normal only": "일반만",
    "Refresh reuse detected": "토큰 재사용 감지됨",
    "Repeated revocations": "반복 취소",
    "Multiple active sessions": "다수의 활성 세션",

    // 위험 임계값 규칙
    "Watch threshold": "관찰 임계값",
    "Critical threshold": "심각 임계값",
    "2+ active or 2+ revoked": "활성 또는 취소 2건 이상",
    "4+ active or any refresh reuse": "활성 4건 이상 또는 토큰 재사용",

    // 취소 확인 모달 설명
    "Risk filter: {0}.": "위험 필터: {0}.",
    "This will revoke the current active admin session if it still matches the focused source group and current filters.":
      "현재 활성 관리자 세션이 집중된 발급 그룹과 현재 필터와 일치하면 취소합니다.",
    "This will revoke the current active admin session if it still matches the current filters.":
      "현재 활성 관리자 세션이 현재 필터와 일치하면 취소합니다.",
    "This will revoke every active admin session in the focused source group that still matches the current filters, including sessions on other pages.":
      "집중된 발급 그룹에서 현재 필터와 일치하는 모든 활성 관리자 세션을 취소합니다(다른 페이지의 세션 포함).",
    "This will revoke every active admin session matching the current filters, including sessions on other pages.":
      "현재 필터와 일치하는 모든 활성 관리자 세션을 취소합니다(다른 페이지의 세션 포함).",
    "This focused source group includes the current console session. Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session, and the next admin request will need to exchange a fresh short-lived token.":
      "이 집중된 발급 그룹에는 현재 콘솔 세션이 포함되어 있습니다. 현재 목록이 하나의 세션으로 좁혀져 있더라도 이 그룹의 모든 활성 세션은 즉시 관리자 요청 인증을 중단하며, 다음 관리자 요청은 새 단기 토큰 교환이 필요합니다.",
    "Every active session in this focused source group will stop authorizing admin requests immediately, even if the current list is narrowed to one session.":
      "현재 목록이 하나의 세션으로 좁혀져 있더라도 이 집중된 발급 그룹의 모든 활성 세션은 즉시 관리자 요청 인증을 중단합니다.",
    "This source group includes the current console session. Every matching active session in this source group will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "이 발급 그룹에는 현재 콘솔 세션이 포함되어 있습니다. 이 그룹의 일치하는 모든 활성 세션은 즉시 관리자 요청 인증을 중단하며, 다음 관리자 요청은 새 단기 토큰 교환이 필요합니다.",
    "Every matching active session in this source group will stop authorizing admin requests immediately.":
      "이 그룹의 일치하는 모든 활성 세션은 즉시 관리자 요청 인증을 중단합니다.",
    "This will revoke every active session in source groups marked {0} that still match the focused source group and current filters.":
      "{0}으로 표시된 발급 그룹 중 집중된 발급 그룹과 현재 필터와 일치하는 모든 활성 세션을 취소합니다.",
    "This will revoke every active session in source groups marked {0} that still match the current filters, including groups on other pages.":
      "{0}으로 표시된 발급 그룹 중 현재 필터와 일치하는 모든 활성 세션을 취소합니다(다른 페이지의 그룹 포함).",

    // admin-sessions-page 기타 문자열
    "Unknown IP": "알 수 없는 IP",
    "By unknown session": "알 수 없는 세션에 의해",
    "Active threshold match": "활성 임계값 일치",
    "Revoked threshold match": "취소 임계값 일치",
    "Refresh reuse match": "토큰 재사용 일치",
    "Source state changed": "소스 상태 변경",
    "Refresh reuse revoke": "토큰 재사용 취소",
    "Last refreshed": "마지막 갱신",
    "No risk signals at this point.": "이 시점에 위험 신호가 없습니다.",
    "Hide matched sessions": "일치 세션 숨기기",
    "Show matched sessions": "일치 세션 보기",
    "Matched sessions at this point": "이 시점의 일치 세션",
    "Revoking...": "취소 중…",
    "Revoke matching sessions": "일치 세션 취소",
    "Revoke risk groups": "위험 그룹 취소",
    "This is the current console session. New admin requests will need to exchange a fresh short-lived token.":
      "이것은 현재 콘솔 세션입니다. 새 관리자 요청은 새 단기 토큰 교환이 필요합니다.",
    "The selected session will stop authorizing admin requests immediately.":
      "선택한 세션은 즉시 관리자 요청 인증을 중단합니다.",
    "This selection includes the current console session. {0} selected session(s) will stop authorizing admin requests immediately, and the next admin request will need to exchange a fresh short-lived token.":
      "이 선택에는 현재 콘솔 세션이 포함됩니다. 선택한 {0}개의 세션은 즉시 관리자 요청 인증을 중단하며, 다음 관리자 요청은 새 단기 토큰 교환이 필요합니다.",
    "{0} selected session(s) will stop authorizing admin requests immediately.":
      "선택한 {0}개의 세션은 즉시 관리자 요청 인증을 중단합니다.",

    // waiting-session-sync-page
    "Reviewing tasks": "작업 검토 중",
    "Review tasks": "작업 검토",
    "Context focused": "컨텍스트 집중됨",
    "Focus context": "컨텍스트 집중",
    "Clear failed task": "실패 작업 정리",
    "Clearing...": "정리 중…",
    "Delete failed task {0}. This removes the durable record from the retry queue.":
      "실패 작업 {0}을 삭제합니다. 재시도 큐에서 영구 기록이 제거됩니다.",
    "Delete all matching failed waiting sync tasks for the current task type and search filters.":
      "현재 작업 유형 및 검색 필터와 일치하는 모든 실패한 대기 동기화 작업을 삭제합니다.",

    // waiting-session-sync-fragments
    "Failed {0}": "실패 {0}",
    "Pending {0}": "대기 중 {0}",
    "Running {0}": "실행 중 {0}",
    "Ids {0}": "ID {0}건",
    "Keys {0}": "키 {0}건",
    "Targets {0}": "타겟 {0}건",
    "Target values: {0}": "타겟 값: {0}",
    "World detail: {0}": "월드 상세: {0}",
    "Daily summary of {0} timeline point(s)": "일별 요약 (타임라인 {0}건)",
    "Weekly summary of {0} timeline point(s)": "주별 요약 (타임라인 {0}건)",
    "Focused source risk": "포커스된 소스 위험",
    "Focused from the risk timeline so you can verify audit fields before taking session actions.":
      "세션 작업 전 감사 필드를 확인할 수 있도록 위험 타임라인에서 포커스되었습니다.",
    "Export focused source snapshot": "포커스된 소스 스냅샷 내보내기",
    "Revoke": "취소",
    "Current": "현재",
    "Revoke focused source": "포커스된 소스 취소",
    "Latest timeline snapshot": "최신 타임라인 스냅샷",
    "Synced with {0}.": "{0}과 동기화됨.",
    "{0} timeline point(s)": "타임라인 {0}건",
    "{0} matched session(s)": "일치 세션 {0}건",
    "Issued": "발급 시간",
    "Viewing source group": "소스 그룹 보기",
    "Clear source focus": "소스 포커스 초기화",
    "Loading risk timeline...": "위험 타임라인 로딩 중…",
    "No timeline points are available for the focused source group.":
      "포커스된 소스 그룹에 사용 가능한 타임라인 포인트가 없습니다.",
    "View in sessions list": "세션 목록에서 보기",
    "Current admin session revoked. Console will re-issue a short-lived token on the next request.":
      "현재 관리자 세션이 취소되었습니다. 콘솔은 다음 요청 시 단기 토큰을 재발급합니다.",
    "Admin session revoked.": "관리자 세션이 취소되었습니다.",
    "No selected admin sessions were revoked. The list may already be stale.":
      "선택한 관리자 세션이 취소되지 않았습니다. 목록이 이미 오래되었을 수 있습니다.",
    "Revoked {0} selected session(s).": "선택한 세션 {0}건이 취소되었습니다.",
    "{0} session(s) were already unavailable.": "{0}건의 세션이 이미 사용 불가 상태였습니다.",
    "No matching active admin sessions were revoked.": "일치하는 활성 관리자 세션이 취소되지 않았습니다.",
    "Revoked {0} matching active session(s).": "일치하는 활성 세션 {0}건이 취소되었습니다.",
    "{0} session(s) were skipped because they were already unavailable.":
      "{0}건의 세션이 이미 사용 불가 상태여서 건너뛰었습니다.",
    "No active admin sessions in the selected source group were revoked.":
      "선택한 소스 그룹의 활성 관리자 세션이 취소되지 않았습니다.",
    "Revoked {0} matching active session(s) in the selected source group.":
      "선택한 소스 그룹의 일치하는 활성 세션 {0}건이 취소되었습니다.",
    "Open task permalink": "작업 영구 링크 열기",
    "Open review permalink": "검토 영구 링크 열기",
  },
};
// i18n-ignore-end

export function getCurrentCloudConsoleLocale() {
  return getActiveLocale();
}

export function resolveCloudConsoleLocale(
  locale?: string | null,
  fallback: CloudConsoleLocale = CLOUD_CONSOLE_ENGLISH_LOCALE,
): CloudConsoleLocale {
  return resolveSupportedLocale(locale) ?? fallback;
}

export function translateCloudConsoleText(
  value: string,
  locale?: string | null,
) {
  const resolvedLocale = resolveCloudConsoleLocale(locale);
  if (resolvedLocale === CLOUD_CONSOLE_ENGLISH_LOCALE) {
    return value;
  }

  return (
    cloudConsoleRuntimeText[resolvedLocale]?.[value] ??
    getSurfaceTextDictionary("cloud-console", resolvedLocale).get(value) ??
    value
  );
}

export function translateCloudConsoleTextForActiveLocale(value: string) {
  return translateCloudConsoleText(value, getCurrentCloudConsoleLocale());
}

export function useCloudConsoleText() {
  const { locale } = useAppLocale();
  return useCallback(
    (value: string) => translateCloudConsoleText(value, locale),
    [locale],
  );
}

export function selectCloudConsoleText(
  locale: string | null | undefined,
  messages: LocalizedTextSet,
) {
  return messages[resolveCloudConsoleLocale(locale)] ?? messages["en-US"];
}

export function translateCloudConsoleCsvRow(
  row: readonly string[],
  locale?: string | null,
) {
  return row.map((value) => translateCloudConsoleText(value, locale));
}

// i18n-ignore-start: Dynamic formatter variants are localized at runtime.
export function formatCloudConsoleUnableToReachApiMessage({
  apiBase,
  detail,
  locale,
}: {
  apiBase: string;
  detail: string;
  locale?: string | null;
}) {
  return selectCloudConsoleText(locale, {
    "en-US": `Unable to reach the cloud admin API at ${apiBase}. ${detail}`,
    "zh-CN": `无法连接云世界管理 API（${apiBase}）。${detail}`,
    "ja-JP": `クラウド管理 API（${apiBase}）に接続できません。${detail}`,
    "ko-KR": `클라우드 관리자 API(${apiBase})에 연결할 수 없습니다. ${detail}`,
  });
}

export function formatCloudConsoleApiStatusError(
  status: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Cloud admin API error ${status}`,
    "zh-CN": `云世界管理 API 错误 ${status}`,
    "ja-JP": `クラウド管理 API エラー ${status}`,
    "ko-KR": `클라우드 관리자 API 오류 ${status}`,
  });
}

export function formatCloudConsolePageOfTotal(
  page: number,
  totalPages: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Page ${page} / ${totalPages}`,
    "zh-CN": `第 ${page} 页 / 共 ${totalPages} 页`,
    "ja-JP": `${page} / ${totalPages} ページ`,
    "ko-KR": `${page} / ${totalPages} 페이지`,
  });
}

export function formatCloudConsoleVisibleSessionsRange(
  start: number,
  end: number,
  total: number,
  locale?: string | null,
) {
  if (total === 0 || end < start) {
    return selectCloudConsoleText(locale, {
      "en-US": "Showing 0 sessions",
      "zh-CN": "暂无会话",
      "ja-JP": "セッションなし",
      "ko-KR": "세션 없음",
    });
  }
  return selectCloudConsoleText(locale, {
    "en-US": `Showing ${start}-${end} of ${total}`,
    "zh-CN": `显示第 ${start}-${end} 条，共 ${total} 条`,
    "ja-JP": `${start}-${end} / ${total} 件を表示`,
    "ko-KR": `${start}-${end} / 총 ${total}건 표시`,
  });
}

export function formatCloudConsoleVisibleGroupsRange(
  start: number,
  end: number,
  total: number,
  locale?: string | null,
) {
  if (total === 0 || end < start) {
    return selectCloudConsoleText(locale, {
      "en-US": "Showing 0 groups",
      "zh-CN": "暂无分组",
      "ja-JP": "グループなし",
      "ko-KR": "그룹 없음",
    });
  }
  return selectCloudConsoleText(locale, {
    "en-US": `Showing ${start}-${end} of ${total} groups`,
    "zh-CN": `显示第 ${start}-${end} 组，共 ${total} 组`,
    "ja-JP": `${start}-${end} / ${total} グループを表示`,
    "ko-KR": `${start}-${end} / 총 ${total}개 그룹 표시`,
  });
}

export function formatCloudConsoleVisibleJobsRange(
  start: number,
  end: number,
  total: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Showing ${start}-${end} of ${total} jobs.`,
    "zh-CN": `显示第 ${start}-${end} 项，共 ${total} 项任务。`,
    "ja-JP": `${start}-${end} / ${total} 件のジョブを表示`,
    "ko-KR": `${start}-${end} / 총 ${total}개 작업 표시`,
  });
}

export function formatCloudConsolePageSize(
  size: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `page size: ${size}`,
    "zh-CN": `每页 ${size} 条`,
    "ja-JP": `1ページ ${size} 件`,
    "ko-KR": `페이지당 ${size}건`,
  });
}

export function formatCloudConsoleActiveVersion(
  version: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Active version ${version}`,
    "zh-CN": `当前版本 ${version}`,
    "ja-JP": `現行バージョン ${version}`,
    "ko-KR": `현재 버전 ${version}`,
  });
}

export function formatCloudConsoleVersionShort(
  version: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `v${version}`,
    "zh-CN": `v${version}`,
    "ja-JP": `v${version}`,
    "ko-KR": `v${version}`,
  });
}

export function formatCloudConsolePayeeProfileCount(
  count: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `${count} payee profiles`,
    "zh-CN": `${count} 个收益人档案`,
    "ja-JP": `${count} 件の受取人プロファイル`,
    "ko-KR": `${count}개 수취인 프로필`,
  });
}

export function formatCloudConsoleAllocationCount(
  count: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `${count} allocations`,
    "zh-CN": `${count} 条分配记录`,
    "ja-JP": `${count} 件の割当`,
    "ko-KR": `${count}건 할당`,
  });
}

export function formatCloudConsoleSettlementGenerated(
  batchId: string,
  amount: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Settlement ${batchId} generated for ${amount}.`,
    "zh-CN": `已生成结算 ${batchId}，金额 ${amount}。`,
    "ja-JP": `決済 ${batchId} を金額 ${amount} で生成しました。`,
    "ko-KR": `정산 ${batchId}을(를) 금액 ${amount}(으)로 생성했습니다.`,
  });
}

export function formatCloudConsoleJobLeaseRemaining(
  duration: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `remaining ${duration}`,
    "zh-CN": `剩余 ${duration}`,
    "ja-JP": `残り ${duration}`,
    "ko-KR": `남은 시간 ${duration}`,
  });
}

export function formatCloudConsoleJobLeaseExpires(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `expires ${date}`,
    "zh-CN": `到期 ${date}`,
    "ja-JP": `期限 ${date}`,
    "ko-KR": `만료 ${date}`,
  });
}

export function formatCloudConsoleJobLeaseAvailable(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `available ${date}`,
    "zh-CN": `可执行 ${date}`,
    "ja-JP": `実行可能 ${date}`,
    "ko-KR": `실행 가능 ${date}`,
  });
}

export function formatCloudConsoleLastGeneratedAt(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Last generated ${date}`,
    "zh-CN": `最近生成于 ${date}`,
    "ja-JP": `最終生成 ${date}`,
    "ko-KR": `최근 생성 ${date}`,
  });
}

export function formatCloudConsoleProviderWorldsCount(
  count: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `${count} worlds`,
    "zh-CN": `${count} 个世界`,
    "ja-JP": `${count} ワールド`,
    "ko-KR": `${count}개 월드`,
  });
}

export function formatCloudConsoleProviderRunningError(
  running: number,
  errorCount: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Running ${running} · Error ${errorCount}`,
    "zh-CN": `运行中 ${running} · 错误 ${errorCount}`,
    "ja-JP": `実行中 ${running} · エラー ${errorCount}`,
    "ko-KR": `실행 중 ${running} · 오류 ${errorCount}`,
  });
}

export function formatCloudConsoleJobsGroupCount(
  count: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `${count} jobs`,
    "zh-CN": `${count} 项任务`,
    "ja-JP": `${count} 件のジョブ`,
    "ko-KR": `${count}개 작업`,
  });
}

export function formatCloudConsoleProviderLeaseLabel(
  owner: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Lease ${owner}`,
    "zh-CN": `租约 ${owner}`,
    "ja-JP": `リース ${owner}`,
    "ko-KR": `리스 ${owner}`,
  });
}

export function formatCloudConsoleAvailableAtLine(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Available: ${date}`,
    "zh-CN": `可执行时间：${date}`,
    "ja-JP": `実行可能：${date}`,
    "ko-KR": `실행 가능: ${date}`,
  });
}

export function formatCloudConsoleUpdatedAtLine(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Updated: ${date}`,
    "zh-CN": `更新时间：${date}`,
    "ja-JP": `更新：${date}`,
    "ko-KR": `업데이트: ${date}`,
  });
}

export function formatCloudConsoleFinishedAtLine(
  date: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Finished: ${date}`,
    "zh-CN": `完成时间：${date}`,
    "ja-JP": `完了：${date}`,
    "ko-KR": `완료: ${date}`,
  });
}

export function formatCloudConsoleReceiptCountSummary(
  visible: number,
  limit: number,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Showing the latest ${visible} of up to ${limit} receipt(s) for this review task.`,
    "zh-CN": `正在显示该复核任务的最近 ${visible} / 共 ${limit} 条回执。`,
    "ja-JP": `このレビュータスクの最新 ${visible} / 最大 ${limit} 件の受領を表示中。`,
    "ko-KR": `이 검토 작업에 대해 최신 ${visible} / 최대 ${limit}개 영수증을 표시 중.`,
  });
}

export function formatCloudConsoleFunnelFromPrev(
  percent: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `From previous step ${percent}%`,
    "zh-CN": `从上一步 ${percent}%`,
    "ja-JP": `前ステップから ${percent}%`,
    "ko-KR": `이전 단계에서 ${percent}%`,
  });
}

export function formatCloudConsoleFunnelOverall(
  percent: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Overall ${percent}%`,
    "zh-CN": `整体 ${percent}%`,
    "ja-JP": `全体 ${percent}%`,
    "ko-KR": `전체 ${percent}%`,
  });
}

export function formatCloudConsoleSuspendWorldTitle(
  worldName: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Suspend ${worldName}?`,
    "zh-CN": `暂停世界 ${worldName}？`,
    "ja-JP": `ワールド ${worldName} を一時停止しますか？`,
    "ko-KR": `월드 ${worldName}을(를) 일시 중지할까요?`,
  });
}

export function formatCloudConsoleRetryWorldRecoveryTitle(
  worldName: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `Retry recovery for ${worldName}?`,
    "zh-CN": `为世界 ${worldName} 重试恢复？`,
    "ja-JP": `ワールド ${worldName} の復旧を再試行しますか？`,
    "ko-KR": `월드 ${worldName} 복구를 재시도할까요?`,
  });
}

export function formatCloudConsoleLegacyProviderLabel(
  providerKey: string,
  locale?: string | null,
) {
  return selectCloudConsoleText(locale, {
    "en-US": `${providerKey} (legacy)`,
    "zh-CN": `${providerKey}（遗留）`,
    "ja-JP": `${providerKey}（レガシー）`,
    "ko-KR": `${providerKey}(레거시)`,
  });
}
// i18n-ignore-end
