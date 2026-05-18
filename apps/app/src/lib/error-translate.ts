import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { AppErrorCode, AppErrorParams, KnownAppErrorCode } from "@yinjie/contracts";

/**
 * 与 ApiRequestError / 直接拿到的 AppErrorBody 结构都兼容的最小契约。
 */
export interface AppErrorLike {
  errorCode?: string | null;
  code?: string | null;
  params?: AppErrorParams | null;
  legacyMessage?: string | null;
  message?: string | string[];
}

/**
 * 把后端返回的 AppError code / params 翻译为本地化文案。
 *
 * 命中已知 code → 返回当前 locale 文案；
 * 命中 LEGACY_ERROR / 未知 code → 返回 null，由调用方回退到 legacyMessage 或通用错误提示。
 */
export function translateAppErrorCode(
  error: AppErrorLike | null | undefined,
): string | null {
  if (!error) {
    return null;
  }
  const rawCode = (error.errorCode ?? error.code) as
    | AppErrorCode
    | undefined
    | null;
  if (!rawCode) {
    return null;
  }
  const params = (error.params ?? {}) as Record<
    string,
    string | number | boolean | null
  >;

  switch (rawCode as KnownAppErrorCode) {
    case "FARM_CHARACTER_REQUIRED":
      return translateRuntimeMessage(msg`需要先选择一个角色。`);
    case "FARM_INVALID_PLOT_INDEX":
      return translateRuntimeMessage(msg`地块编号无效。`);
    case "FARM_UNKNOWN_CROP":
      return translateRuntimeMessage(
        msg`未知作物：${String(params.cropId ?? "")}`,
      );
    case "FARM_CHARACTER_NOT_PARTICIPATING":
      return translateRuntimeMessage(msg`该角色不参与农场。`);
    case "FARM_CHARACTER_NOT_FOUND":
      return translateRuntimeMessage(
        msg`角色不存在：${String(params.characterId ?? "")}`,
      );
    case "FARM_CHARACTER_NOT_VISIBLE":
      return translateRuntimeMessage(msg`该角色当前不可见。`);
    case "FARM_LEVEL_TOO_LOW":
      return translateRuntimeMessage(
        msg`等级不足：需 ${String(params.unlockLevel ?? "?")} 级才能种 ${String(params.cropName ?? "")}`,
      );
    case "FARM_BUY_LEVEL_TOO_LOW":
      return translateRuntimeMessage(
        msg`等级不足：需 ${String(params.unlockLevel ?? "?")} 级才能购买 ${String(params.cropName ?? "")} 种子`,
      );
    case "FARM_INSUFFICIENT_COINS":
      return translateRuntimeMessage(
        msg`金币不足：需 ${String(params.required ?? "?")}`,
      );
    case "FARM_PLOT_NOT_FOUND":
      return translateRuntimeMessage(msg`田块不存在。`);
    case "FARM_PLOT_NOT_PLANTABLE":
      return translateRuntimeMessage(msg`这块地现在不能种植。`);
    case "FARM_PLOT_EMPTY":
      return translateRuntimeMessage(msg`地块上没有作物。`);
    case "FARM_CROP_NOT_RIPE":
      return translateRuntimeMessage(msg`作物还没成熟。`);
    case "FARM_NPC_OPERATION_NOT_OPEN":
      return translateRuntimeMessage(
        msg`对 NPC 的此操作将在邻居模块开放：${String(params.op ?? "")}`,
      );
    case "FARM_QUANTITY_INVALID":
      return translateRuntimeMessage(msg`数量必须为正整数。`);
    case "FARM_WAREHOUSE_INSUFFICIENT":
      return translateRuntimeMessage(
        msg`仓库中 ${String(params.cropName ?? "")} 不足。`,
      );
    case "FARM_NPC_NO_FARM":
      return translateRuntimeMessage(msg`该角色还没有农场。`);
    case "FARM_ALREADY_STOLEN":
      return translateRuntimeMessage(msg`你已经偷过这块田了。`);
    case "FARM_ALREADY_WATERED":
      return translateRuntimeMessage(msg`这块田今日已浇过水。`);
    case "FARM_NO_WEEDS":
      return translateRuntimeMessage(msg`这块田没有杂草。`);
    case "FARM_NO_BUGS":
      return translateRuntimeMessage(msg`这块田没有害虫。`);
    case "FARM_DAILY_STEAL_LIMIT":
      return translateRuntimeMessage(
        msg`今日偷菜次数已达上限（${String(params.limit ?? "?")}/天）。`,
      );
    case "MOMENTS_MEDIA_REQUIRED":
      return translateRuntimeMessage(msg`请先选择一个朋友圈媒体文件。`);
    case "MOMENTS_INVALID_MEDIA_TYPE":
      return translateRuntimeMessage(msg`朋友圈当前仅支持图片或视频。`);
    case "MOMENTS_MEDIA_URL_INVALID":
      return translateRuntimeMessage(msg`朋友圈媒体必须来自上传接口。`);
    case "MOMENTS_MEDIA_NOT_FOUND":
      return translateRuntimeMessage(msg`朋友圈媒体不存在。`);
    case "MOMENTS_NOT_FOUND":
      return translateRuntimeMessage(msg`朋友圈不存在。`);
    case "MOMENTS_NOT_FRIEND":
      return translateRuntimeMessage(msg`需先加为好友才能互动。`);
    case "MOMENTS_EMPTY":
      return translateRuntimeMessage(msg`朋友圈内容和媒体不能同时为空。`);
    case "MOMENTS_TEXT_TOO_LONG":
      // 走查 R1：backend 抛 MOMENTS_TEXT_TOO_LONG（带 max=2000 params），但之前
      // 此 case 缺失 → 走 default 返回 null → 前端只能 fallback 到 server 的
      // legacyMessage「朋友圈正文最多 2000 字。」。zh-CN 用户看着没毛病，但
      // en-US / ja-JP / ko-KR locale 等于直接糊一段中文上去。和其它 MOMENTS_*
      // 错误风格对齐。
      return translateRuntimeMessage(
        msg`朋友圈正文最多 ${String(params.max ?? 2000)} 字。`,
      );
    case "MOMENTS_TEXT_NO_MEDIA":
      return translateRuntimeMessage(msg`纯文本朋友圈不能附带图片或视频。`);
    case "MOMENTS_VIDEO_SINGLE":
      return translateRuntimeMessage(msg`视频朋友圈必须且只能包含 1 条视频。`);
    case "MOMENTS_VIDEO_TOO_LONG":
      return translateRuntimeMessage(msg`朋友圈视频时长不能超过 5 分钟。`);
    case "MOMENTS_AUDIO_SINGLE":
      // 走查 R1：和 MOMENTS_TEXT_TOO_LONG 同一类 i18n 漏接——contracts 里
      // 声明了，backend 抛了，但前端 case 缺失，非 zh-CN locale 拿到的是
      // backend legacyMessage 的中文。补上后所有 locale 都走 lingui 字典翻译。
      return translateRuntimeMessage(msg`音乐朋友圈必须且只能包含 1 条音频。`);
    case "MOMENTS_IMAGES_MAX":
      return translateRuntimeMessage(
        msg`图片朋友圈最多支持 ${String(params.max ?? 9)} 张图片。`,
      );
    case "MOMENTS_IMAGES_TYPE_ONLY":
      return translateRuntimeMessage(msg`图片朋友圈当前只支持图片资源。`);
    case "MOMENTS_COMMENT_EMPTY":
      return translateRuntimeMessage(msg`评论内容不能为空。`);
    case "MOMENTS_COMMENT_TOO_LONG":
      return translateRuntimeMessage(
        msg`评论最多 ${String(params.max ?? 500)} 字。`,
      );
    case "MOMENTS_COMMENT_REPLY_TARGET_INVALID":
      return translateRuntimeMessage(msg`被回复的评论不存在或已被删除。`);
    case "MOMENTS_DELETE_FORBIDDEN":
      return translateRuntimeMessage(msg`只能删除自己发布的朋友圈。`);
    case "REMINDER_LIMIT_INVALID":
      return translateRuntimeMessage(msg`limit 必须是正整数。`);
    case "REMINDER_ONLY_ACTIVE_COMPLETE":
      return translateRuntimeMessage(msg`只有激活中的提醒可以完成。`);
    case "REMINDER_ONLY_ACTIVE_DEFER":
      return translateRuntimeMessage(msg`只有激活中的提醒可以延后。`);
    case "REMINDER_NOT_FOUND":
      return translateRuntimeMessage(msg`提醒不存在。`);
    case "REMINDER_UNTIL_INVALID":
      return translateRuntimeMessage(msg`until 不是有效时间。`);
    case "REMINDER_DEFER_INVALID":
      return translateRuntimeMessage(msg`请提供有效的延后时间。`);
    case "CHARACTER_NOT_FOUND":
      return translateRuntimeMessage(
        msg`角色不存在：${String(params.id ?? params.characterId ?? "")}`,
      );
    case "CHARACTER_ALREADY_EXISTS":
      return translateRuntimeMessage(
        msg`角色已存在：${String(params.id ?? "")}`,
      );
    case "CHARACTER_DEFAULT_NOT_DELETABLE":
      return translateRuntimeMessage(msg`默认保底角色不可删除。`);
    case "PRESET_NOT_FOUND":
      return translateRuntimeMessage(
        msg`预设角色不存在：${String(params.presetKey ?? "")}`,
      );
    case "PRESET_AT_LEAST_ONE":
      return translateRuntimeMessage(msg`至少选择一个预设角色。`);
    case "BLUEPRINT_CHAT_SAMPLE_REQUIRED":
      return translateRuntimeMessage(msg`需要提供聊天样本。`);
    case "BLUEPRINT_REVISION_NOT_FOUND":
      return translateRuntimeMessage(
        msg`角色蓝图版本不存在：${String(params.revisionId ?? "")}`,
      );
    case "SHAKE_DISABLED":
      return translateRuntimeMessage(msg`摇一摇当前已在后台停用。`);
    case "SHAKE_COOLDOWN":
      return translateRuntimeMessage(
        msg`请至少间隔 ${String(params.cooldownMinutes ?? "?")} 分钟再摇一次。`,
      );
    case "SHAKE_DAILY_LIMIT":
      return translateRuntimeMessage(msg`今日摇一摇次数已达到上限。`);
    case "SHAKE_CYBER_AVATAR_NO_SIGNAL":
      return translateRuntimeMessage(
        msg`当前赛博分身信号不足，暂时还不能生成新的摇一摇角色。`,
      );
    case "SHAKE_SESSION_NOT_FOUND":
      return translateRuntimeMessage(
        msg`摇一摇会话不存在：${String(params.sessionId ?? "")}`,
      );
    case "SHAKE_NOT_DISCARDABLE":
      return translateRuntimeMessage(msg`当前摇一摇结果已经不可再放弃。`);
    case "SHAKE_KEPT_CHARACTER_MISSING":
      return translateRuntimeMessage(
        msg`当前摇一摇结果已保留，但角色记录不存在。`,
      );
    case "SHAKE_NOT_KEEPABLE":
      return translateRuntimeMessage(msg`当前摇一摇结果已经不能再保留。`);
    case "SHAKE_DRAFT_MISSING":
      return translateRuntimeMessage(msg`当前摇一摇结果缺少角色草稿。`);
    case "SHAKE_CHARACTER_CREATE_FAILED":
      return translateRuntimeMessage(msg`当前摇一摇结果无法创建对应角色。`);
    case "SHAKE_NO_DIRECTIONS":
      return translateRuntimeMessage(msg`没有可用的摇一摇方向。`);
    case "SHAKE_AI_PLANNING_FAILED":
      return translateRuntimeMessage(msg`摇一摇生成失败，请稍后重试。`);
    case "SHAKE_AI_GENERATION_FAILED":
      return translateRuntimeMessage(msg`摇一摇生成失败，请稍后重试。`);
    case "SOCIAL_SCENE_INVALID":
      return translateRuntimeMessage(msg`请选择一个场景。`);
    case "SOCIAL_SCENE_COOLDOWN":
      return translateRuntimeMessage(msg`别走太急，过一会再去下一个地方。`);
    case "SOCIAL_SCENE_DAILY_LIMIT":
      return translateRuntimeMessage(msg`今天的场景相遇次数已经用完，明天再试试。`);
    case "AUTH_USERNAME_PASSWORD_REQUIRED":
      return translateRuntimeMessage(msg`用户名与密码不能为空。`);
    case "AUTH_USERNAME_TAKEN":
      return translateRuntimeMessage(msg`用户名已被占用。`);
    case "AUTH_INVALID_CREDENTIALS":
      return translateRuntimeMessage(msg`账号或密码错误。`);
    case "AUTH_EMAIL_LOGIN_ONLY":
      return translateRuntimeMessage(
        msg`该账号通过邮箱验证码注册，请使用邮箱验证码登录。`,
      );
    case "AUTH_JWT_SECRET_MISSING":
      return translateRuntimeMessage(msg`服务器未配置 JWT_SECRET。`);
    case "AUTH_CODE_REQUIRED":
      return translateRuntimeMessage(msg`验证码不能为空。`);
    case "AUTH_CODE_INVALID":
      return translateRuntimeMessage(msg`验证码错误。`);
    case "AUTH_CODE_USED":
      return translateRuntimeMessage(msg`该验证码已使用。`);
    case "AUTH_CODE_EXPIRED":
      return translateRuntimeMessage(msg`验证码已过期。`);
    case "AUTH_EMAIL_INVALID":
      return translateRuntimeMessage(msg`邮箱格式不正确。`);
    case "AUTH_TOKEN_MISSING":
      return translateRuntimeMessage(msg`缺少访问令牌。`);
    case "AUTH_TOKEN_INVALID":
      return translateRuntimeMessage(msg`访问令牌无效或已过期。`);
    case "AUTH_USER_NOT_FOUND":
      return translateRuntimeMessage(msg`用户不存在。`);
    case "AUTH_EMAIL_BIND_FAILED":
      return translateRuntimeMessage(msg`邮箱绑定失败，请稍后重试。`);
    case "AUTH_EMAIL_SEND_FAILED":
      return translateRuntimeMessage(msg`验证码发送失败，请稍后重试。`);
    case "AUTH_CODE_RESEND_TOO_FAST":
      return translateRuntimeMessage(
        msg`验证码发送过于频繁，请在 ${String(params.retryAfter ?? "?")} 秒后重试。`,
      );
    case "AUTH_CODE_TOO_MANY":
      return translateRuntimeMessage(msg`该邮箱验证码请求次数过多，请稍后再试。`);
    case "AI_AUDIO_REQUIRED":
      return translateRuntimeMessage(msg`请先录一段语音再试。`);
    case "AI_AUDIO_MODE_UNSUPPORTED":
      return translateRuntimeMessage(msg`当前语音模式暂不支持。`);
    case "AI_TTS_TEXT_REQUIRED":
      return translateRuntimeMessage(msg`请先提供要播报的文本。`);
    case "AI_TTS_EMPTY":
      return translateRuntimeMessage(msg`语音生成结果为空，请稍后再试。`);
    case "AI_AUDIO_RETRY_FAILED":
      return translateRuntimeMessage(msg`语音请求重试失败。`);
    case "AI_RATE_LIMIT":
      return translateRuntimeMessage(
        typeof params.message === "string"
          ? msg`请求过于频繁：${String(params.message)}`
          : msg`请求过于频繁，请稍后再试。`,
      );
    case "AI_PROVIDER_UNAVAILABLE":
      return translateRuntimeMessage(msg`当前 AI 服务不可用，请稍后再试。`);
    case "AI_IMAGE_PROMPT_REQUIRED":
      return translateRuntimeMessage(msg`请先提供图片生成描述。`);
    case "AI_IMAGE_EMPTY":
      return translateRuntimeMessage(msg`图片生成结果为空，请稍后再试。`);
    case "AI_IMAGE_PROVIDER_UNAVAILABLE":
      return translateRuntimeMessage(msg`图片生成服务不可用，请稍后再试。`);
    case "AI_TRANSCRIBE_AUDIO_REQUIRED":
      return translateRuntimeMessage(msg`没有收到可转写的音频内容。`);
    case "AI_TRANSCRIBE_TOO_LARGE":
      return translateRuntimeMessage(msg`录音文件过大，请缩短单次语音输入时长。`);
    case "AI_TRANSCRIBE_FORMAT_INVALID":
      return translateRuntimeMessage(msg`录音文件格式不受支持，请重试。`);
    case "AI_TRANSCRIBE_PROVIDER_UNAVAILABLE":
      return translateRuntimeMessage(msg`语音转写服务不可用，请稍后再试。`);
    case "AI_TRANSCRIBE_GATEWAY_FAILED":
      return translateRuntimeMessage(msg`语音转写失败，请稍后再试。`);
    case "AI_SPEECH_ASSET_NOT_FOUND":
      return translateRuntimeMessage(msg`语音资源不存在。`);
    case "PROVIDER_ACCOUNT_NAME_REQUIRED":
      return translateRuntimeMessage(msg`Provider 账户名称不能为空。`);
    case "PROVIDER_ACCOUNT_ENDPOINT_REQUIRED":
      return translateRuntimeMessage(msg`Provider 接口地址不能为空。`);
    case "PROVIDER_ACCOUNT_NOT_FOUND":
      return translateRuntimeMessage(
        msg`Provider 账户不存在：${String(params.id ?? params.providerAccountId ?? "")}`,
      );
    case "PROVIDER_ACCOUNT_DISABLED_FOR_DEFAULT":
      return translateRuntimeMessage(msg`请先启用该 Provider 账户，再设为默认。`);
    case "PROVIDER_ACCOUNT_DISABLED_FOR_REBIND":
      return translateRuntimeMessage(
        msg`请先启用目标 Provider 账户，再批量换绑模型人格角色。`,
      );
    case "PROVIDER_ACCOUNT_MODEL_REQUIRED":
      return translateRuntimeMessage(msg`请先填写默认模型 ID。`);
    case "PROVIDER_ACCOUNT_DEFAULT_NOT_FOUND":
      return translateRuntimeMessage(msg`默认 Provider 账户不存在。`);
    case "PROVIDER_CATALOG_AT_LEAST_ONE_INSTALLABLE":
      return translateRuntimeMessage(msg`至少选择一个可安装的模型目录项。`);
    case "PROVIDER_CATALOG_AT_LEAST_ONE_REGISTERED":
      return translateRuntimeMessage(msg`至少选择一个已登记的模型目录项。`);
    case "ADMIN_ACCESS_NOT_CONFIGURED":
      return translateRuntimeMessage(msg`管理后台尚未配置访问密钥。`);
    case "ADMIN_INVALID_SECRET":
      return translateRuntimeMessage(msg`管理后台访问密钥无效。`);
    case "ADMIN_WIKI_ITEMS_REQUIRED":
      return translateRuntimeMessage(msg`items 必填。`);
    case "ADMIN_WIKI_CHARACTER_REVISION_REQUIRED":
      return translateRuntimeMessage(
        msg`characterId 与 expectedStableRevisionId 必填。`,
      );
    case "ADMIN_CONVERSATION_NOT_FOUND":
      return translateRuntimeMessage(
        msg`对话不存在：${String(params.conversationId ?? "")}`,
      );
    case "ADMIN_CONVERSATION_NO_CHARACTER_PARTICIPANTS":
      return translateRuntimeMessage(
        msg`对话 ${String(params.conversationId ?? "")} 没有角色参与者。`,
      );
    case "ADMIN_MESSAGE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`消息不存在：${String(params.messageId ?? "")}`,
      );
    case "ADMIN_WORLD_OWNER_NOT_FOUND":
      return translateRuntimeMessage(msg`World owner 不存在。`);
    case "ADMIN_SELFAGENT_DOC_UNKNOWN":
      return translateRuntimeMessage(msg`未知的 self-agent workspace 文档名。`);
    case "ADMIN_WECHAT_CONTACTS_AT_LEAST_ONE":
      return translateRuntimeMessage(msg`至少选择一个联系人。`);
    case "ADMIN_WECHAT_PREVIEW_LIMIT":
      return translateRuntimeMessage(msg`单次最多预览 20 个联系人。`);
    case "ADMIN_WECHAT_PREVIEWED_AT_LEAST_ONE":
      return translateRuntimeMessage(msg`至少选择一个预览通过的联系人。`);
    case "ADMIN_WECHAT_IMPORT_LIMIT":
      return translateRuntimeMessage(msg`单次最多导入 20 个联系人。`);
    case "ADMIN_WECHAT_CONTACT_NOT_FOUND":
      return translateRuntimeMessage(msg`联系人导入角色不存在。`);
    case "ADMIN_WECHAT_FRIENDSHIP_ONLY_CONTACT":
      return translateRuntimeMessage(msg`只支持补建联系人导入角色的好友关系。`);
    case "ADMIN_WECHAT_FRIENDSHIP_FAILED":
      return translateRuntimeMessage(msg`好友关系补建失败。`);
    case "ADMIN_WECHAT_ROLLBACK_ONLY_CONTACT":
      return translateRuntimeMessage(msg`只支持回滚联系人导入角色。`);
    case "CHAT_BACKGROUND_NOT_SELECTED":
      return translateRuntimeMessage(msg`请先选择一张聊天背景。`);
    case "CHAT_BACKGROUND_NOT_FOUND":
      return translateRuntimeMessage(msg`聊天背景不存在。`);
    case "CHAT_BACKGROUND_IMAGE_ONLY":
      return translateRuntimeMessage(msg`当前只支持上传图片作为聊天背景。`);
    case "CHAT_FAVORITE_PARAMS_REQUIRED":
      return translateRuntimeMessage(msg`收藏消息缺少必要参数。`);
    case "CHAT_FAVORITE_ID_REQUIRED":
      return translateRuntimeMessage(msg`收藏标识不能为空。`);
    case "CHAT_NOTE_ID_REQUIRED":
      return translateRuntimeMessage(msg`笔记标识不能为空。`);
    case "CHAT_NOTE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`笔记不存在：${String(params.noteId ?? "")}`,
      );
    case "CHAT_REMINDER_PARAMS_REQUIRED":
      return translateRuntimeMessage(msg`提醒消息缺少必要参数。`);
    case "CHAT_REMINDER_TIME_INVALID":
      return translateRuntimeMessage(msg`提醒时间格式无效。`);
    case "CHAT_REMINDER_ID_REQUIRED":
      return translateRuntimeMessage(msg`提醒标识不能为空。`);
    case "CHAT_REMINDER_NOT_FOUND":
      return translateRuntimeMessage(
        msg`提醒不存在：${String(params.reminderId ?? "")}`,
      );
    case "CHAT_GROUP_MESSAGE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`群消息不存在：${String(params.messageId ?? "")}`,
      );
    case "CHAT_CONVERSATION_NOT_FOUND":
      return translateRuntimeMessage(
        msg`聊天会话不存在：${String(params.conversationId ?? params.threadId ?? "")}`,
      );
    case "CHAT_MESSAGE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`消息不存在：${String(params.messageId ?? "")}`,
      );
    case "CHAT_GROUP_NOT_FOUND":
      return translateRuntimeMessage(
        msg`群聊不存在：${String(params.groupId ?? params.threadId ?? "")}`,
      );
    case "CHAT_SEARCH_QUERY_REQUIRED":
      return translateRuntimeMessage(msg`搜索词不能为空。`);
    case "CHAT_STICKER_NOT_FOUND":
      return translateRuntimeMessage(msg`自定义表情不存在。`);
    case "CHAT_STICKER_ASSET_NOT_FOUND":
      return translateRuntimeMessage(msg`自定义表情资源不存在。`);
    case "CHAT_STICKER_BUILTIN_NOT_FOUND":
      return translateRuntimeMessage(msg`内置表情资源不存在。`);
    case "CHAT_STICKER_IMAGE_NOT_FOUND":
      return translateRuntimeMessage(msg`图片资源不存在。`);
    case "CHAT_STICKER_MESSAGE_NO_IMPORTABLE":
      return translateRuntimeMessage(msg`这条消息没有可导入的表情内容。`);
    case "CHAT_STICKER_MESSAGE_NOT_SUPPORTED":
      return translateRuntimeMessage(msg`当前消息暂不支持添加到表情。`);
    case "CHAT_STICKER_RESOURCE_NOT_SUPPORTED":
      return translateRuntimeMessage(msg`当前资源暂不支持添加到表情。`);
    case "CHAT_STICKER_UPLOAD_IMAGE_ONLY":
      return translateRuntimeMessage(msg`只能上传图片或动图作为表情。`);
    case "CHAT_STICKER_UPLOAD_INVALID":
      return translateRuntimeMessage(msg`上传的表情资源无效，请重新选择。`);
    case "CHAT_ASSET_NOT_FOUND":
      return translateRuntimeMessage(msg`资源不存在。`);
    case "CHAT_ATTACHMENT_REQUIRED":
      return translateRuntimeMessage(msg`请先选择一个附件。`);
    case "CHAT_STICKER_FILE_REQUIRED":
      return translateRuntimeMessage(msg`请先选择一个表情文件。`);
    case "CHAT_THREAD_TYPE_INVALID":
      return translateRuntimeMessage(msg`缺少合法的 threadType。`);
    case "CHAT_THREAD_OR_MESSAGE_REQUIRED":
      return translateRuntimeMessage(msg`缺少 threadId 或 messageId。`);
    case "CHAT_CONVERSATION_ID_REQUIRED":
      return translateRuntimeMessage(msg`缺少 conversationId。`);
    case "CHAT_RENDER_STATUS_INVALID":
      return translateRuntimeMessage(msg`缺少合法的 renderStatus。`);
    case "CHAT_STATUS_INVALID":
      return translateRuntimeMessage(msg`status 非法。`);
    case "CHAT_DIGITAL_HUMAN_AUTH_FAILED":
      return translateRuntimeMessage(msg`数字人 provider 回调鉴权失败。`);
    case "CHAT_REVOKE_OWN_ONLY":
      return translateRuntimeMessage(msg`只能撤回自己发送的消息。`);
    case "CHAT_ATTACHMENT_NOT_FOUND":
      return translateRuntimeMessage(msg`附件不存在。`);
    case "CHAT_PROFILE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`角色档案不存在：${String(params.characterId ?? "")}`,
      );
    case "CHAT_ATTACHMENT_PAYLOAD_INVALID":
      return translateRuntimeMessage(msg`附件 payload 无效。`);
    case "CHAT_MESSAGE_TEXT_REQUIRED":
      return translateRuntimeMessage(msg`消息文本不能为空。`);
    case "CHAT_STICKER_LIMIT_REACHED":
      return translateRuntimeMessage(
        msg`自定义表情最多只能保存 ${String(params.max ?? "?")} 个。`,
      );
    case "CHAT_STICKER_EDGE_TOO_LARGE":
      return translateRuntimeMessage(
        msg`表情最大边长不能超过 ${String(params.maxEdge ?? "?")}px，请先压缩后再试。`,
      );
    case "CHAT_STICKER_GIF_TOO_LARGE":
      return translateRuntimeMessage(
        msg`GIF 表情不能超过 ${String(params.maxBytesText ?? "?")}，请先压缩后再试。`,
      );
    case "CHAT_STICKER_RESOURCE_INVALID":
      return translateRuntimeMessage(msg`当前资源无法添加到表情。`);
    case "CHAT_GROUP_OWNER_MEMBER_NOT_FOUND":
      return translateRuntimeMessage(
        msg`群主成员记录不存在：${String(params.groupId ?? "")}`,
      );
    case "CHAT_GROUP_MEMBER_NOT_FOUND":
      return translateRuntimeMessage(
        msg`群成员不存在：${String(params.memberId ?? "")}`,
      );
    case "CHAT_GROUP_ONLY_OWNER_AS_USER":
      return translateRuntimeMessage(msg`只有世界主人可以加为用户成员。`);
    case "CHAT_VOICE_CALL_NOT_FOUND":
      return translateRuntimeMessage(msg`语音通话记录不存在。`);
    case "CHAT_VOICE_CALL_INVALID_STATE":
      return translateRuntimeMessage(msg`语音通话当前状态不允许此操作。`);
    case "CHAT_VOICE_CALL_NOT_OWNED":
      return translateRuntimeMessage(msg`你不是这通通话的发起方。`);
    case "CHAT_VOICE_CALL_AUDIO_REQUIRED":
      return translateRuntimeMessage(msg`请先录一段语音再继续。`);
    case "CHAT_DIGITAL_HUMAN_NOT_AVAILABLE":
      return translateRuntimeMessage(msg`数字人通道当前不可用。`);
    case "CHAT_DIGITAL_HUMAN_TASK_NOT_FOUND":
      return translateRuntimeMessage(msg`数字人任务不存在。`);
    case "CHAT_DIGITAL_HUMAN_TASK_INVALID":
      return translateRuntimeMessage(msg`数字人任务参数无效。`);
    case "CHAT_REPLY_TASK_NOT_FOUND":
      return translateRuntimeMessage(msg`回复任务不存在。`);
    case "CHAT_REPLY_TASK_INVALID_STATE":
      return translateRuntimeMessage(msg`回复任务当前状态不允许此操作。`);
    case "EVAL_CASE_NOT_FOUND":
      return translateRuntimeMessage(
        msg`Eval 用例不存在：${String(params.caseId ?? "")}`,
      );
    case "EVAL_PAIRWISE_DATASET_MISMATCH":
      return translateRuntimeMessage(
        msg`两两对比需要相同的数据集。`,
      );
    case "EVAL_DATASET_NOT_FOUND":
      return translateRuntimeMessage(msg`Eval 数据集不存在。`);
    case "EVAL_EXPERIMENT_PRESET_NOT_FOUND":
      return translateRuntimeMessage(msg`Eval 实验预设不存在。`);
    case "EVAL_OPERATION_INVALID":
      return translateRuntimeMessage(msg`Eval 操作不合法。`);
    case "EVAL_RUN_NOT_FOUND":
      return translateRuntimeMessage(msg`Eval 运行记录不存在。`);
    case "EVAL_GENERATION_TRACE_NOT_FOUND":
      return translateRuntimeMessage(msg`生成轨迹不存在。`);
    case "EVAL_REPORT_NOT_FOUND":
      return translateRuntimeMessage(msg`Eval 报告不存在。`);
    case "EVAL_FEATURE_NOT_IMPLEMENTED":
      return translateRuntimeMessage(msg`该 Eval 功能尚未实现。`);
    case "SELF_AGENT_DEFAULT_NOT_INITIALIZED":
      return translateRuntimeMessage(msg`默认 self 角色尚未落库。`);
    case "WORLD_OWNER_NOT_FOUND":
      return translateRuntimeMessage(msg`世界主人不存在。`);
    case "WORLD_OWNER_NAME_TOO_SHORT": {
      const minLength =
        typeof params.minLength === "number" ? params.minLength : 2;
      return translateRuntimeMessage(
        msg`世界主人昵称至少 ${minLength} 个字。`,
      );
    }
    case "WORLD_OWNER_NAME_TOO_LONG": {
      const maxLength =
        typeof params.maxLength === "number" ? params.maxLength : 64;
      return translateRuntimeMessage(
        msg`世界主人昵称最多 ${maxLength} 个字符。`,
      );
    }
    case "WORLD_OWNER_SIGNATURE_TOO_LONG": {
      const maxLength =
        typeof params.maxLength === "number" ? params.maxLength : 300;
      return translateRuntimeMessage(
        msg`个性签名最多 ${maxLength} 个字符。`,
      );
    }
    case "WORLD_OWNER_AVATAR_TOO_LARGE":
      return translateRuntimeMessage(
        msg`头像图片超过 2MB 上限，请压缩后再试。`,
      );
    case "WORLD_OWNER_AVATAR_UNSAFE_URL":
      return translateRuntimeMessage(
        msg`头像链接必须是 http/https 图片地址，或 data:image/ 开头的图片数据。`,
      );
    case "WORLD_OWNER_NAME_INVALID":
      return translateRuntimeMessage(msg`世界主人昵称必须是字符串。`);
    case "WORLD_OWNER_SIGNATURE_INVALID":
      return translateRuntimeMessage(msg`个性签名必须是字符串。`);
    case "WORLD_OWNER_AVATAR_INVALID":
      return translateRuntimeMessage(
        msg`头像必须是字符串（URL 或 data:image/ 数据）。`,
      );
    case "OFFICIAL_ACCOUNT_FOLLOW_NOT_FOUND":
      return translateRuntimeMessage(msg`公众号关注关系不存在。`);
    case "OFFICIAL_ACCOUNT_PUSH_NOT_FOUND":
      return translateRuntimeMessage(msg`推送记录不存在。`);
    case "OFFICIAL_ACCOUNT_NOT_FOUND":
      return translateRuntimeMessage(msg`公众号不存在。`);
    case "OFFICIAL_SERVICE_ACCOUNT_NOT_FOUND":
      return translateRuntimeMessage(msg`服务号不存在。`);
    case "OFFICIAL_ACCOUNT_ARTICLE_NOT_FOUND":
      return translateRuntimeMessage(msg`文章不存在。`);
    case "MODERATION_TARGET_TYPE_INVALID":
      return translateRuntimeMessage(msg`不支持的举报对象类型。`);
    case "MODERATION_TARGET_ID_REQUIRED":
      return translateRuntimeMessage(msg`请提供举报对象的 ID。`);
    case "MODERATION_REASON_REQUIRED":
      return translateRuntimeMessage(msg`请提供举报理由。`);
    case "MODERATION_STATUS_INVALID":
      return translateRuntimeMessage(msg`不支持的处理状态。`);
    case "MODERATION_REPORT_NOT_FOUND":
      return translateRuntimeMessage(msg`举报记录不存在。`);
    case "MAIL_CODE_SEND_FAILED":
      return translateRuntimeMessage(msg`邮件验证码发送失败，请稍后重试。`);
    case "FEED_CHANNEL_AUTHOR_NOT_FOUND":
      return translateRuntimeMessage(msg`视频号作者不存在。`);
    case "FEED_COMMENT_NOT_FOUND":
      return translateRuntimeMessage(msg`评论不存在。`);
    case "FEED_COMMENT_EMPTY":
      return translateRuntimeMessage(msg`评论内容不能为空。`);
    case "FEED_COMMENT_TOO_LONG":
      return translateRuntimeMessage(
        msg`评论最多 ${String(params.max ?? 500)} 字。`,
      );
    case "FEED_EMPTY":
      return translateRuntimeMessage(msg`动态内容和媒体不能同时为空。`);
    case "FEED_TEXT_TOO_LONG":
      return translateRuntimeMessage(
        msg`广场动态正文最多 ${String(params.max ?? 2000)} 字。`,
      );
    case "FEED_TEXT_NO_MEDIA":
      return translateRuntimeMessage(msg`纯文本动态不能附带图片或视频。`);
    case "FEED_VIDEO_SINGLE":
      return translateRuntimeMessage(msg`视频动态必须且只能包含 1 条视频。`);
    case "FEED_VIDEO_TOO_LONG":
      return translateRuntimeMessage(msg`视频时长不能超过 5 分钟。`);
    case "FEED_IMAGES_MAX":
      return translateRuntimeMessage(
        msg`图片动态最多支持 ${String(params.max ?? 9)} 张图片。`,
      );
    case "FEED_IMAGES_TYPE_ONLY":
      return translateRuntimeMessage(msg`图片动态当前只支持图片资源。`);
    case "FEED_POST_NOT_FOUND":
      return translateRuntimeMessage(msg`动态不存在。`);
    case "FEED_NOT_FRIEND":
      return translateRuntimeMessage(msg`需先加为好友才能互动。`);
    case "CYBER_AVATAR_RUN_NOT_FOUND":
      return translateRuntimeMessage(
        msg`赛博分身运行记录不存在：${String(params.runId ?? "")}`,
      );
    case "WORLD_LANGUAGE_INVALID":
      return translateRuntimeMessage(msg`不支持的世界语言。`);
    case "ACTION_CONNECTOR_NOT_FOUND":
      return translateRuntimeMessage(
        msg`Connector 不存在：${String(params.id ?? "")}`,
      );
    case "ACTION_OPERATION_INVALID":
      return translateRuntimeMessage(msg`Action 操作不合法。`);
    case "ACTION_RUN_NOT_FOUND":
      return translateRuntimeMessage(
        msg`Action 运行记录不存在：${String(params.id ?? "")}`,
      );
    case "ACTION_RUN_NO_PLAN_SNAPSHOT":
      return translateRuntimeMessage(msg`该动作缺少 plan 快照，当前无法重试。`);
    case "FOLLOWUP_FRIEND_REQUEST_REQUIRED":
      return translateRuntimeMessage(msg`friendRequestId 必填。`);
    case "FOLLOWUP_NOT_FOUND":
      return translateRuntimeMessage(msg`Follow-up 不存在。`);
    case "WIKI_PAGE_NOT_FOUND":
      return translateRuntimeMessage(msg`词条不存在。`);
    case "WIKI_PAGE_DELETED":
      return translateRuntimeMessage(msg`该词条已被删除，无法编辑。`);
    case "WIKI_REVISION_CONFLICT":
      return translateRuntimeMessage(msg`存在编辑冲突，请基于最新版本重新提交。`);
    case "WIKI_VALIDATION_FAILED":
      return translateRuntimeMessage(
        typeof params.detail === "string" && params.detail.length > 0
          ? msg`Wiki 校验失败：${String(params.detail)}`
          : msg`Wiki 校验失败。`,
      );
    case "WIKI_FORBIDDEN":
      return translateRuntimeMessage(
        typeof params.reason === "string" && params.reason.length > 0
          ? msg`Wiki 操作被拒绝：${String(params.reason)}`
          : msg`Wiki 操作被拒绝。`,
      );
    case "WIKI_CONFLICT":
      return translateRuntimeMessage(
        typeof params.detail === "string" && params.detail.length > 0
          ? msg`Wiki 冲突：${String(params.detail)}`
          : msg`Wiki 冲突。`,
      );
    case "WIKI_RATE_LIMITED":
      return translateRuntimeMessage(msg`Wiki 操作过于频繁，请稍后再试。`);
    case "WIKI_ABUSE_FILTER_TRIGGERED":
      return translateRuntimeMessage(msg`Wiki 内容触发过滤规则。`);
    case "WIKI_REVIEW_NOT_FOUND":
      return translateRuntimeMessage(msg`Wiki 审核记录不存在。`);
    case "WIKI_REVIEW_INVALID_STATE":
      return translateRuntimeMessage(msg`Wiki 审核当前状态不允许此操作。`);
    case "WIKI_TALK_NOT_FOUND":
      return translateRuntimeMessage(msg`Wiki 讨论不存在。`);
    case "WIKI_TALK_INVALID_STATE":
      return translateRuntimeMessage(msg`Wiki 讨论当前状态不允许此操作。`);
    case "WIKI_BLOCK_NOT_FOUND":
      return translateRuntimeMessage(msg`Wiki 封禁记录不存在。`);
    case "WIKI_BLOCK_INVALID_STATE":
      return translateRuntimeMessage(msg`Wiki 封禁当前状态不允许此操作。`);
    case "WIKI_REPORT_NOT_FOUND":
      return translateRuntimeMessage(msg`Wiki 举报不存在。`);
    case "WIKI_REPORT_INVALID_STATE":
      return translateRuntimeMessage(msg`Wiki 举报当前状态不允许此操作。`);
    case "GAME_NOT_FOUND":
      return translateRuntimeMessage(msg`游戏不存在。`);
    case "GAME_REVISION_NOT_FOUND":
      return translateRuntimeMessage(msg`游戏修订不存在。`);
    case "GAME_SUBMISSION_NOT_FOUND":
      return translateRuntimeMessage(msg`游戏投稿不存在。`);
    case "GAME_VALIDATION_FAILED":
      return translateRuntimeMessage(
        typeof params.detail === "string" && params.detail.length > 0
          ? msg`游戏校验失败：${String(params.detail)}`
          : msg`游戏校验失败。`,
      );
    case "VALIDATION_FAILED":
      return translateRuntimeMessage(msg`提交的数据无效，请检查后重试。`);
    case "INTERNAL_ERROR":
      return translateRuntimeMessage(msg`服务暂时不可用，请稍后再试。`);
    case "LEGACY_ERROR":
      return null;
    default:
      return null;
  }
}
