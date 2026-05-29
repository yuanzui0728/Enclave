import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

/**
 * 赛博分身「数字镜像」全身像。光感写意风：半透明紫调人物轮廓 + 轮廓发光 +
 * 缓慢呼吸缩放 + 上浮的数据微粒。颜色全走 var(--brand-*)，随页面
 * data-appearance 自动切日/夜紫调；运动靠 index.css 里的 yj-cyber-* keyframes，
 * 系统「减少动态效果」时自动停在稳定态。male 用男像，其余（female/other/未填）
 * 一律回退女像。
 */
type FigureGender = "male" | "female" | "other" | "" | null | undefined;

export function CyberAvatarFigure({
  gender,
  className,
}: {
  gender?: FigureGender;
  className?: string;
}) {
  const t = useRuntimeTranslator();
  const isMale = gender === "male";
  return (
    <svg
      viewBox="0 0 240 320"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={t(msg`赛博分身`)}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="yjCyberAuraGrad" cx="50%" cy="46%" r="55%">
          <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.85" />
          <stop offset="55%" stopColor="var(--brand-secondary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--brand-secondary)" stopOpacity="0" />
        </radialGradient>
        {/* 身形渐变全程走紫：顶端用 secondary（亮紫），中段 primary，底部
            secondary 淡出。绝不用 --brand-accent —— 夜间 accent 是金色，会让
            头/上身整片镶金，失去「数字镜像」的紫调通透感（accent 的「点一下」
            只留给 MoteField 的数据微粒）。 */}
        <linearGradient id="yjCyberBodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-secondary)" stopOpacity="0.95" />
          <stop offset="45%" stopColor="var(--brand-primary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--brand-secondary)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="yjCyberSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter
          id="yjCyberGlow"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          {/* 用 primary 而非 accent 发光：夜间 accent 是金色，会让人物镶一圈橙边，
              失去「数字镜像」的紫调通透感。glow/描边走紫，accent 只在身形顶端点一下。 */}
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="7"
            floodColor="var(--brand-primary)"
            floodOpacity="0.45"
          />
        </filter>
      </defs>

      {/* 呼吸光晕 */}
      <circle
        className="yj-cyber-aura"
        cx="120"
        cy="150"
        r="108"
        fill="url(#yjCyberAuraGrad)"
      />

      {/* 人物主体（整体缓慢呼吸） */}
      <g className="yj-cyber-breathe" filter="url(#yjCyberGlow)">
        {isMale ? <MaleBody /> : <FemaleBody />}
      </g>

      {/* 数据微粒：环绕身形错峰上浮 */}
      <MoteField />
    </svg>
  );
}

function FemaleBody() {
  return (
    <g
      fill="url(#yjCyberBodyGrad)"
      stroke="var(--brand-secondary)"
      strokeWidth="1.3"
      strokeOpacity="0.85"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* 长发（背景层，贴头垂落两侧到胸前，低 opacity 做前后景层次） */}
      <path
        d="M101 54C99 28 141 28 139 54C147 84 150 120 142 156C139 134 136 110 131 90C129 76 126 68 120 68C114 68 111 76 109 90C104 110 101 134 98 156C90 120 93 84 101 54Z"
        fillOpacity="0.42"
        strokeOpacity="0.5"
      />
      {/* 头（小而匀称，约全高 1/7） */}
      <ellipse cx="120" cy="54" rx="17" ry="21" />
      {/* 身段：纤颈 → 溜肩 → 收腰 → A-line 长裙（一笔流畅曲线） */}
      <path d="M113 74C110 82 104 88 96 94C90 98 86 104 88 116C92 140 100 158 104 176C96 200 80 250 64 298Q120 312 176 298C160 250 144 200 136 176C140 158 148 140 152 116C154 104 150 98 144 94C136 88 130 82 127 74C124 80 116 80 113 74Z" />
      {/* 左侧斜向柔光高光 */}
      <path
        d="M104 96C95 104 90 118 90 140C97 124 103 110 110 100C107 98 105 97 104 96Z"
        fill="url(#yjCyberSheen)"
        stroke="none"
      />
    </g>
  );
}

function MaleBody() {
  return (
    <g
      fill="url(#yjCyberBodyGrad)"
      stroke="var(--brand-secondary)"
      strokeWidth="1.3"
      strokeOpacity="0.85"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* 短发（贴头薄冠） */}
      <path
        d="M101 52C99 32 141 32 139 52C135 42 129 38 120 38C111 38 105 42 101 52Z"
        fillOpacity="0.55"
        strokeOpacity="0.55"
      />
      {/* 头 */}
      <ellipse cx="120" cy="54" rx="17" ry="20" />
      {/* 身段：纤颈 → 宽肩收腰躯干 → 修长双腿（中缝分割） */}
      <path d="M113 73C108 81 100 86 92 92C84 96 80 104 82 116C86 140 96 160 100 182L98 196C96 230 94 270 92 300C92 306 100 306 102 300C106 264 110 220 116 196L120 196L124 196C130 220 134 264 138 300C140 306 148 306 148 300C146 270 144 230 142 196L140 182C144 160 154 140 158 116C160 104 156 96 148 92C140 86 132 81 127 73C124 79 116 79 113 73Z" />
      {/* 左侧斜向柔光高光 */}
      <path
        d="M100 96C91 104 87 118 89 138C95 122 101 108 108 100C105 98 103 97 100 96Z"
        fill="url(#yjCyberSheen)"
        stroke="none"
      />
    </g>
  );
}

/** 散布在身形周围、错峰上浮的数据微粒。 */
function MoteField() {
  const motes: Array<{
    cx: number;
    cy: number;
    r: number;
    delay: number;
    square?: boolean;
  }> = [
    { cx: 52, cy: 120, r: 2.4, delay: 0 },
    { cx: 190, cy: 96, r: 1.8, delay: 1.1, square: true },
    { cx: 70, cy: 200, r: 2, delay: 2.3 },
    { cx: 184, cy: 176, r: 2.6, delay: 0.7 },
    { cx: 44, cy: 168, r: 1.6, delay: 3.4, square: true },
    { cx: 198, cy: 230, r: 2, delay: 1.8 },
    { cx: 60, cy: 250, r: 1.8, delay: 2.9 },
    { cx: 178, cy: 132, r: 1.5, delay: 4.1 },
    { cx: 96, cy: 60, r: 1.6, delay: 3.1, square: true },
    { cx: 150, cy: 52, r: 2, delay: 1.4 },
  ];
  return (
    <g fill="var(--brand-accent)">
      {motes.map((m, i) =>
        m.square ? (
          <rect
            key={i}
            className="yj-cyber-mote"
            x={m.cx - m.r}
            y={m.cy - m.r}
            width={m.r * 2}
            height={m.r * 2}
            rx={m.r * 0.4}
            style={{ animationDelay: `${m.delay}s` }}
          />
        ) : (
          <circle
            key={i}
            className="yj-cyber-mote"
            cx={m.cx}
            cy={m.cy}
            r={m.r}
            style={{ animationDelay: `${m.delay}s` }}
          />
        ),
      )}
    </g>
  );
}
