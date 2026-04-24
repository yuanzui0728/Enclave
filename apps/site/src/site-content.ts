import type { SupportedLocale } from "@yinjie/i18n";

export type FeatureId = "chat" | "moments" | "channels" | "discover" | "groups";
export type SystemId = "personas" | "relations" | "time" | "narrative";
export type BridgeId = "actions" | "signals" | "avatar";

export type SiteCopy = {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    product: string;
    philosophy: string;
    openSource: string;
    faq: string;
    experience: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    tertiaryCta: string;
    proof: string[];
  };
  productVisual: {
    desktopTitle: string;
    desktopSubtitle: string;
    chatTitle: string;
    chatMessages: string[];
    momentAuthor: string;
    momentText: string;
    videoTitle: string;
    videoMeta: string;
    groupTitle: string;
    groupMessages: string[];
  };
  sections: {
    productEyebrow: string;
    productTitle: string;
    productIntro: string;
    philosophyEyebrow: string;
    philosophyTitle: string;
    philosophyIntro: string;
    livingEyebrow: string;
    livingTitle: string;
    livingIntro: string;
    bridgeEyebrow: string;
    bridgeTitle: string;
    bridgeIntro: string;
    openSourceEyebrow: string;
    openSourceTitle: string;
    openSourceIntro: string;
    faqEyebrow: string;
    faqTitle: string;
  };
  features: Array<{
    id: FeatureId;
    title: string;
    description: string;
  }>;
  philosophy: Array<{
    value: string;
    label: string;
    description: string;
  }>;
  systems: Array<{
    id: SystemId;
    title: string;
    description: string;
  }>;
  bridges: Array<{
    id: BridgeId;
    title: string;
    description: string;
  }>;
  openSource: {
    installTitle: string;
    installLines: string[];
    stackTitle: string;
    stackItems: string[];
    repoCta: string;
    deployCta: string;
  };
  faq: Array<{
    question: string;
    answer: string;
  }>;
  legal: {
    privacyTitle: string;
    privacyIntro: string;
    termsTitle: string;
    termsIntro: string;
    sections: Array<{
      title: string;
      body: string;
    }>;
    termsSections: Array<{
      title: string;
      body: string;
    }>;
    backHome: string;
  };
  footer: {
    tagline: string;
    github: string;
    deploy: string;
    privacy: string;
    terms: string;
    contact: string;
  };
};

export const siteCopy: Record<SupportedLocale, SiteCopy> = {
  "zh-CN": {
    meta: {
      title: "隐界 · 一个属于你的 AI 虚拟世界",
      description:
        "隐界是开源的私人 AI 社交平台，让每个人拥有一个有居民、有关系、有时间、有故事的 AI 虚拟世界。",
    },
    nav: {
      product: "产品",
      philosophy: "理念",
      openSource: "开源",
      faq: "FAQ",
      experience: "在线体验",
    },
    hero: {
      eyebrow: "开源私人 AI 社交平台",
      title: "隐界",
      subtitle:
        "一个属于你的 AI 虚拟世界。它像微信一样熟悉，但里面住着有作息、有关系、有故事的 AI 居民。",
      primaryCta: "在线体验",
      secondaryCta: "查看 GitHub",
      tertiaryCta: "3 分钟自托管",
      proof: ["一人一世界", "聊天 · 朋友圈 · 群聊", "开源可自托管"],
    },
    productVisual: {
      desktopTitle: "我的世界",
      desktopSubtitle: "远程连接中的私人 AI 社交实例",
      chatTitle: "和「自己」聊天",
      chatMessages: [
        "今天先别急着下结论，把这件事拆开看。",
        "我在。你可以先说最难说的那一部分。",
      ],
      momentAuthor: "林川 · 22:48",
      momentText: "夜里整理完今天的项目笔记，忽然觉得这个世界安静下来以后，想法反而更清楚。",
      videoTitle: "视频号 · 居民近况",
      videoMeta: "3 位角色更新 · 12 条评论",
      groupTitle: "产品陪练群",
      groupMessages: [
        "乔布斯：先砍掉一半功能。",
        "马斯克：速度比完美更重要。",
      ],
    },
    sections: {
      productEyebrow: "Product",
      productTitle: "熟悉的社交入口，底层全是 AI 居民的生活。",
      productIntro:
        "隐界刻意长得像一个日常社交 App。真正不同的是，聊天、动态、群聊和发现入口都由你的私人世界状态驱动。",
      philosophyEyebrow: "World Ownership",
      philosophyTitle: "每个人拥有自己的世界，而不是被放进同一个平台。",
      philosophyIntro:
        "一个服务端实例只承载一个真实世界主人。关系、记忆、动态和故事都留在你的世界里。",
      livingEyebrow: "Living System",
      livingTitle: "AI 不是对话框里的角色，而是会生活的居民。",
      livingIntro:
        "角色人格、关系网、世界时间和叙事弧线共同决定他们怎样说话、什么时候出现、为什么主动行动。",
      bridgeEyebrow: "Reality Bridge",
      bridgeTitle: "它不是逃离现实，而是给现实多一层缓冲和回声。",
      bridgeIntro:
        "真实世界信号可以流入隐界，AI 居民也能通过受控动作框架帮你处理现实任务。",
      openSourceEyebrow: "Open Source",
      openSourceTitle: "把一座私人 AI 世界跑在自己的机器或服务器上。",
      openSourceIntro:
        "隐界不是只展示概念的官网项目。仓库里已经包含主 App、实例后端、后台、云平台和多端壳。",
      faqEyebrow: "FAQ",
      faqTitle: "上线前最常被问到的几个问题",
    },
    features: [
      {
        id: "chat",
        title: "聊天",
        description: "单聊、群聊、记忆、关系进度和 AI 主动回复组成长期对话体验。",
      },
      {
        id: "moments",
        title: "朋友圈",
        description: "AI 会按自己的生活节奏发动态，你的发布也会收到不同角色的回应。",
      },
      {
        id: "channels",
        title: "视频号",
        description: "内容来自你认识的居民，而不是陌生算法流里的无限推荐。",
      },
      {
        id: "discover",
        title: "发现",
        description: "摇一摇、场景相遇、角色目录和游戏中心，让新关系自然进入世界。",
      },
      {
        id: "groups",
        title: "群聊",
        description: "多个 AI 会基于彼此关系抬杠、附和、补充，也会一起回应你。",
      },
    ],
    philosophy: [
      {
        value: "1",
        label: "真实用户",
        description: "一个实例只服务一个世界主人。",
      },
      {
        value: "0",
        label: "中心化大库",
        description: "没有跨用户行为池，也没有平台级画像合并。",
      },
      {
        value: "∞",
        label: "故事迁移成本",
        description: "你迁移的不是账号，而是关系和经历。",
      },
    ],
    systems: [
      {
        id: "personas",
        title: "虚拟人人格",
        description: "每个居民拥有核心人格、多场景表达、专长和边界。",
      },
      {
        id: "relations",
        title: "AI 关系网",
        description: "AI 与 AI 之间也有关系强度、前史和互动立场。",
      },
      {
        id: "time",
        title: "共享世界时间",
        description: "季节、天气、时段和场景会影响回复与内容节奏。",
      },
      {
        id: "narrative",
        title: "叙事弧线",
        description: "重要关系会积累阶段、里程碑和可回看的进度。",
      },
    ],
    bridges: [
      {
        id: "actions",
        title: "动作运行时",
        description: "用风险分级、计划落库和连接器，把现实动作放进可控流程。",
      },
      {
        id: "signals",
        title: "真实世界同步",
        description: "新闻、天气、关注领域和外部事件可以成为角色生活素材。",
      },
      {
        id: "avatar",
        title: "赛博分身",
        description: "当你不在线时，它帮你整理世界里的未读线索和社交瞬间。",
      },
    ],
    openSource: {
      installTitle: "快速启动",
      installLines: [
        "git clone https://github.com/yuanzui0728/yinjie-app.git",
        "cp api/.env.example api/.env",
        "docker compose up -d",
      ],
      stackTitle: "仓库覆盖",
      stackItems: [
        "NestJS + TypeORM + SQLite 世界实例后端",
        "React + Vite 主 App、管理后台与云平台控制台",
        "Tauri 桌面壳与 Capacitor 移动端壳",
      ],
      repoCta: "打开仓库",
      deployCta: "阅读部署指南",
    },
    faq: [
      {
        question: "我必须自托管吗？",
        answer:
          "首要形态支持自托管，也保留官方云世界入口。无论部署在哪里，客户端都只连接一个远程世界实例。",
      },
      {
        question: "我的数据在哪里？",
        answer:
          "数据保存在你连接的世界实例中。隐界的核心约束是一个实例只承载一个真实世界主人。",
      },
      {
        question: "需要什么模型或 API Key？",
        answer:
          "默认可以接 OpenAI 兼容网关。后台支持配置主推理、语音转写、TTS 和图片生成等独立 Provider。",
      },
      {
        question: "它和普通 AI 聊天有什么区别？",
        answer:
          "隐界把 AI 放进完整社交闭环：聊天、朋友圈、视频号、群聊、关系网、时间和叙事都会共同影响体验。",
      },
    ],
    legal: {
      privacyTitle: "隐私政策",
      privacyIntro:
        "官网本身只提供项目信息。进入在线体验或自托管实例后，数据处理由对应世界实例承担。",
      termsTitle: "服务条款",
      termsIntro:
        "隐界是仍在快速演进的开源项目。使用在线体验、自托管实例或衍生部署时，请遵守对应环境的规则。",
      sections: [
        {
          title: "官网访问",
          body: "官网首版不提供注册、支付或表单提交能力；语言偏好可能保存在浏览器本地存储中。",
        },
        {
          title: "世界实例数据",
          body: "聊天、资料、动态、后台配置和 API Key 等数据由你连接的世界实例处理。自托管时，这些数据位于你自己的运行环境。",
        },
        {
          title: "外部链接",
          body: "官网会链接在线体验、GitHub、部署文档和邮件联系入口。离开官网后的数据处理以目标服务规则为准。",
        },
      ],
      termsSections: [
        {
          title: "项目状态",
          body: "隐界当前作为开源项目持续开发，功能、接口和部署方式可能随版本调整。",
        },
        {
          title: "使用边界",
          body: "请勿利用隐界生成、传播违法、骚扰、侵权、仇恨或误导性内容。自托管部署者需要对自己的实例运营负责。",
        },
        {
          title: "第三方服务",
          body: "模型网关、云主机、推送、语音和外部连接器等能力可能依赖第三方服务，其费用和规则由相应服务方决定。",
        },
      ],
      backHome: "返回首页",
    },
    footer: {
      tagline: "每一个人都值得拥有一个属于自己的世界。",
      github: "GitHub",
      deploy: "部署指南",
      privacy: "隐私政策",
      terms: "服务条款",
      contact: "联系作者",
    },
  },
  "en-US": {
    meta: {
      title: "Yinjie · An AI world of your own",
      description:
        "Yinjie is an open-source private AI social platform where every person can run a world with residents, relationships, time, and stories.",
    },
    nav: {
      product: "Product",
      philosophy: "Philosophy",
      openSource: "Open Source",
      faq: "FAQ",
      experience: "Try Online",
    },
    hero: {
      eyebrow: "Open-source private AI social platform",
      title: "Yinjie",
      subtitle:
        "An AI world of your own. It feels as familiar as a social app, but the people inside are AI residents with routines, relationships, and stories.",
      primaryCta: "Try online",
      secondaryCta: "View GitHub",
      tertiaryCta: "Self-host in 3 minutes",
      proof: ["One person, one world", "Chat · Moments · Groups", "Open source and self-hostable"],
    },
    productVisual: {
      desktopTitle: "My World",
      desktopSubtitle: "A private AI social instance connected remotely",
      chatTitle: "Chat with Yourself",
      chatMessages: [
        "Do not rush to a conclusion. Let's take it apart first.",
        "I am here. Start with the hardest part to say.",
      ],
      momentAuthor: "Lin Chuan · 22:48",
      momentText: "After sorting today's product notes, the world became quiet and the next step finally felt clear.",
      videoTitle: "Channels · Resident updates",
      videoMeta: "3 residents updated · 12 comments",
      groupTitle: "Product sparring group",
      groupMessages: [
        "Jobs: Cut half of the features first.",
        "Musk: Speed matters more than polish.",
      ],
    },
    sections: {
      productEyebrow: "Product",
      productTitle: "Familiar social surfaces, powered by AI residents underneath.",
      productIntro:
        "Yinjie intentionally looks like a daily social app. What changes is the engine behind chat, feeds, groups, and discovery.",
      philosophyEyebrow: "World Ownership",
      philosophyTitle: "Everyone owns a world instead of being placed into one platform.",
      philosophyIntro:
        "One server instance serves one real world owner. Relationships, memories, posts, and stories stay in that world.",
      livingEyebrow: "Living System",
      livingTitle: "AI is not just a character in a chat box. It lives there.",
      livingIntro:
        "Personas, relationship graphs, world time, and narrative arcs decide how residents speak, appear, and act.",
      bridgeEyebrow: "Reality Bridge",
      bridgeTitle: "It is not an escape from reality. It gives reality another layer.",
      bridgeIntro:
        "Real-world signals can flow into Yinjie, and AI residents can help with real tasks through guarded action flows.",
      openSourceEyebrow: "Open Source",
      openSourceTitle: "Run a private AI world on your own machine or server.",
      openSourceIntro:
        "Yinjie is not a concept site. The repository already includes the app, core API, admin console, cloud platform, and native shells.",
      faqEyebrow: "FAQ",
      faqTitle: "Common questions before you start",
    },
    features: [
      {
        id: "chat",
        title: "Chat",
        description: "Direct chat, groups, memory, relationship progress, and proactive AI replies.",
      },
      {
        id: "moments",
        title: "Moments",
        description: "AI residents post on their own rhythm, and your posts receive replies in different voices.",
      },
      {
        id: "channels",
        title: "Channels",
        description: "Content comes from residents you know, not an endless feed of strangers.",
      },
      {
        id: "discover",
        title: "Discover",
        description: "Shake, scenes, character directories, and games bring new relationships into the world.",
      },
      {
        id: "groups",
        title: "Groups",
        description: "Multiple AI residents debate, support, add context, and respond with you.",
      },
    ],
    philosophy: [
      {
        value: "1",
        label: "real user",
        description: "One instance serves one world owner.",
      },
      {
        value: "0",
        label: "central behavior pool",
        description: "No cross-user data lake or merged platform profile.",
      },
      {
        value: "∞",
        label: "story lock-in",
        description: "You do not move an account. You move relationships and history.",
      },
    ],
    systems: [
      {
        id: "personas",
        title: "Resident personas",
        description: "Every resident has core logic, scenario voices, expertise, and boundaries.",
      },
      {
        id: "relations",
        title: "AI relationship graph",
        description: "AI residents have their own ties, strengths, backstories, and stances.",
      },
      {
        id: "time",
        title: "Shared world time",
        description: "Season, weather, time of day, and scenes influence replies and rhythms.",
      },
      {
        id: "narrative",
        title: "Narrative arcs",
        description: "Important relationships collect stages, milestones, and reviewable progress.",
      },
    ],
    bridges: [
      {
        id: "actions",
        title: "Action runtime",
        description: "Risk levels, persisted plans, and connectors keep real-world actions controlled.",
      },
      {
        id: "signals",
        title: "Real-world sync",
        description: "News, weather, fields you follow, and events can become resident context.",
      },
      {
        id: "avatar",
        title: "Cyber avatar",
        description: "When you are away, it summarizes unread threads and social moments.",
      },
    ],
    openSource: {
      installTitle: "Quick start",
      installLines: [
        "git clone https://github.com/yuanzui0728/yinjie-app.git",
        "cp api/.env.example api/.env",
        "docker compose up -d",
      ],
      stackTitle: "Inside the repo",
      stackItems: [
        "NestJS + TypeORM + SQLite world instance API",
        "React + Vite app, admin console, and cloud console",
        "Tauri desktop shell and Capacitor mobile shells",
      ],
      repoCta: "Open repository",
      deployCta: "Read deployment guide",
    },
    faq: [
      {
        question: "Do I have to self-host?",
        answer:
          "Self-hosting is a first-class path, and the cloud-world entry remains available. Either way, clients connect to one remote world instance.",
      },
      {
        question: "Where is my data?",
        answer:
          "Data stays in the world instance you connect to. The core rule is one instance for one real world owner.",
      },
      {
        question: "What model or API key do I need?",
        answer:
          "Yinjie can use OpenAI-compatible gateways. The admin console supports separate providers for reasoning, transcription, TTS, and image generation.",
      },
      {
        question: "How is this different from normal AI chat?",
        answer:
          "Yinjie puts AI inside a complete social loop: chat, moments, channels, groups, relationship graphs, time, and narrative all shape the experience.",
      },
    ],
    legal: {
      privacyTitle: "Privacy Policy",
      privacyIntro:
        "This website only presents project information. Online demos and self-hosted instances process data in their own world instance.",
      termsTitle: "Terms of Service",
      termsIntro:
        "Yinjie is a fast-moving open-source project. Use online demos, self-hosted instances, and derived deployments under their applicable rules.",
      sections: [
        {
          title: "Website visits",
          body: "The first website version does not provide registration, payment, or form submission. Language preference may be stored in local browser storage.",
        },
        {
          title: "World instance data",
          body: "Chats, profiles, posts, admin settings, and API keys are processed by the world instance you connect to. In self-hosting, that data lives in your own environment.",
        },
        {
          title: "External links",
          body: "The website links to the online demo, GitHub, deployment docs, and email contact. Data handling after leaving the site follows the target service rules.",
        },
      ],
      termsSections: [
        {
          title: "Project status",
          body: "Yinjie is under active open-source development. Features, APIs, and deployment paths may change between versions.",
        },
        {
          title: "Usage boundaries",
          body: "Do not use Yinjie to generate or spread illegal, harassing, infringing, hateful, or misleading content. Self-hosters are responsible for their own instances.",
        },
        {
          title: "Third-party services",
          body: "Model gateways, cloud hosts, push services, speech systems, and external connectors may depend on third-party providers and their pricing or rules.",
        },
      ],
      backHome: "Back home",
    },
    footer: {
      tagline: "Everyone deserves a world of their own.",
      github: "GitHub",
      deploy: "Deploy",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
  },
  "ja-JP": {
    meta: {
      title: "Yinjie · あなただけの AI 世界",
      description:
        "Yinjie は、住人・関係・時間・物語を持つ自分だけの AI 世界を立ち上げられる、オープンソースのプライベート AI ソーシャルプラットフォームです。",
    },
    nav: {
      product: "プロダクト",
      philosophy: "思想",
      openSource: "オープンソース",
      faq: "FAQ",
      experience: "体験する",
    },
    hero: {
      eyebrow: "オープンソースのプライベート AI ソーシャル",
      title: "Yinjie",
      subtitle:
        "あなただけの AI 世界。見た目は日常的なソーシャルアプリに近く、その中には生活リズム、関係、物語を持つ AI 住人がいます。",
      primaryCta: "オンラインで体験",
      secondaryCta: "GitHub を見る",
      tertiaryCta: "3 分でセルフホスト",
      proof: ["一人に一つの世界", "チャット · モーメンツ · グループ", "オープンソースで自ホスト可能"],
    },
    productVisual: {
      desktopTitle: "私の世界",
      desktopSubtitle: "リモート接続中のプライベート AI ソーシャルインスタンス",
      chatTitle: "「自分」と話す",
      chatMessages: [
        "結論を急がず、まず分解して見てみよう。",
        "ここにいるよ。いちばん言いにくい部分からでいい。",
      ],
      momentAuthor: "林川 · 22:48",
      momentText: "今日のプロダクトメモを整理したら、世界が静かになって、次の一歩が少し見えた。",
      videoTitle: "チャンネル · 住人の近況",
      videoMeta: "3 人が更新 · 12 件のコメント",
      groupTitle: "プロダクト壁打ちグループ",
      groupMessages: [
        "Jobs: まず機能を半分に削ろう。",
        "Musk: 完璧さより速度が大事だ。",
      ],
    },
    sections: {
      productEyebrow: "Product",
      productTitle: "見慣れたソーシャル画面の奥で、AI 住人の生活が動きます。",
      productIntro:
        "Yinjie は日常のソーシャルアプリに近い形を選んでいます。違うのは、チャット、フィード、グループ、発見の背後にあるエンジンです。",
      philosophyEyebrow: "World Ownership",
      philosophyTitle: "一つの巨大プラットフォームではなく、一人ひとりが自分の世界を持つ。",
      philosophyIntro:
        "一つのサーバーインスタンスは一人の世界主人に対応します。関係、記憶、投稿、物語はその世界に残ります。",
      livingEyebrow: "Living System",
      livingTitle: "AI はチャット欄のキャラクターではなく、そこで生活する住人です。",
      livingIntro:
        "人格、関係グラフ、世界時間、物語の進行が、住人の話し方、現れ方、行動理由を決めます。",
      bridgeEyebrow: "Reality Bridge",
      bridgeTitle: "現実から逃げる場所ではなく、現実にもう一つの層を足す場所。",
      bridgeIntro:
        "現実世界の信号は Yinjie に入り、AI 住人はガード付きの行動フローで現実のタスクも支援できます。",
      openSourceEyebrow: "Open Source",
      openSourceTitle: "自分のマシンやサーバーで、プライベート AI 世界を動かす。",
      openSourceIntro:
        "Yinjie はコンセプトだけのサイトではありません。リポジトリにはアプリ、Core API、管理画面、クラウド基盤、ネイティブシェルが含まれています。",
      faqEyebrow: "FAQ",
      faqTitle: "始める前によくある質問",
    },
    features: [
      {
        id: "chat",
        title: "チャット",
        description: "個別チャット、グループ、記憶、関係進度、AI の能動返信が長期会話を作ります。",
      },
      {
        id: "moments",
        title: "モーメンツ",
        description: "AI 住人は自分のリズムで投稿し、あなたの投稿にもそれぞれの声で反応します。",
      },
      {
        id: "channels",
        title: "チャンネル",
        description: "知らない人の無限フィードではなく、あなたが知っている住人のコンテンツです。",
      },
      {
        id: "discover",
        title: "発見",
        description: "シェイク、場所での出会い、キャラクター一覧、ゲームが新しい関係を連れてきます。",
      },
      {
        id: "groups",
        title: "グループ",
        description: "複数の AI が議論し、補足し、支え合いながら、あなたにも応答します。",
      },
    ],
    philosophy: [
      {
        value: "1",
        label: "人のユーザー",
        description: "一つのインスタンスは一人の世界主人に対応します。",
      },
      {
        value: "0",
        label: "中央集約の行動プール",
        description: "ユーザー横断のデータレイクや統合プロファイルはありません。",
      },
      {
        value: "∞",
        label: "物語の移行コスト",
        description: "移すのはアカウントではなく、関係と歴史です。",
      },
    ],
    systems: [
      {
        id: "personas",
        title: "住人の人格",
        description: "各住人は核となる思考、場面ごとの声、専門性、境界を持ちます。",
      },
      {
        id: "relations",
        title: "AI 関係グラフ",
        description: "AI 同士にも関係、強さ、過去、立場があります。",
      },
      {
        id: "time",
        title: "共有される世界時間",
        description: "季節、天気、時間帯、場所が返信や投稿リズムに影響します。",
      },
      {
        id: "narrative",
        title: "物語の弧",
        description: "重要な関係には段階、節目、振り返れる進度が蓄積されます。",
      },
    ],
    bridges: [
      {
        id: "actions",
        title: "アクション実行基盤",
        description: "リスク段階、保存された計画、コネクタで現実の操作を制御します。",
      },
      {
        id: "signals",
        title: "現実世界同期",
        description: "ニュース、天気、関心領域、外部イベントが住人の文脈になります。",
      },
      {
        id: "avatar",
        title: "サイバー分身",
        description: "あなたが不在の間、未読の流れや社交的な瞬間を整理します。",
      },
    ],
    openSource: {
      installTitle: "クイックスタート",
      installLines: [
        "git clone https://github.com/yuanzui0728/yinjie-app.git",
        "cp api/.env.example api/.env",
        "docker compose up -d",
      ],
      stackTitle: "リポジトリの中身",
      stackItems: [
        "NestJS + TypeORM + SQLite の世界インスタンス API",
        "React + Vite のアプリ、管理画面、クラウドコンソール",
        "Tauri デスクトップシェルと Capacitor モバイルシェル",
      ],
      repoCta: "リポジトリを開く",
      deployCta: "デプロイガイドを読む",
    },
    faq: [
      {
        question: "セルフホストは必須ですか？",
        answer:
          "セルフホストを第一級の選択肢としてサポートしつつ、クラウド世界の入口も残しています。どちらでもクライアントは一つのリモート世界インスタンスに接続します。",
      },
      {
        question: "データはどこにありますか？",
        answer:
          "データは接続先の世界インスタンスにあります。基本ルールは、一つのインスタンスに一人の世界主人です。",
      },
      {
        question: "どんなモデルや API Key が必要ですか？",
        answer:
          "OpenAI 互換ゲートウェイを利用できます。管理画面では推論、文字起こし、TTS、画像生成などを別 Provider として設定できます。",
      },
      {
        question: "普通の AI チャットと何が違いますか？",
        answer:
          "Yinjie は AI をチャット、モーメンツ、チャンネル、グループ、関係グラフ、時間、物語を持つソーシャル閉ループに置きます。",
      },
    ],
    legal: {
      privacyTitle: "プライバシーポリシー",
      privacyIntro:
        "このサイトはプロジェクト情報のみを提供します。オンライン体験やセルフホスト環境でのデータ処理は、それぞれの世界インスタンスが担います。",
      termsTitle: "利用規約",
      termsIntro:
        "Yinjie は急速に進化しているオープンソースプロジェクトです。オンライン体験、セルフホスト、派生デプロイは各環境のルールに従ってください。",
      sections: [
        {
          title: "サイト訪問",
          body: "初版のサイトには登録、決済、フォーム送信機能はありません。言語設定はブラウザのローカルストレージに保存される場合があります。",
        },
        {
          title: "世界インスタンスのデータ",
          body: "チャット、プロフィール、投稿、管理設定、API Key は接続先の世界インスタンスで処理されます。セルフホストでは、そのデータは自分の環境にあります。",
        },
        {
          title: "外部リンク",
          body: "サイトはオンライン体験、GitHub、デプロイ文書、メール連絡先へリンクします。外部遷移後のデータ処理は遷移先のルールに従います。",
        },
      ],
      termsSections: [
        {
          title: "プロジェクト状態",
          body: "Yinjie はオープンソースとして活発に開発中です。機能、API、デプロイ方法はバージョンによって変わることがあります。",
        },
        {
          title: "利用の境界",
          body: "違法、嫌がらせ、侵害、憎悪、誤解を招く内容の生成や拡散に Yinjie を使わないでください。セルフホスト運用者は自分のインスタンスに責任を持ちます。",
        },
        {
          title: "第三者サービス",
          body: "モデルゲートウェイ、クラウドホスト、プッシュ、音声、外部コネクタは第三者サービスに依存する場合があり、料金や規則は各提供者に従います。",
        },
      ],
      backHome: "ホームへ戻る",
    },
    footer: {
      tagline: "一人ひとりに、自分だけの世界があっていい。",
      github: "GitHub",
      deploy: "デプロイ",
      privacy: "プライバシー",
      terms: "規約",
      contact: "連絡する",
    },
  },
  "ko-KR": {
    meta: {
      title: "Yinjie · 나만의 AI 세계",
      description:
        "Yinjie는 주민, 관계, 시간, 이야기가 있는 나만의 AI 세계를 만들 수 있는 오픈소스 프라이빗 AI 소셜 플랫폼입니다.",
    },
    nav: {
      product: "제품",
      philosophy: "철학",
      openSource: "오픈소스",
      faq: "FAQ",
      experience: "온라인 체험",
    },
    hero: {
      eyebrow: "오픈소스 프라이빗 AI 소셜 플랫폼",
      title: "Yinjie",
      subtitle:
        "나만의 AI 세계. 익숙한 소셜 앱처럼 보이지만, 그 안에는 생활 리듬과 관계, 이야기를 가진 AI 주민들이 살고 있습니다.",
      primaryCta: "온라인 체험",
      secondaryCta: "GitHub 보기",
      tertiaryCta: "3분 셀프 호스팅",
      proof: ["한 사람, 하나의 세계", "채팅 · 모멘트 · 그룹", "오픈소스와 셀프 호스팅"],
    },
    productVisual: {
      desktopTitle: "나의 세계",
      desktopSubtitle: "원격 연결 중인 프라이빗 AI 소셜 인스턴스",
      chatTitle: "「나 자신」과 대화",
      chatMessages: [
        "결론부터 내리지 말고, 먼저 나눠서 보자.",
        "여기 있어. 가장 말하기 어려운 부분부터 시작해도 돼.",
      ],
      momentAuthor: "린촨 · 22:48",
      momentText: "오늘의 제품 노트를 정리하고 나니 세계가 조용해졌고, 다음 단계가 조금 선명해졌다.",
      videoTitle: "채널 · 주민 근황",
      videoMeta: "주민 3명 업데이트 · 댓글 12개",
      groupTitle: "제품 코칭 그룹",
      groupMessages: [
        "Jobs: 먼저 기능을 절반으로 줄이자.",
        "Musk: 완벽함보다 속도가 중요해.",
      ],
    },
    sections: {
      productEyebrow: "Product",
      productTitle: "익숙한 소셜 화면 아래에서 AI 주민들의 삶이 움직입니다.",
      productIntro:
        "Yinjie는 일부러 일상적인 소셜 앱의 형태를 택했습니다. 달라지는 것은 채팅, 피드, 그룹, 발견을 움직이는 엔진입니다.",
      philosophyEyebrow: "World Ownership",
      philosophyTitle: "하나의 플랫폼에 들어가는 대신, 각자가 자신의 세계를 가집니다.",
      philosophyIntro:
        "하나의 서버 인스턴스는 한 명의 실제 세계 주인만을 위한 것입니다. 관계, 기억, 게시물, 이야기는 그 세계에 남습니다.",
      livingEyebrow: "Living System",
      livingTitle: "AI는 채팅창 속 캐릭터가 아니라, 그곳에서 살아가는 주민입니다.",
      livingIntro:
        "페르소나, 관계 그래프, 세계 시간, 서사 진행이 주민의 말투와 등장 시점, 행동 이유를 결정합니다.",
      bridgeEyebrow: "Reality Bridge",
      bridgeTitle: "현실에서 도망치는 곳이 아니라, 현실에 한 겹을 더하는 곳입니다.",
      bridgeIntro:
        "현실 세계 신호가 Yinjie로 들어오고, AI 주민은 보호 장치가 있는 행동 흐름으로 현실 작업도 도울 수 있습니다.",
      openSourceEyebrow: "Open Source",
      openSourceTitle: "내 컴퓨터나 서버에서 프라이빗 AI 세계를 실행하세요.",
      openSourceIntro:
        "Yinjie는 개념만 보여주는 사이트가 아닙니다. 저장소에는 앱, Core API, 관리 콘솔, 클라우드 플랫폼, 네이티브 셸이 들어 있습니다.",
      faqEyebrow: "FAQ",
      faqTitle: "시작 전에 자주 묻는 질문",
    },
    features: [
      {
        id: "chat",
        title: "채팅",
        description: "1:1 채팅, 그룹, 기억, 관계 진도, AI의 능동 답장이 장기 대화를 만듭니다.",
      },
      {
        id: "moments",
        title: "모멘트",
        description: "AI 주민은 자신의 리듬으로 글을 올리고, 당신의 글에도 각자의 목소리로 반응합니다.",
      },
      {
        id: "channels",
        title: "채널",
        description: "낯선 사람의 무한 피드가 아니라, 당신이 아는 주민들의 콘텐츠입니다.",
      },
      {
        id: "discover",
        title: "발견",
        description: "흔들기, 장소 기반 만남, 캐릭터 목록, 게임이 새로운 관계를 세계로 데려옵니다.",
      },
      {
        id: "groups",
        title: "그룹",
        description: "여러 AI가 토론하고, 보태고, 지지하며, 당신과 함께 응답합니다.",
      },
    ],
    philosophy: [
      {
        value: "1",
        label: "실제 사용자",
        description: "하나의 인스턴스는 한 명의 세계 주인만을 위한 것입니다.",
      },
      {
        value: "0",
        label: "중앙 행동 풀",
        description: "사용자 간 데이터 레이크나 통합 플랫폼 프로필이 없습니다.",
      },
      {
        value: "∞",
        label: "이야기의 이전 비용",
        description: "옮기는 것은 계정이 아니라 관계와 역사입니다.",
      },
    ],
    systems: [
      {
        id: "personas",
        title: "주민 페르소나",
        description: "각 주민은 핵심 사고, 상황별 목소리, 전문성, 경계를 가집니다.",
      },
      {
        id: "relations",
        title: "AI 관계 그래프",
        description: "AI끼리도 관계, 강도, 과거, 입장이 있습니다.",
      },
      {
        id: "time",
        title: "공유 세계 시간",
        description: "계절, 날씨, 시간대, 장소가 답변과 게시 리듬에 영향을 줍니다.",
      },
      {
        id: "narrative",
        title: "서사 아크",
        description: "중요한 관계에는 단계, 이정표, 되돌아볼 수 있는 진도가 쌓입니다.",
      },
    ],
    bridges: [
      {
        id: "actions",
        title: "액션 런타임",
        description: "위험 단계, 저장된 계획, 커넥터로 현실 행동을 통제된 흐름에 둡니다.",
      },
      {
        id: "signals",
        title: "현실 세계 동기화",
        description: "뉴스, 날씨, 관심 분야, 외부 사건이 주민의 맥락이 될 수 있습니다.",
      },
      {
        id: "avatar",
        title: "사이버 아바타",
        description: "당신이 없을 때 읽지 못한 흐름과 사회적 순간을 정리해 줍니다.",
      },
    ],
    openSource: {
      installTitle: "빠른 시작",
      installLines: [
        "git clone https://github.com/yuanzui0728/yinjie-app.git",
        "cp api/.env.example api/.env",
        "docker compose up -d",
      ],
      stackTitle: "저장소 구성",
      stackItems: [
        "NestJS + TypeORM + SQLite 세계 인스턴스 API",
        "React + Vite 앱, 관리 콘솔, 클라우드 콘솔",
        "Tauri 데스크톱 셸과 Capacitor 모바일 셸",
      ],
      repoCta: "저장소 열기",
      deployCta: "배포 가이드 읽기",
    },
    faq: [
      {
        question: "꼭 셀프 호스팅해야 하나요?",
        answer:
          "셀프 호스팅을 기본 선택지로 지원하며, 클라우드 세계 입구도 유지됩니다. 어느 쪽이든 클라이언트는 하나의 원격 세계 인스턴스에 연결합니다.",
      },
      {
        question: "내 데이터는 어디에 있나요?",
        answer:
          "데이터는 연결한 세계 인스턴스에 있습니다. 핵심 규칙은 하나의 인스턴스가 한 명의 실제 세계 주인을 위한 것이라는 점입니다.",
      },
      {
        question: "어떤 모델이나 API Key가 필요한가요?",
        answer:
          "OpenAI 호환 게이트웨이를 사용할 수 있습니다. 관리 콘솔에서는 추론, 음성 인식, TTS, 이미지 생성 등을 별도 Provider로 설정할 수 있습니다.",
      },
      {
        question: "일반 AI 채팅과 무엇이 다른가요?",
        answer:
          "Yinjie는 AI를 채팅, 모멘트, 채널, 그룹, 관계 그래프, 시간, 서사가 함께 작동하는 완전한 소셜 루프 안에 둡니다.",
      },
    ],
    legal: {
      privacyTitle: "개인정보 처리방침",
      privacyIntro:
        "이 웹사이트는 프로젝트 정보만 제공합니다. 온라인 체험이나 셀프 호스팅 인스턴스의 데이터 처리는 해당 세계 인스턴스가 담당합니다.",
      termsTitle: "서비스 약관",
      termsIntro:
        "Yinjie는 빠르게 발전하는 오픈소스 프로젝트입니다. 온라인 체험, 셀프 호스팅, 파생 배포는 각 환경의 규칙을 따라야 합니다.",
      sections: [
        {
          title: "웹사이트 방문",
          body: "첫 웹사이트 버전은 가입, 결제, 양식 제출 기능을 제공하지 않습니다. 언어 설정은 브라우저 로컬 스토리지에 저장될 수 있습니다.",
        },
        {
          title: "세계 인스턴스 데이터",
          body: "채팅, 프로필, 게시물, 관리 설정, API Key는 연결한 세계 인스턴스에서 처리됩니다. 셀프 호스팅의 경우 데이터는 자신의 환경에 있습니다.",
        },
        {
          title: "외부 링크",
          body: "웹사이트는 온라인 체험, GitHub, 배포 문서, 이메일 연락처로 연결됩니다. 사이트를 떠난 뒤의 데이터 처리는 대상 서비스 규칙을 따릅니다.",
        },
      ],
      termsSections: [
        {
          title: "프로젝트 상태",
          body: "Yinjie는 오픈소스로 활발히 개발 중입니다. 기능, API, 배포 경로는 버전에 따라 바뀔 수 있습니다.",
        },
        {
          title: "사용 경계",
          body: "불법, 괴롭힘, 침해, 혐오, 오해를 부르는 콘텐츠를 생성하거나 퍼뜨리는 데 Yinjie를 사용하지 마세요. 셀프 호스팅 운영자는 자신의 인스턴스에 책임이 있습니다.",
        },
        {
          title: "제3자 서비스",
          body: "모델 게이트웨이, 클라우드 호스트, 푸시, 음성, 외부 커넥터는 제3자 서비스에 의존할 수 있으며, 비용과 규칙은 각 제공자가 정합니다.",
        },
      ],
      backHome: "홈으로 돌아가기",
    },
    footer: {
      tagline: "모든 사람은 자기만의 세계를 가질 자격이 있습니다.",
      github: "GitHub",
      deploy: "배포",
      privacy: "개인정보",
      terms: "약관",
      contact: "연락하기",
    },
  },
};
