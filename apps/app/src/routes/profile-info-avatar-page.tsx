import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, RotateCcw, X } from "lucide-react";
import { isApiRequestError, updateWorldOwner } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, TextField, cn } from "@yinjie/ui";
import defaultOwnerAvatar from "../assets/default-owner-avatar.svg";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { pickImageFiles } from "../runtime/native-image-picker";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const MAX_AVATAR_BYTES = 1024 * 1024;
// 跟服务端 api/.../world-owner.service.ts 的 MAX_OWNER_AVATAR_LENGTH 对齐：
// avatar 字段（URL 或 data URL）落库时最长 2MB。客户端校到这条线，可以让
// 「粘贴一坨巨型 data URL」的用户在按完成前就拿到反馈，不用先等几秒上传被
// 服务端 400 拒掉、还看一段中文 legacyMessage。
const MAX_AVATAR_INPUT_LENGTH = 2 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type UrlInputError =
  | "format"
  | "too_large"
  | "unsafe_scheme"
  | "data_url_empty"
  | "missing_path"
  | null;

// data: 头部最短壳是 "data:image/x;," (14 字符) 或 "data:image/png;base64," (22 字符)。
// 比这只多几个字节的 data URL（如 "data:image/png;base64,A"）解码后没有任何
// 像素内容，AvatarChip 加载会失败回 fallback。比 1×1 透明 GIF (~41 字符) 更短
// 的串几乎不可能是合法图片。设 32 字符作为下限：
//   - 阻断 "data:image/x;,"、"data:image/png"、"data:image/png;base64," 这种 garbage
//   - 放行 1×1 transparent GIF (41 字符)、空 SVG (~60 字符) 等真实最小图片
// 第 2 轮新走查 W2R1.7 实测：之前粘 "data:image/x;," 完成按钮没 disable，PATCH
// 直接落库——下次进 profile 看见默认 fallback 以为头像消失了，毫无线索可查。
const MIN_AVATAR_DATA_URL_LENGTH = 32;

// 之前 URL 输入框完全不校验，用户输 "abc"、"https//x"（漏冒号）这种
// 也能 disable 不掉「完成」一路提交到服务端落库，AvatarChip 加载失败
// 静默回落到 fallback。用户以为头像改好了，profile 里却是 initials —
// 拍照 / 重新进来 / 等等几个入口都看不出哪里错了，毫无反馈。
// 跟 profile-settings 校验 customApiBase 同样的逻辑：trim + 用 URL
// 构造器 try / catch 一下，只放行 http(s) 和 data:image/。
//
// 安全：先单独拦 javascript: / vbscript: / data:text/... / file: 这一类
// 危险协议——它们走 new URL() 一样能 parse 成功，但塞进数据库后任何把
// avatar 当 href / 作为 <a> / 第三方 webview 渲染的下游路径都可能命中
// 脚本执行 / 本地文件读取。即使 <img src> 不会执行 javascript:，写到
// session storage 再被第三方组件复用就晚了。
// preview 里 <AvatarChip src={trimmed}> 会跟着每次 keystroke 重新发起图片请求：
// 用户键入 "https://example.com/foo.png" 期间，从 "https://" 起就开始命中
// isLikelyImageSource → 每打一个字就一次 <img onError> 网络往返（"https://e"、
// "https://ex"…到 "https://example.com/foo.png" 才真正能加载）。
// gate：URL 得「看起来够完整」才进 preview——data:image/ 直接放行；
// http(s) 必须既能 parse、又得有 pathname 段（不是裸 host 起步）或 query。
// 这条件不挑剔到「必须含 .png」，因为很多 CDN 图片 URL 无扩展名。
// 同源相对路径：跟后端 isSafeAvatarValue 一致，允许 "/xxx" 但拒 "//xxx"
// （后者是协议相对 URL，可能漂到其他 origin）。世界角色 / 预设头像（fixed-world-
// character-presets.ts）落库就是 /api/character-assets/foo.svg 这种相对路径，
// 且 AvatarChip.resolveAvatarSource 也走 resolveAppMediaUrl 拼前缀正常展示。
// 客户端不识别会让这类用户打开「更换头像」就看到错误条「需要是 http/https」，
// 但实际他们的头像渲染正常——明显的客户端校验跟服务端 / 实际渲染口径打架。
function isRelativeAvatarPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function looksLikePreviewableImageUrl(value: string): boolean {
  if (!value) return false;
  if (/^data:image\//i.test(value)) {
    // 跟 checkAvatarUrlInput 同口径：太短的 data URL（光 MIME 头）解码不出像素，
    // preview 也别去尝试，省得 <img> onError → fallback → loadFailed=true 一通副作用。
    return value.length >= MIN_AVATAR_DATA_URL_LENGTH;
  }
  if (isRelativeAvatarPath(value)) {
    // /a 已经够当 path 用，但 / 单独不行
    return value.length > 1;
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  // pathname 至少有一段（"/" 算空），或者带 query 参数
  return parsed.pathname.length > 1 || parsed.search.length > 0;
}

function checkAvatarUrlInput(value: string): UrlInputError {
  if (!value) return null; // 空 = 不打算改，由 canSave 单独 gate
  // 提早判 image data URL：合法 data:image/png;... 走 length gate
  if (/^data:image\//i.test(value)) {
    if (value.length > MAX_AVATAR_INPUT_LENGTH) return "too_large";
    // 太短的 data URL（"data:image/x;,"、空 base64 body 等）肯定不是真图片，
    // 落库后 AvatarChip render 失败回 fallback，用户没线索。先在客户端 gate。
    if (value.length < MIN_AVATAR_DATA_URL_LENGTH) return "data_url_empty";
    return null;
  }
  // 同源相对路径放行（跟后端 isSafeAvatarValue 同 gate）：预设角色头像
  // 经常是 /api/character-assets/foo.svg，旧账号 / 测试脚本设的 owner.avatar
  // 也可能是这种形态。落库后端不挡、AvatarChip 也能渲染，唯独这里挡掉 →
  // 一打开页面错误条钉死，没有任何修复路径（用户想改成正常 URL 也得先看错）。
  if (isRelativeAvatarPath(value)) {
    if (value.length > MAX_AVATAR_INPUT_LENGTH) return "too_large";
    // "/" 单独不能当头像 URL（裸根没文件），跟 looksLikePreviewableImageUrl
    // 的 value.length > 1 对齐——之前接受 "/"、保存后 AvatarChip 走 /api/.../?token
    // 命中根目录 → 不是图片 → fallback。
    if (value.length <= 1) return "missing_path";
    return null;
  }
  // scheme sniff：在 try-parse 前先看冒号前缀。new URL("javascript:alert(1)")
  // 会成功（protocol=javascript:），protocol 检查也会 catch 到，但单独抛
  // "unsafe_scheme" 文案，让用户一眼看出问题不是「URL 格式」而是「这种链接不行」。
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      // data: 已经在上面 image/ 分支放行；这里挡 data:text/... 等非 image data URL
      return "unsafe_scheme";
    }
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(value);
  } catch {
    return "format";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "format";
  }
  if (value.length > MAX_AVATAR_INPUT_LENGTH) return "too_large";
  // 跟 looksLikePreviewableImageUrl 对齐：裸 host（"https://x.com"）pathname
  // 是 "/" 长度 1，search 空 → 不是图片 URL。之前 check 只看 protocol 不看 path，
  // 用户能保存这种 URL：preview 不显示（preview gate 一致挡掉），但 canSave=true
  // 让「完成」绿着；落库后 AvatarChip 走 <img src="https://x.com"> → 拉到 HTML
  // 页 / 重定向 → onError → fallback，用户没线索可查。
  if (parsed.pathname.length <= 1 && parsed.search.length === 0) {
    return "missing_path";
  }
  return null;
}

export function ProfileInfoAvatarPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const queryClient = useQueryClient();

  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  // 用户没自定义过头像时 store.avatar 是打包出来的 default-owner-avatar.svg
  // 资源路径（类似 /assets/default-owner-avatar-xxx.svg）。直接当成"当前 URL"
  // 灌进输入框，用户会看到一串完全无意义的本地资源路径，所以把"等于默认"等
  // 同没设置。
  const hasCustomAvatar = useMemo(
    () => Boolean(avatar) && avatar !== defaultOwnerAvatar,
    [avatar],
  );
  // 之前存过 base64 本地图的用户，第二次打开本页时 avatar 是「data:image/...」
  // 巨型字符串。如果把它当 URL 灌进 TextField，又退化回 Round 1 修掉的卡顿/误改
  // 长串那一套。所以「URL 输入框」只接受真正的 URL，存的是 data URL 时一律把
  // 输入框留空（preview 仍然显示当前头像）。
  // gate 在 hasCustomAvatar 上：Vite 把 default-owner-avatar.svg (3KB <
  // 4KB 默认 inlineLimit) 内联成 data:image/svg+xml,... 后 resolveOwnerAvatar
  // 兜底 "" 时返回它，store.avatar 也会以 data:URL 形式存在。如果不 gate，
  // 从没设过头像的用户也会被判成 storedIsDataUrl=true，让"当前头像已存为本地
  // 图片..."hint 钉死在他们看不到的"自定义头像"上下文里，逻辑反着的。
  const storedIsDataUrl = hasCustomAvatar && avatar.startsWith("data:");
  const initialDraft = hasCustomAvatar && !storedIsDataUrl ? avatar : "";
  // draft 只装「URL」型的取值，pickedLocal 单独存从相册选的 data URL：
  // 之前把 base64 直接塞进 TextField，~1MB 的字符串显示在单行输入框里既看不
  // 清也容易让用户误改一个字符破坏整段 data URL；而且每次输入触发 React 重
  // 渲染都要把这坨字符串过一次 reconciler，明显卡顿。
  const [draft, setDraft] = useState(initialDraft);
  const [pickedLocal, setPickedLocal] = useState<{
    dataUrl: string;
    size: number;
    name: string;
  } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // 用户已经在 URL 输入框里改过 / 已经从相册选过图时，不要被后台 hydrate
  // 把这俩 draft 覆盖回 store 值——会吞用户输入。
  const userTouchedRef = useRef(false);
  // 保存上传中，用户如果手动点了 ← 返回 / 系统硬件 Back 退出本页，此时
  // saveMutation 在 React Query 里仍然继续跑，几秒后 onSuccess 还会调一次
  // goBack——但 navigate 这时是从用户已经退到的页面（如 /profile/info）再
  // 退一格，跳到 /tabs/profile，整个一跳两格的诡异感。用 isMounted ref
  // 在 onSuccess 里 gating，让用户主动退出后不要再被这次保存抢二次导航。
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userTouchedRef.current) {
      setDraft(initialDraft);
      setPickedLocal(null);
    }
  }, [initialDraft]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  const goBack = () =>
    navigateBackOrFallback(
      () => navigate({ to: "/profile/info", replace: true }),
      "/profile/info",
    );

  const trimmed = draft.trim();
  // 优先使用本地选图；没选过 → 才看 URL 输入框
  const valueToSave = pickedLocal?.dataUrl || trimmed;
  // 第三轮新会话 R1：之前 `hasCustomAvatar ? avatar.trim() : ""` 每次 render
  // 都跑一次 trim()——legacy 用户存了 ~1MB data URL 头像、又在 URL 输入框里
  // 边敲边校验时，每个 keystroke 都触发 1MB 字符串 trim()/复制，肉眼可感卡顿。
  // avatar 变化是稀有事件（只有 store hydrate 时），用 useMemo 缓存 trim 结果。
  const baseline = useMemo(
    () => (hasCustomAvatar ? avatar.trim() : ""),
    [hasCustomAvatar, avatar],
  );
  const dirty = valueToSave !== baseline;
  // pickedLocal 是 FileReader 给的 data URL，size 已经被 MAX_AVATAR_BYTES
  // (1MB) 拦过；只有用户手敲 / 粘贴的 draft 才需要校 URL 格式 + 长度。
  const urlInputError: UrlInputError = pickedLocal
    ? null
    : checkAvatarUrlInput(trimmed);
  const canSave = valueToSave.length > 0 && dirty && urlInputError === null;

  // ❗第二轮走查 Round 1 实测：键入 "https://placehold.co/200/png" 触发了
  // 7 次 <img> 网络请求（"https://placehold.co/2" 起每个前缀 pathname.length>1
  // 都满足 looksLikePreviewableImageUrl，每个 keystroke 一次 onError 往返）。
  // 加 300ms debounce：只有用户停下打字 300ms 后才把 trimmed 灌进 previewSrc，
  // 中途敲的半截 URL 不会触发任何加载。pickedLocal（本地选图）走立即路径，因为
  // 它不是从 keystroke 来的，已经是 data URL，加载零成本。
  const [debouncedPreviewSrc, setDebouncedPreviewSrc] = useState<string>("");
  useEffect(() => {
    // pickedLocal 在场时不用 debounce，由下面 previewSrc 优先级直接拿；但要把
    // debouncedPreviewSrc 立即清掉——不清的话，用户「输 URL → 选本地图 → X 清掉」
    // 流程里，pickedLocal 变 null 但 debounced 还停在旧 URL，previewSrc 优先级
    // 第二段会回落到那个 stale URL，preview 短暂闪回旧 URL 才被 300ms 后的另一
    // 次 effect 清掉。
    if (pickedLocal) {
      if (debouncedPreviewSrc !== "") {
        setDebouncedPreviewSrc("");
      }
      return;
    }
    const previewable = looksLikePreviewableImageUrl(trimmed) ? trimmed : "";
    // 已经一致就别白触发 setState
    if (previewable === debouncedPreviewSrc) {
      return;
    }
    // 目标 = "" (用户清空了 URL 或输入了不可预览的半截 URL) → 立即清，不 debounce。
    // debounce 的意义是「敲一半 URL 别去发图片请求」，清空场景没必要等 300ms。
    if (previewable === "") {
      setDebouncedPreviewSrc("");
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedPreviewSrc(previewable);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [trimmed, pickedLocal, debouncedPreviewSrc]);

  const previewSrc =
    pickedLocal?.dataUrl ||
    debouncedPreviewSrc ||
    (hasCustomAvatar ? avatar : defaultOwnerAvatar);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner({ avatar: valueToSave }, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      goBack();
    },
  });

  // 之前没有路径把已存的头像清回默认（系统打包出来的 SVG）：URL 输入框
  // 留空 + 不选图 → valueToSave="" → canSave=false，「完成」按钮永远灰着。
  // 用户哪天后悔自定义头像、想恢复默认，只能输个奇怪的旧 URL 顶一下，体验
  // 很糟。加一个独立的「恢复默认头像」入口，hasCustomAvatar 才显示，独立
  // mutation 单发 avatar:""，绕开 valueToSave gating。
  const resetMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner({ avatar: "" }, baseUrl);
      queryClient.setQueryData(["world-owner", baseUrl], owner);
      hydrateOwner(owner);
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      goBack();
    },
  });
  // FileReader 异步 readAsDataURL 期间：pickedLocal 还是 null，draft 还是
  // 旧 URL。如果此刻用户已经把 draft 改成了非旧 baseline、canSave 又是 true
  // （改 URL 又紧接着选图的极端情况），点「完成」会把那个 URL 而不是刚选的图
  // 落库。reader.onload 之后 pickedLocal 才出来、setDraft("") 才执行，但已经
  // 晚了。用一个 isReadingFile 标志在读图期间锁住「完成」/「恢复默认」。
  //
  // 由 inFlightReadersRef 集合驱动：每个进行中的 FileReader 把自己的 pickId
  // 加进集合，onload/onerror 不管 pickId 是否最新都把自己从集合移除。集合
  // 非空就 setIsReadingFile(true)、空了就 setIsReadingFile(false)，避免
  // 「老 reader 因为 pickId mismatch 早退而永远不清状态」的死锁
  // （Round 1 走查实测：用户连点两次「从相册选择」、第二次在 picker 里取消，
  //  第一次的 onload 由于 pickId mismatch 早退、finish() 永不调用，UI 永久
  //  停在「读取中」状态，「完成」「恢复默认」全部 disabled，必须刷新页面才能恢复）。
  const [isReadingFile, setIsReadingFile] = useState(false);
  const inFlightReadersRef = useRef<Set<number>>(new Set());
  const isSaving =
    saveMutation.isPending || resetMutation.isPending || isReadingFile;

  // 防 race：用户连点「从相册选择」两次时，FileReader 是各自独立的，且
  // 不保证 readAsDataURL 完成顺序——大文件 A 先开始读、小文件 B 后开始
  // 读但更快完成，会出现 B 的 onload 先 setPickedLocal(B)、A 的 onload
  // 再 setPickedLocal(A)，最终用户看到 A（实际想要 B）。用一个自增 id 给
  // 每次 pick 编号，onload 时校验是不是最新那次，不是就丢弃 state 写入。
  const latestPickIdRef = useRef(0);

  async function handlePickAvatar() {
    const pickId = ++latestPickIdRef.current;
    const files = await pickImageFiles({ multiple: false });
    if (pickId !== latestPickIdRef.current) return;
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setLocalError(t(msg`图片过大，请压缩到 1MB 以内再试。`));
      return;
    }
    if (file.size === 0) {
      // 0 字节文件多半是相册导出失败、文件损坏。当时不拦的话 FileReader 会
      // 读出 "data:image/...;base64,"（只有 MIME 头没有数据），照样塞进
      // pickedLocal → canSave=true → 用户能保存这个「空头像」，下次进来
      // AvatarChip onError 回落到 fallback；用户以为自己改了头像、profile
      // 里却是 initials，毫无线索可查。
      setLocalError(t(msg`这张图片是空文件，请换一张试试。`));
      return;
    }
    if (!file.type.startsWith("image/")) {
      // <input accept="image/*"> 在多数浏览器只是 hint，桌面版 Safari /
      // 拖拽场景下仍能丢一个 application/pdf / text/plain 进来。FileReader
      // 照读不误，能塞进 pickedLocal 拼出 "data:application/pdf;base64,..."
      // 落库，AvatarChip 当然加载失败回 fallback。跟 chat-composer
      // (line 5592) / compress-chat-background-image (line 18) 同款 MIME 严校。
      setLocalError(t(msg`只能选择图片文件。`));
      return;
    }
    setLocalError(null);
    // 上次保存失败 → 错误 banner 钉死在底部，用户重新选了张图也还挂着——
    // 既看着新选了图、又同时挂着上次保存失败的红字，容易让用户以为新选的
    // 图也已经被尝试保存了。新一次的用户动作意味着「上一次失败的 attempt 翻篇」，
    // reset 两个 mutation 把红字清掉。
    saveMutation.reset();
    resetMutation.reset();
    inFlightReadersRef.current.add(pickId);
    setIsReadingFile(true);
    const reader = new FileReader();
    const finish = () => {
      // 不管 pickId 是否还是最新都必须把自己从集合里移除——只看 pickId 会
      // 让「stale onload」永不清状态、UI 锁死（见上面 inFlightReadersRef 注释）。
      inFlightReadersRef.current.delete(pickId);
      if (inFlightReadersRef.current.size === 0) {
        setIsReadingFile(false);
      }
    };
    reader.onerror = () => {
      // localError 文案只在最新一次失败时显示——stale reader 的 onerror 不
      // 该把用户当前正在读的新文件的错误覆盖掉，也不该在没有"当前活动文件"
      // 时弹出过时错误。
      if (pickId === latestPickIdRef.current) {
        setLocalError(t(msg`读取图片失败，请换一张试试。`));
      }
      finish();
    };
    reader.onload = () => {
      if (pickId === latestPickIdRef.current) {
        const result = reader.result;
        if (typeof result === "string") {
          userTouchedRef.current = true;
          setPickedLocal({ dataUrl: result, size: file.size, name: file.name });
          // 3rd-R1 走查：之前这里 setDraft("") 把 URL 输入框清空。看似 cleanup（pickedLocal
          // 在场时 URL 输入框是隐藏的，清不清没视觉差），但 X 取消选图后 draft 已经被改成
          // ""——上一轮 W2R2.1 才补 setDraft(initialDraft) 让 X 回到"初始状态"。但这条恢复
          // 链有 bug：如果用户进页前 stored avatar 是 URL_A，打开页面后又把 URL 输入框改成
          // URL_B，然后点「从相册选择」选了张图、又点 X 取消——用户期望看到自己刚刚输入的
          // URL_B，但实际回到 URL_A，自己手敲的 URL 被吞了。
          // 改法：reader.onload 不再动 draft，pickedLocal 在场时 URL 输入框只是被 gate
          // 隐藏；clearPickedLocal 也不再动 draft，X 真正意义上只「撤销选图」而不会回滚
          // 任何文字输入。两条路径都不动 draft，少一份状态耦合。
        }
      }
      finish();
    };
    reader.readAsDataURL(file);
  }

  function clearPickedLocal() {
    setPickedLocal(null);
    setLocalError(null);
    // 3rd-R1 走查：之前这里还 reset userTouchedRef=false + setDraft(initialDraft)
    // 配合 reader.onload 里的 setDraft("") 做"X 真正意义上取消"的恢复链。但实际
    // 上 reader.onload 把 draft 写成 "" 这一步就是 bug——若用户在选图前手敲过
    // URL_B，X 后会被 setDraft(initialDraft=URL_A) 覆盖，user typing 丢失。
    // 现在 reader.onload 已不再动 draft，pickedLocal 在场时 URL 输入框被 gate
    // 隐藏但 draft 值仍是用户上次输入的值，X 后 URL 输入框重新显示，自然回到
    // 用户敲到一半的形态。所以这里不需要任何 draft / userTouched 复位，X 只
    // 单纯"撤销选图"，不回滚 URL 输入框文本。saveMutation/resetMutation.reset()
    // 保留，让上一次 attempt 的 error banner 翻篇（跟 onChange / handlePickAvatar
    // 同款 reset）。
    saveMutation.reset();
    resetMutation.reset();
  }

  if (isDesktopLayout) {
    return null;
  }

  // 跟 name / signature 页同款：先用 translateAppErrorCode 把后端 AppError
  // 翻译到当前 locale；命中 LEGACY_ERROR / 未知 code 才退回 raw message。
  // resetMutation 跟 saveMutation 同途同 backend，复用同一份翻译。
  // 走查 R1：非 ApiRequestError 分支走 describeRequestError，让 "Failed to fetch" /
  // 5xx / SyntaxError 在 en/ja/ko 下也是本地化文案。
  function translateMutationError(err: unknown): string | null {
    if (isApiRequestError(err)) {
      return translateAppErrorCode(err) ?? err.message;
    }
    return err instanceof Error ? describeRequestError(err) : null;
  }
  const errorMessage =
    localError ??
    (saveMutation.isError
      ? translateMutationError(saveMutation.error)
      : resetMutation.isError
        ? translateMutationError(resetMutation.error)
        : null);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`更换头像`)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
        rightActions={
          <button
            type="button"
            disabled={!canSave || isSaving}
            onClick={() => {
              // R3 走查：用户先点「恢复默认头像」失败 → resetMutation.isError；
              // 接着选张图点「完成」，errorMessage 优先级里 saveMutation 排第一，
              // 但 reset 那条错误还挂着 → 用户看 banner 仍是旧 reset 错误（甚至
              // 中间夹一帧 save 成功的瞬间），新 attempt 不出新结果。点开新 attempt
              // 先把对面 mutation 的错误清掉，banner 始终反映「当前这次操作」。
              resetMutation.reset();
              saveMutation.mutate();
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              !canSave || isSaving
                ? "text-[color:var(--text-dim)]"
                : "text-[#07c160] active:bg-black/[0.05]",
            )}
          >
            {saveMutation.isPending ? t(msg`保存中`) : t(msg`完成`)}
          </button>
        }
      />

      <div className="mt-1 flex flex-col items-center gap-2 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-6">
        <AvatarChip
          // username 没 hydrate 出来时之前传裸 "avatar"，AvatarChip alt / aria-label
          // 直出英文给非中文用户也不会本地化；这里跟 profile-info-page 同款走
          // i18n 文案 "世界主人"。
          name={username?.trim() || t(msg`世界主人`)}
          src={previewSrc}
          size="xl"
        />
        <div className="text-[11px] text-[color:var(--text-muted)]">
          {t(msg`点击下方更换`)}
        </div>
      </div>

      {pickedLocal ? (
        <div className="mt-2 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
              <ImagePlus size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                {pickedLocal.name || t(msg`本地图片`)}
              </div>
              <div
                className="mt-0.5 text-[11px] text-[color:var(--text-muted)]"
                data-i18n-skip="true"
              >
                {formatBytes(pickedLocal.size)}
              </div>
            </div>
            <button
              type="button"
              disabled={isSaving}
              onClick={clearPickedLocal}
              aria-label={t(msg`清除已选图片`)}
              // h-7 w-7（28×28）触摸点比 Apple HIG 44pt 最低线还小一大截，
              // 真机上点击 X 经常戳到旁边的文件名行甚至不响应。把视觉保留小
              // 巧的同时，用 -mr-2 / 同级 padding 把可点击区域撑到 44px 宽，
              // 视觉上 X 仍居右、不占用文件名行。
              // disabled={isSaving}: save/reset 期间禁掉，跟同页其它控件保持一致。
              className="relative -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors active:bg-black/[0.05] disabled:opacity-50 disabled:active:bg-transparent"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
          <div className="mb-1.5 text-[11px] font-medium text-[color:var(--text-secondary)]">
            {t(msg`图片地址`)}
          </div>
          <TextField
            // type="url"：iOS Safari / 系统键盘会切到 URL 模式（自带 .com /
            // / 键、关掉首字母大写和拼写校正），跟「粘贴图片 URL」的语义对齐。
            // 没有外层 <form>，所以 type=url 不会触发浏览器默认表单校验拦住
            // 提交；只是键盘改 layout。auto-capitalize/correct 都关，URL 不
            // 该被改写。
            type="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            value={draft}
            disabled={isSaving}
            onChange={(event) => {
              userTouchedRef.current = true;
              setDraft(event.target.value);
              setLocalError(null);
              // 用户已经动手改新的 URL，意味着上一次保存失败这件事翻篇了，把
              // 红字 banner 清掉，免得新尝试还挂着旧 attempt 的失败说明。
              saveMutation.reset();
              resetMutation.reset();
            }}
            onKeyDown={(event) => {
              // 跟 profile-info-name-page 同款：粘完 URL 习惯性按回车直接
              // submit，外面没 <form> 不会自动触发；手动接一下，可保存就走
              // saveMutation。
              // isComposing：URL 框理论上不开 IME，但中文桌面输入法在英文场景
              // 偶尔会切到拼音模式（用户没注意），半截输入按 Enter 同样可能误触；
              // 跟 name 页保持一致 gate 不开销也几乎为零。
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Enter" && canSave && !isSaving) {
                event.preventDefault();
                // 跟「完成」按钮同步：清掉 reset 的旧错误，确保 banner 反映这次保存。
                resetMutation.reset();
                saveMutation.mutate();
              }
            }}
            enterKeyHint="done"
            placeholder={t(msg`粘贴图片 URL 或留空`)}
            // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
            // tap 一下输入框整页抖一下。
            className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[16px] shadow-none focus:translate-y-0 disabled:bg-[color:var(--bg-canvas)] disabled:text-[color:var(--text-muted)]"
          />
          {storedIsDataUrl ? (
            <div className="mt-2 text-[11px] leading-4 text-[color:var(--text-muted)]">
              {t(msg`当前头像已存为本地图片。粘贴新 URL 或重新选择都会替换它。`)}
            </div>
          ) : null}
          {trimmed && urlInputError === "format" ? (
            <div className="mt-2 text-[11px] leading-4 text-[#92400e]">
              {t(msg`需要是 http/https 开头的合法图片链接。`)}
            </div>
          ) : null}
          {trimmed && urlInputError === "unsafe_scheme" ? (
            <div className="mt-2 text-[11px] leading-4 text-[#92400e]">
              {t(msg`只支持 http/https 图片链接，或 data:image/ 开头的图片数据。`)}
            </div>
          ) : null}
          {trimmed && urlInputError === "too_large" ? (
            <div className="mt-2 text-[11px] leading-4 text-[#92400e]">
              {t(msg`粘贴的图片超过 2MB 上限，请压缩或换个 URL。`)}
            </div>
          ) : null}
          {trimmed && urlInputError === "data_url_empty" ? (
            <div className="mt-2 text-[11px] leading-4 text-[#92400e]">
              {t(msg`图片数据不完整或为空，请检查后再粘贴。`)}
            </div>
          ) : null}
          {trimmed && urlInputError === "missing_path" ? (
            <div className="mt-2 text-[11px] leading-4 text-[#92400e]">
              {t(msg`图片链接需要带路径（如 /avatar.png），裸域名不是图片地址。`)}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-2 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            void handlePickAvatar();
          }}
          // 保存进行中（按钮文案变「保存中」）但「从相册选择」还能点：用户点
          // 完「完成」后趁着上传那几秒又选了张图，结果 save success → goBack
          // 把页面退回 /profile/info，新选的图被一起带走没机会落库——用户白
          // 选一遍且毫无提示。同样的窗口 URL 输入框也照理 disable，下面 TextField
          // disabled={isSaving}。
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60 disabled:active:bg-transparent"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.10)] text-[#15803d]">
            <ImagePlus size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] text-[color:var(--text-primary)]">
              {t(msg`从相册选择`)}
            </div>
            <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
              {t(msg`图片大小不超过 1MB`)}
            </div>
          </div>
        </button>
      </div>

      {hasCustomAvatar ? (
        <div className="mt-2 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              // R3 走查同款：清 saveMutation 的旧错误，避免点完「恢复默认」
              // banner 还挂着上次「完成」失败的红字让用户搞不清当前 attempt
              // 的状态。
              saveMutation.reset();
              resetMutation.mutate();
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60 disabled:active:bg-transparent"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(148,163,184,0.16)] text-[color:var(--text-secondary)]">
              <RotateCcw size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-[color:var(--text-primary)]">
                {resetMutation.isPending
                  ? t(msg`正在恢复…`)
                  : t(msg`恢复默认头像`)}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                {t(msg`清掉自定义头像，换回系统默认。`)}
              </div>
            </div>
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        // role="alert"：保存失败 / picker 报错时通知屏幕阅读器立即朗读；
        // 视觉上的红字 banner 跟它一起出现，sighted 用户也不漏。
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[10px] border border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.96)] px-3 py-2 text-[12px] leading-5 text-[color:var(--state-danger-text)]"
        >
          {errorMessage}
        </div>
      ) : null}
    </AppPage>
  );
}
