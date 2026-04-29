import {
  getActiveLocale,
  getSurfaceTextDictionary,
  resolveSupportedLocale,
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
  },
  "ja-JP": {
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
  },
  "ko-KR": {
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
// i18n-ignore-end
