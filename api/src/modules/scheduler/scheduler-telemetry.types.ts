export const SCHEDULER_JOB_DEFINITIONS = [
  {
    id: 'trigger_due_reminder_tasks',
    name: '到点提醒调度',
    cadence: '*/5 * * * *',
    description: '扫描到点的提醒任务，并通过提醒角色发出私聊提醒。',
    nextRunHint: '每 5 分钟',
    enabled: true,
  },
  {
    id: 'trigger_reminder_checkins',
    name: '提醒问询调度',
    cadence: '0 * * * *',
    description: '按小时判断是否需要由提醒角色主动追问有没有新的待提醒事项。',
    nextRunHint: '每小时整点',
    enabled: true,
  },
  {
    id: 'world_context_snapshot',
    name: '世界快照',
    cadence: '*/30 * * * *',
    description: '刷新 WorldContext 快照，供回复链路读取当前世界状态。',
    nextRunHint: '每 30 分钟',
    enabled: true,
  },
  {
    id: 'expire_friend_requests',
    name: '过期好友请求',
    cadence: '59 23 * * *',
    description: '清理当天过期的待处理好友请求。',
    nextRunHint: '每日 23:59',
    enabled: true,
  },
  {
    id: 'discover_need_characters_short_interval',
    name: '需求发现短周期',
    cadence: '*/10 * * * *',
    description: '短周期扫描新的人物需求，并生成候选角色。',
    nextRunHint: '每 10 分钟',
    enabled: true,
  },
  {
    id: 'discover_need_characters_daily',
    name: '需求发现日更',
    cadence: '*/10 * * * *',
    description: '按日维度刷新人物需求候选和覆盖缺口。',
    nextRunHint: '每 10 分钟',
    enabled: true,
  },
  {
    id: 'update_ai_active_status',
    name: '在线状态调度',
    cadence: '*/10 * * * *',
    description: '根据活跃时间窗口更新角色在线状态，并推进 AI 角色关系。',
    nextRunHint: '每 10 分钟',
    enabled: true,
  },
  {
    id: 'trigger_followup_recommendations',
    name: '追问推荐调度',
    cadence: '*/10 * * * *',
    description: '扫描适合跟进的话题并生成追问推荐。',
    nextRunHint: '每 10 分钟',
    enabled: true,
  },
  {
    id: 'check_real_world_news_bulletins',
    name: '界闻简报调度',
    cadence: '*/10 * * * *',
    description: '检查界闻早报、午报、晚报是否需要补发。',
    nextRunHint: '每 10 分钟',
    enabled: true,
  },
  {
    id: 'check_moment_schedule',
    name: '朋友圈调度',
    cadence: '*/15 * * * *',
    description: '检查角色是否应发布朋友圈内容。',
    nextRunHint: '每 15 分钟',
    enabled: true,
  },
  {
    id: 'trigger_scene_friend_requests',
    name: '场景加好友调度',
    cadence: '0 10,14,19 * * *',
    description: '按场景触发新的好友请求机会。',
    nextRunHint: '每日 10:00 / 14:00 / 19:00',
    enabled: true,
  },
  {
    id: 'process_pending_feed_reactions',
    name: '广场反应调度',
    cadence: '*/5 * * * *',
    description: '处理待执行的 AI 广场互动。',
    nextRunHint: '每 5 分钟',
    enabled: true,
  },
  {
    id: 'check_channels_schedule',
    name: '视频号调度',
    cadence: '*/20 * * * *',
    description: '按频率生成视频号内容，并补足基础内容池。',
    nextRunHint: '每 20 分钟',
    enabled: true,
  },
  {
    id: 'update_character_status',
    name: '活动状态调度',
    cadence: '0 */2 * * *',
    description: '根据时间段刷新角色当前活动状态。',
    nextRunHint: '每 2 小时',
    enabled: true,
  },
  {
    id: 'trigger_memory_proactive_messages',
    name: '主动提醒调度',
    cadence: '0 20 * * *',
    description: '扫描角色记忆，在合适时机主动给用户发提醒。',
    nextRunHint: '每日 20:00',
    enabled: true,
  },
  {
    id: 'update_recent_memory_daily',
    name: '近期摘要日更',
    cadence: '0 3 * * *',
    description: '每日从近7天互动记录中自动提取并更新近期摘要。',
    nextRunHint: '每日 03:00',
    enabled: true,
  },
  {
    id: 'update_core_memory_weekly',
    name: '核心记忆周更',
    cadence: '0 4 * * 1',
    description: '每周从近30天全量交互数据中自动提取并更新核心记忆。',
    nextRunHint: '每周一 04:00',
    enabled: true,
  },
] as const;

export type SchedulerJobId = (typeof SCHEDULER_JOB_DEFINITIONS)[number]['id'];
export type SchedulerRunResultValue = 'success' | 'error';
export type SchedulerCharacterEventKindValue =
  | 'online_status_changed'
  | 'activity_changed'
  | 'moment_posted'
  | 'channel_posted'
  | 'scene_friend_request'
  | 'proactive_message'
  | 'relationship_updated';

export interface SchedulerJobStatusValue {
  id: SchedulerJobId;
  name: string;
  cadence: string;
  description: string;
  enabled: boolean;
  nextRunHint: string;
  runCount: number;
  running: boolean;
  lastRunAt?: string;
  lastDurationMs?: number;
  lastResult?: string;
}

export interface SchedulerRunRecordValue {
  id: string;
  jobId: SchedulerJobId;
  jobName: string;
  status: SchedulerRunResultValue;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  summary: string;
}

export interface SchedulerCharacterEventValue {
  id: string;
  kind: SchedulerCharacterEventKindValue;
  title: string;
  summary: string;
  createdAt: string;
  jobId: SchedulerJobId;
  jobName: string;
  characterId: string;
  characterName: string;
}
