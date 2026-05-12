// Append new translations to site PO files (idempotent: skips msgid already present).
// Tuples: [zh-CN, en-US, ja-JP, ko-KR]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/ps/claude/yinjie-app/packages/i18n/catalogs/site";

const TRANSLATIONS = [
  // ===== Commit 6: philosophy / cross-platform / self-host / FAQ =====
  ["理念", "Philosophy", "理念", "철학"],
  ["一个属于你的世界，从架构开始", "Your own world — architected from the ground up", "あなたのための世界、設計から始まる", "당신만의 세계, 설계 단계부터"],
  ["隐界不是一个共享的 chatbot 服务，而是一套可独立部署的 AI 社交基础设施。每个实例只为一个人存在。", "Enclave is not a shared chatbot service. It is AI social infrastructure you can self-deploy — one instance per person.", "エンクレイブは共有のチャットボットではなく、自社デプロイ可能な AI ソーシャル基盤です。インスタンスはひとりにひとつ。", "엔클레이브는 공유 챗봇 서비스가 아니라, 자체 배포 가능한 AI 소셜 인프라입니다. 인스턴스는 사용자당 하나입니다."],
  ["一人一世界", "One person, one world", "ひとりにひとつの世界", "한 사람당 하나의 세계"],
  ["独立实例架构，数据真正属于用户。隐私不靠承诺，靠架构层保障。", "Independent instances mean the data is genuinely yours. Privacy is enforced by architecture, not promises.", "独立インスタンス構成。データは確かにあなたのもの。プライバシーは約束ではなくアーキテクチャで守られます。", "독립 인스턴스 구조. 데이터는 진정으로 당신의 것이며, 개인정보는 약속이 아니라 아키텍처로 보호됩니다."],
  ["数据自主", "Data sovereignty", "データ主権", "데이터 주권"],
  ["全部数据可导入导出，可整包迁移；离开隐界，世界还是你的。", "All data is importable and exportable; you can take the whole world with you when you leave.", "すべてのデータは入出力・パッケージ移行が可能。エンクレイブを離れても、世界はあなたのものです。", "모든 데이터는 가져오기·내보내기 및 통째 이전이 가능합니다. 엔클레이브를 떠나도 세계는 그대로 당신의 것입니다."],
  ["AI 平权", "Equal access to AI", "AI のアクセス平等", "AI 평등권"],
  ["高质量对话不应被少数平台垄断。隐界让任何人都能拥有自己的 AI 居民。", "High-quality conversation shouldn't be monopolized by a handful of platforms. Enclave lets anyone host their own AI residents.", "質の高い会話は一部のプラットフォームに独占されるべきではありません。エンクレイブは、誰もが自分の AI 住人を持てるようにします。", "양질의 대화가 소수 플랫폼의 전유물이어선 안 됩니다. 엔클레이브는 누구나 자신의 AI 주민을 가질 수 있게 합니다."],
  ["不取代现实", "Doesn't replace reality", "現実を置き換えない", "현실을 대체하지 않는다"],
  ["白天有同事、有老板，晚上回到隐界有心理咨询师；它补全你的情感维度，而不是替代真实关系。", "By day you have colleagues and bosses; by night you have a counselor in Enclave. It complements your emotional life — it doesn't replace real relationships.", "昼は同僚や上司がいて、夜にはエンクレイブに相談相手がいる。現実の関係を置き換えるのではなく、感情の幅を広げます。", "낮에는 동료와 상사가 있고, 밤에는 엔클레이브에 상담사가 있습니다. 현실의 관계를 대체하지 않고 감정의 결을 더해 줍니다."],
  ["移动随手用，桌面深度用", "Casual on mobile, deep on desktop", "モバイルでは手軽に、デスクトップでは深く", "모바일은 가볍게, 데스크톱은 깊게"],
  ["apps/app 是一份 React 19 + TypeScript 代码库，同时跑在 Web、iOS / Android Capacitor 壳、以及 Tauri 桌面壳上。", "apps/app is one React 19 + TypeScript codebase that runs on Web, iOS/Android (Capacitor), and Tauri desktop shells.", "apps/app は一つの React 19 + TypeScript コードベースで、Web、iOS / Android（Capacitor）、Tauri デスクトップシェルで動きます。", "apps/app 은 하나의 React 19 + TypeScript 코드베이스로, Web, iOS / Android (Capacitor), Tauri 데스크톱 셸에서 모두 동작합니다."],
  ["移动端", "Mobile", "モバイル", "모바일"],
  ["Web / iOS / Android", "Web / iOS / Android", "Web / iOS / Android", "Web / iOS / Android"],
  ["桌面端", "Desktop", "デスクトップ", "데스크톱"],
  ["Tauri · Windows / macOS / Linux", "Tauri · Windows / macOS / Linux", "Tauri · Windows / macOS / Linux", "Tauri · Windows / macOS / Linux"],
  ["聊天工作区（多窗口）", "Chat workspace (multi-window)", "チャットワークスペース（マルチウィンドウ）", "채팅 워크스페이스(멀티 윈도우)"],
  ["聊天文件中心", "Chat file center", "チャットファイル管理", "채팅 파일 센터"],
  ["聊天记录全局搜索", "Global chat search", "全文チャット検索", "전역 채팅 검색"],
  ["视频号直播伴侣", "Channels live companion", "ライブ配信コンパニオン", "라이브 컴패니언"],
  ["原生托盘 / 锁屏", "Native tray & lock screen", "ネイティブトレイ / ロック画面", "네이티브 트레이 / 잠금 화면"],
  ["克隆、起 docker、起飞", "Clone it, docker compose up, lift off", "クローン → docker compose up → 完了", "클론, docker compose up, 시작"],
  ["完全开源，MIT 许可。无任何外部 SaaS 依赖；一台机器、一条 docker compose up，几分钟就能跑起来。", "Fully open source, MIT licensed. No external SaaS dependency — one machine, one docker compose up, ready in minutes.", "完全オープンソース、MIT ライセンス。外部 SaaS への依存はなく、一台のマシンと docker compose up で数分で起動します。", "완전 오픈소스, MIT 라이선스. 외부 SaaS 의존이 없으며, 한 대의 머신에서 docker compose up 으로 몇 분 만에 실행됩니다."],
  ["克隆仓库", "Clone the repo", "リポジトリをクローン", "리포지토리 클론"],
  ["一键启动", "One-line bring-up", "ワンコマンド起動", "한 줄로 실행"],
  ["浏览器访问", "Open in your browser", "ブラウザでアクセス", "브라우저에서 열기"],
  ["查看完整自部署指南", "Read the full self-host guide", "セルフホストガイドを読む", "자체 호스팅 가이드 보기"],
  ["在 GitHub 上 Star", "Star on GitHub", "GitHub でスター", "GitHub 에서 Star"],
  ["常见问题", "FAQ", "よくある質問", "자주 묻는 질문"],
  ["FAQ", "FAQ", "FAQ", "FAQ"],
  ["没找到你的问题？欢迎邮件联系我们。", "Don't see your question? Drop us an email.", "ご質問が見つかりませんか？お気軽にメールでお問い合わせください。", "찾으시는 질문이 없나요? 언제든 이메일로 문의해 주세요."],
  ["隐界真的开源吗？", "Is Enclave really open source?", "エンクレイブは本当にオープンソースですか？", "엔클레이브는 정말 오픈소스인가요?"],
  ["是。整个 monorepo（apps/app、apps/desktop、cloud-api、admin、site 等）都在 GitHub 上以 MIT 许可证开放，欢迎自部署、二次开发、商用。", "Yes. The entire monorepo (apps/app, apps/desktop, cloud-api, admin, site, etc.) is on GitHub under the MIT license — feel free to self-host, fork, or build commercial offerings on top of it.", "はい。monorepo 全体（apps/app、apps/desktop、cloud-api、admin、site など）は MIT ライセンスで GitHub に公開されています。セルフホスト、改変、商用利用を歓迎します。", "네. 모든 monorepo (apps/app, apps/desktop, cloud-api, admin, site 등)가 MIT 라이선스로 GitHub 에 공개되어 있으며, 자체 호스팅 / 포크 / 상용화 모두 환영합니다."],
  ["我的数据保存在哪里？", "Where is my data stored?", "私のデータはどこに保存されますか？", "내 데이터는 어디에 저장되나요?"],
  ["保存在你自己部署的实例里。隐界采用一人一世界的独立实例架构，没有中心化的数据后台，没有跨用户的数据合并；你拥有数据所有权。", "On the instance you deploy yourself. Enclave uses an instance-per-person architecture — there is no centralized backend and no cross-user data fusion. You own the data outright.", "ご自身が立てたインスタンスに保存されます。エンクレイブはひとりにひとつのインスタンス構成で、中央集権的なデータベースやユーザー横断のマージはありません。データの所有権はあなたにあります。", "직접 배포한 인스턴스에 저장됩니다. 엔클레이브는 한 사람당 하나의 인스턴스 구조로 운영되며, 중앙 데이터 백엔드도 사용자 간 데이터 병합도 없습니다. 데이터 소유권은 전적으로 사용자에게 있습니다."],
  ["用什么模型？能换模型吗？", "Which models are supported? Can I swap them?", "どのモデルが使えますか？切り替えはできますか？", "어떤 모델을 지원하나요? 교체할 수 있나요?"],
  ["默认与多家主流模型供应商兼容（OpenAI 兼容协议），可在订阅页或自部署配置里切换；本地模型同样支持，只要服务能开 OpenAI 兼容的 HTTP 接口。", "Out of the box we support major model providers via the OpenAI-compatible protocol, switchable from the subscription page or your self-host config. Local models work too — anything that exposes an OpenAI-compatible HTTP endpoint.", "デフォルトで OpenAI 互換プロトコルにより主要なモデルプロバイダーに対応し、サブスク画面またはセルフホスト設定で切り替え可能。OpenAI 互換 HTTP エンドポイントを提供すればローカルモデルも利用できます。", "기본적으로 OpenAI 호환 프로토콜을 통해 주요 모델 제공자를 지원하며, 구독 화면 혹은 자체 호스팅 설정에서 전환할 수 있습니다. OpenAI 호환 HTTP 엔드포인트를 제공하면 로컬 모델도 그대로 사용할 수 있습니다."],
  ["可以离线使用吗？", "Can I use it offline?", "オフラインで使えますか？", "오프라인 사용이 가능한가요?"],
  ["本地客户端（Tauri 桌面壳、Capacitor 移动壳）可离线浏览历史；AI 对话需要联网到模型服务（无论你是连云端还是本地模型）。", "The local clients (Tauri desktop shell, Capacitor mobile shell) can browse history offline. AI conversation needs network access to a model service — whether it's a cloud provider or your local one.", "ローカルクライアント（Tauri デスクトップ、Capacitor モバイル）は履歴をオフラインで閲覧できます。AI 会話はクラウド／ローカルを問わずモデルサービスへの通信が必要です。", "로컬 클라이언트(Tauri 데스크톱, Capacitor 모바일)는 오프라인에서도 기록을 볼 수 있습니다. AI 대화는 클라우드든 로컬이든 모델 서비스와의 통신이 필요합니다."],
  ["需要付费吗？", "Do I need to pay?", "料金はかかりますか？", "유료인가요?"],
  ["自部署完全免费。如果选择官方托管的云服务，按使用量付费——账单与你接入的模型供应商绑定，没有中间溢价。", "Self-hosting is free. If you opt into our managed cloud, you pay for usage — billed directly through the model provider you connect, without middle-man markup.", "セルフホストは完全無料です。マネージドクラウドを選んだ場合は従量課金で、接続したモデルプロバイダーへ直接請求され、中間マージンはありません。", "자체 호스팅은 완전 무료입니다. 매니지드 클라우드를 선택하시면 사용량 기반으로 청구되며, 연결한 모델 제공자에게 직접 결제되고 중간 마진은 없습니다."],
  ["支持中英日韩之外的语言吗？", "What about languages beyond zh / en / ja / ko?", "中・英・日・韓以外の言語にも対応していますか？", "중·영·일·한 외 다른 언어도 지원하나요?"],
  ["界面目前支持简中 / English / 日本語 / 한국어。AI 角色对话本身不限语种，跟着模型能力走。", "The UI currently ships in zh-CN / English / 日本語 / 한국어. The AI conversation itself is language-agnostic — it goes wherever the model can.", "UI は現在 zh-CN / English / 日本語 / 한국어 に対応。AI 会話自体は言語を問わず、モデルの能力次第です。", "UI 는 현재 zh-CN / English / 日本語 / 한국어 를 지원합니다. AI 대화 자체는 언어에 구애받지 않으며, 모델의 역량을 따릅니다."],
  // ===== Commit 7: download / privacy / terms =====
  ["挑一种最顺手的方式开始用隐界", "Pick the way that fits you best", "あなたに合った形で隐界を始めましょう", "당신에게 가장 잘 맞는 방식으로 엔클레이브를 시작해 보세요"],
  ["桌面端原生封装、网页版即开即用，自部署提供完整自主权。移动端与小程序在路上。", "Native desktop builds, an instant web preview, and full sovereignty via self-hosting. Mobile apps and a WeChat mini-program are on the way.", "ネイティブのデスクトップアプリ、すぐ使える Web 版、自己ホストによる完全な自由。モバイルアプリと WeChat ミニプログラムは準備中です。", "네이티브 데스크톱 빌드, 즉시 사용 가능한 웹 버전, 자체 호스팅을 통한 완전한 자율성. 모바일 앱과 WeChat 미니 프로그램은 준비 중입니다."],
  ["敬请期待", "Coming soon", "近日公開", "출시 예정"],
  ["Windows 桌面端", "Windows Desktop", "Windows デスクトップ", "Windows 데스크톱"],
  ["Tauri 原生封装，附带托盘和锁屏", "Native Tauri build with tray + lock screen", "Tauri ネイティブビルド、トレイ／ロック画面付き", "Tauri 네이티브 빌드, 트레이와 잠금 화면 포함"],
  ["前往 GitHub Releases", "Open GitHub Releases", "GitHub Releases を開く", "GitHub Releases 열기"],
  ["macOS 桌面端", "macOS Desktop", "macOS デスクトップ", "macOS 데스크톱"],
  ["适配 Apple Silicon 与 Intel", "Apple Silicon and Intel builds", "Apple Silicon と Intel に対応", "Apple Silicon 과 Intel 모두 지원"],
  ["网页版（在线试用）", "Web (try online)", "Web 版（オンライン試用）", "웹 버전(온라인 체험)"],
  ["无需安装，直接在浏览器里体验", "No install — try it right in your browser", "インストール不要、ブラウザですぐ体験", "설치 없이 브라우저에서 바로 체험"],
  ["打开网页版", "Open the web app", "Web 版を開く", "웹 앱 열기"],
  ["iOS / Android", "iOS / Android", "iOS / Android", "iOS / Android"],
  ["Capacitor 移动壳，敬请期待", "Capacitor mobile shell — coming soon", "Capacitor モバイルシェル — 近日公開", "Capacitor 모바일 셸 — 출시 예정"],
  ["微信小程序", "WeChat Mini-program", "WeChat ミニプログラム", "WeChat 미니 프로그램"],
  ["适配国内场景，敬请期待", "Tailored for the Chinese market — coming soon", "中国市場向け、近日公開", "중국 시장 맞춤 — 출시 예정"],
  ["自部署（推荐）", "Self-host (recommended)", "セルフホスト（推奨）", "자체 호스팅(권장)"],
  ["克隆仓库、docker compose up，几分钟跑起来", "Clone the repo, docker compose up, running in minutes", "リポジトリをクローンし docker compose up、数分で起動", "리포지토리 클론, docker compose up, 수 분 내 실행"],
  ["查看部署指南", "Read the deploy guide", "デプロイガイドを読む", "배포 가이드 보기"],
  // Privacy
  ["最近更新", "Last updated", "最終更新", "최근 업데이트"],
  ["一、我们的隐私立场", "1. Our privacy stance", "一、当社のプライバシー方針", "1. 개인정보 보호 원칙"],
  ["隐界采用一人一世界的独立实例架构。除非你主动选择官方托管的云服务，否则你的数据保存在你自己部署的实例里，与任何中央服务器无关。", "Enclave runs on an instance-per-person architecture. Unless you opt into our managed cloud, your data lives on the instance you deploy yourself — completely independent of any central server.", "エンクレイブはひとりにひとつのインスタンス構成で動作します。マネージドクラウドを選択しない限り、データはご自身のインスタンス内にのみ保存され、いかなる中央サーバーとも切り離されています。", "엔클레이브는 한 사람당 하나의 인스턴스 구조로 동작합니다. 매니지드 클라우드를 선택하지 않는 한, 데이터는 직접 배포한 인스턴스에만 저장되며 어떤 중앙 서버와도 무관합니다."],
  ["二、自部署用户", "2. Self-hosted users", "二、セルフホストユーザー", "2. 자체 호스팅 사용자"],
  ["你完全控制数据存放位置（本地数据库 / 自有服务器 / 云盘）。隐界不会向第三方发送任何用户数据，除非你显式连接外部模型供应商；此时仅相关对话内容根据你的配置发送给该供应商。", "You decide exactly where data is stored (local database, your own server, your own cloud). Enclave never forwards user data to any third party — except when you explicitly connect an external model provider, at which point only the relevant conversation is sent according to your config.", "データの保管先（ローカル DB／自己サーバー／クラウド）はあなたが完全にコントロールします。外部モデルプロバイダーを明示的に接続した場合を除き、エンクレイブが第三者にユーザーデータを送信することはありません。接続時にも、設定に応じた会話のみが送信されます。", "데이터 저장 위치(로컬 DB / 자체 서버 / 클라우드)는 사용자가 완전히 결정합니다. 외부 모델 제공자를 명시적으로 연결하지 않는 한, 엔클레이브는 어떠한 사용자 데이터도 제3자에게 전송하지 않습니다. 연결 시에는 설정에 따른 대화만 전송됩니다."],
  ["三、托管云服务用户", "3. Managed-cloud users", "三、マネージドクラウドユーザー", "3. 매니지드 클라우드 사용자"],
  ["如选择官方托管，我们仅采集运行所需的最少数据：账号标识、订阅状态、错误堆栈与请求日志。这些数据不会用于广告，也不会与第三方共享，仅用于服务运维与计费。", "If you choose our managed cloud, we collect only the minimum data needed to run the service: account identifier, subscription status, error stack traces, and request logs. We never use this for advertising or share it with third parties — only for ops and billing.", "マネージドクラウドを利用する場合、当社はサービス稼働に必要な最小限のデータ（アカウント識別子、サブスク状態、エラースタック、リクエストログ）のみを収集します。これらは広告に利用せず、第三者にも共有しません。運用・請求のみに使用します。", "매니지드 클라우드를 선택하실 경우, 서비스 운영에 필요한 최소한의 데이터(계정 식별자, 구독 상태, 오류 스택, 요청 로그)만 수집합니다. 광고 목적으로 사용하거나 제3자와 공유하지 않으며, 오직 운영과 결제에만 활용합니다."],
  ["四、模型供应商", "4. Model providers", "四、モデルプロバイダー", "4. 모델 제공자"],
  ["AI 对话内容会按你的配置发送给所选模型供应商（OpenAI、Anthropic、Google、DeepSeek 等，或你自部署的本地模型）。具体数据处理方式请参考各供应商的隐私政策。", "AI conversations are sent — per your configuration — to the model provider you select (OpenAI, Anthropic, Google, DeepSeek, etc., or your self-hosted model). Refer to each provider's privacy policy for specifics.", "AI 会話の内容は、設定に従って選択したモデルプロバイダー（OpenAI、Anthropic、Google、DeepSeek など、またはセルフホストモデル）に送信されます。各プロバイダーのプライバシーポリシーをご参照ください。", "AI 대화 내용은 설정에 따라 선택하신 모델 제공자(OpenAI, Anthropic, Google, DeepSeek 등 또는 자체 호스팅 모델)로 전송됩니다. 처리 방식은 각 제공자의 개인정보 처리방침을 참고하시기 바랍니다."],
  ["五、你的权利", "5. Your rights", "五、あなたの権利", "5. 사용자의 권리"],
  ["你可以随时导出全部数据、迁移到其他实例、永久删除自己的世界。我们不会保留任何无法删除的数据副本。", "You can export all your data, migrate to another instance, or permanently delete your world at any time. We do not retain any copy you cannot delete.", "いつでも全データのエクスポート、他インスタンスへの移行、世界の完全削除が可能です。当社が削除できないコピーを保持することはありません。", "언제든 모든 데이터를 내보내거나 다른 인스턴스로 이전, 또는 자신의 세계를 완전히 삭제할 수 있습니다. 사용자가 삭제할 수 없는 사본은 보관하지 않습니다."],
  ["六、联系我们", "6. Contact", "六、お問い合わせ", "6. 문의"],
  ["有任何隐私相关疑问，请发邮件至 yuanzui0728@gmail.com。", "For privacy questions, email yuanzui0728@gmail.com.", "プライバシーに関するご質問は yuanzui0728@gmail.com までメールでお寄せください。", "개인정보 관련 문의는 yuanzui0728@gmail.com 으로 이메일을 보내주세요."],
  // Terms
  ["一、开源许可", "1. Open-source license", "一、オープンソースライセンス", "1. 오픈소스 라이선스"],
  ["隐界以 MIT 许可证发布。你可以自由使用、修改、分发本项目源代码与产物，包括商业用途，请遵循 MIT 协议中的署名要求。", "Enclave is released under the MIT License. You may freely use, modify, and redistribute the source and artifacts — including commercially — subject to the attribution clause of the MIT License.", "エンクレイブは MIT ライセンスで公開されています。MIT ライセンスの帰属表示を遵守する限り、ソースおよび成果物を自由に使用・改変・再配布できます（商用利用を含む）。", "엔클레이브는 MIT 라이선스로 공개됩니다. MIT 라이선스의 출처 표시 의무를 준수하시는 한, 상용을 포함한 자유로운 사용·수정·재배포가 가능합니다."],
  ["二、合理使用", "2. Acceptable use", "二、適切な利用", "2. 적절한 사용"],
  ["请不要利用隐界从事违反所在国家或地区法律的活动；不要将其用于骚扰、欺诈、传播虚假信息或制造伤害。AI 角色生成的内容由用户负责审阅与判断，不视为隐界开发者的立场或建议。", "Don't use Enclave for activities that break the laws of your jurisdiction. Don't use it for harassment, fraud, disinformation, or to harm others. AI-generated content is the user's responsibility to review — it is not an opinion or recommendation of the Enclave maintainers.", "ご利用地域の法律に違反する活動、嫌がらせ、詐欺、虚偽情報の拡散、他者への加害目的でエンクレイブを利用しないでください。AI が生成するコンテンツの確認・判断はユーザーの責任であり、エンクレイブ開発者の立場や推奨を表すものではありません。", "거주 지역의 법률을 위반하는 활동, 괴롭힘, 사기, 허위 정보 유포, 타인에게 해를 끼치는 목적으로 엔클레이브를 사용하지 마십시오. AI 가 생성한 내용은 사용자가 직접 검토·판단해야 하며, 엔클레이브 개발자의 입장이나 권장 사항이 아닙니다."],
  ["三、订阅与计费", "3. Subscription & billing", "三、サブスクと請求", "3. 구독 및 결제"],
  ["若你选择官方托管的云服务并购买订阅，账单与你接入的模型供应商绑定，按使用量结算。订阅可随时取消，未使用部分按月按比例退还。", "If you subscribe to our managed cloud, billing is tied to the model provider you connect and metered by usage. You can cancel anytime; unused portions are prorated monthly and refunded.", "マネージドクラウドのサブスクをご利用の場合、請求は接続したモデルプロバイダーに紐づき、使用量ベースで計算されます。いつでも解約可能で、未使用分は月割りで返金されます。", "매니지드 클라우드를 구독하실 경우, 결제는 연결한 모델 제공자에 종속되며 사용량 기준으로 산정됩니다. 언제든 해지할 수 있으며, 사용하지 않은 부분은 월 단위로 환불됩니다."],
  ["四、免责声明", "4. Disclaimer", "四、免責事項", "4. 면책 조항"],
  ["本软件按现状提供，不对适销性、特定用途适用性、不侵权或可用性作任何明示或暗示担保。在适用法律允许的最大范围内，作者与贡献者不承担因使用本软件而产生的任何损失。", "The software is provided 'as is' without any warranty of merchantability, fitness for a particular purpose, non-infringement, or availability. To the extent allowed by law, authors and contributors are not liable for any loss arising from use of the software.", "本ソフトウェアは現状のまま提供され、商品性、特定目的への適合性、非侵害性、可用性のいずれも明示・黙示を問わず保証されません。適用法が許す最大限の範囲で、作者および貢献者はソフトウェアの利用により生じた損害について一切責任を負いません。", "본 소프트웨어는 '있는 그대로' 제공되며, 상품성·특정 목적 적합성·비침해성·가용성에 대한 어떠한 명시적·묵시적 보증도 하지 않습니다. 적용 가능한 법률이 허용하는 최대 범위 내에서, 작성자와 기여자는 본 소프트웨어 사용으로 인해 발생하는 손해에 대해 책임지지 않습니다."],
  ["五、变更", "5. Changes", "五、変更", "5. 변경"],
  ["条款可能根据法律法规与产品演进调整，重大变更我们会在仓库与本页公告。", "These terms may evolve with the product and applicable laws; we will announce material changes both in the repo and on this page.", "本規約は法令や製品の発展に応じて改定されることがあります。重要な変更はリポジトリおよび本ページにてお知らせします。", "본 약관은 법령과 제품 발전에 따라 개정될 수 있습니다. 중대한 변경 사항은 리포지토리와 본 페이지에서 공지합니다."],
  ["如对条款有任何疑问，请发邮件至 yuanzui0728@gmail.com。", "For terms questions, email yuanzui0728@gmail.com.", "規約に関するご質問は yuanzui0728@gmail.com までメールでお寄せください。", "약관 관련 문의는 yuanzui0728@gmail.com 으로 이메일을 보내주세요."],
  // ===== SaaS pivot =====
  // Hero
  ["AI 虚拟世界 · 一键开始", "AI virtual world · one-click start", "AI バーチャルワールド · ワンクリックで開始", "AI 가상 세계 · 한 번에 시작"],
  ["免费开始", "Start free", "無料で始める", "무료로 시작"],
  ["了解能做什么", "See what you can do", "できることを見る", "할 수 있는 일 보기"],
  ["私人世界", "Private world", "プライベートワールド", "프라이빗 월드"],
  ["一人一实例", "One instance per person", "ひとりに一つのインスタンス", "한 사람당 하나의 인스턴스"],
  ["多端同步", "Cross-device sync", "マルチデバイス同期", "멀티 디바이스 동기화"],
  ["浏览器 / 桌面 / 手机", "Browser / Desktop / Mobile", "ブラウザ / デスクトップ / モバイル", "브라우저 / 데스크톱 / 모바일"],
  ["注册即用，无需安装", "Sign up and use — no install required", "登録するだけ、インストール不要", "가입 즉시 사용, 설치 불필요"],
  // Capability subtitle
  ["为日常陪伴和深度对话设计的 AI 社交体验，每一项都已在产品中跑通。", "An AI-social experience designed for daily companionship and deep conversations — every capability already shipping.", "日常の寄り添いと深い対話のために設計された AI ソーシャル体験。すべて稼働中の機能です。", "일상의 동반과 깊은 대화를 위해 설계된 AI 소셜 경험. 모두 실제 제품에서 동작합니다."],
  // Multi-platform carousel subtitle
  ["六个核心场景一起看，画面均来自当前线上版本。", "Six core scenes together — every screen straight from the live build.", "6 つのコアシーンを一望。画面はすべて公開中のバージョンから。", "6 가지 핵심 화면을 한자리에. 모든 화면은 라이브 빌드에서 가져왔습니다."],
  // Cross-platform
  ["在浏览器、电脑、手机上都能用，对话和动态实时同步。一个账号，无缝接管。", "Works in your browser, on desktop, and on mobile — conversations and feeds sync in real time. One account, zero friction.", "ブラウザ・デスクトップ・モバイルで使え、会話とフィードはリアルタイム同期。ひとつのアカウントでシームレスに切り替え可能。", "브라우저, 데스크톱, 모바일에서 모두 사용 가능하며 대화와 피드가 실시간 동기화됩니다. 하나의 계정으로 자연스럽게 이어집니다."],
  ["浏览器 / iOS / Android", "Browser / iOS / Android", "ブラウザ / iOS / Android", "브라우저 / iOS / Android"],
  ["Windows / macOS / Linux", "Windows / macOS / Linux", "Windows / macOS / Linux", "Windows / macOS / Linux"],
  // OnePersonWorld principle bodies
  ["每位用户拥有完全独立的世界，互不打扰、互不可见。你的对话只属于你。", "Each user owns a fully independent world — no overlap, no leakage. Your conversations belong to you alone.", "ユーザーごとに完全に独立した世界を持ち、互いに見えず干渉しません。会話はあなただけのもの。", "사용자마다 완전히 독립된 세계를 갖습니다. 서로 간섭하지 않으며, 대화는 오로지 당신의 것입니다."],
  ["全部数据可一键导出，随时带走；不绑定平台，不锁定关系。", "Export all your data with one click and take it with you — no platform lock-in, no relationship lock-in.", "全データをワンクリックでエクスポート可能。いつでも持ち出せて、プラットフォームにも関係にも縛られません。", "모든 데이터를 원클릭으로 내보낼 수 있고 언제든 가져갈 수 있습니다. 플랫폼이나 관계에 묶이지 않습니다."],
  ["可信赖的 AI", "AI you can trust", "信頼できる AI", "신뢰할 수 있는 AI"],
  ["代码完全开源、可审计；底层模型可选官方托管或自主接入，过程透明。", "Code is fully open source and auditable; choose the managed model or bring your own — it's all transparent.", "コードは完全オープンソースで監査可能。モデルはマネージド版を使うか、自分で接続するか自由に選べ、すべて透明です。", "코드는 완전 오픈소스로 누구나 감사할 수 있습니다. 모델은 매니지드 또는 직접 연결을 자유롭게 선택할 수 있으며, 과정이 모두 투명합니다."],
  ["属于你的，就只属于你", "What's yours is only yours", "あなたのものは、あなただけのもの", "당신의 것은 오직 당신의 것"],
  ["隐界为每个人单独搭建一个私人 AI 世界。你的居民、你的关系、你的故事——别人看不到，平台也不会拿去训练。", "Enclave gives each person a separate private AI world. Your residents, your relationships, your stories — no one else sees them, and we don't train any external model on them.", "エンクレイブはユーザーごとにプライベートな AI 世界を提供します。住人・関係性・物語は誰にも見られず、外部モデルの学習にも使いません。", "엔클레이브는 사용자마다 별도의 프라이빗 AI 세계를 제공합니다. 거주민, 관계, 이야기 모두 외부에 공개되지 않으며 외부 모델 학습에도 사용되지 않습니다."],
  // GetStartedCta
  ["立即开始", "Start now", "今すぐ開始", "지금 시작"],
  ["几秒钟，开启你的隐界世界", "Open your Enclave world in seconds", "数秒であなたの隐界ワールドを開始", "몇 초 만에 당신의 엔클레이브 세계를 열어 보세요"],
  ["打开浏览器即可使用，不需要安装；如果你愿意，也可以下载桌面端，或者自己部署一份。", "Open it right in your browser — no install. Prefer native? Grab the desktop build. Want full control? Self-host with one command.", "ブラウザを開くだけ、インストール不要。ネイティブが好きならデスクトップ版、完全にコントロールしたいならセルフホストも選べます。", "브라우저를 열기만 하면 됩니다. 네이티브가 더 좋다면 데스크톱 버전, 완전한 제어를 원한다면 자체 호스팅도 가능합니다."],
  ["查看下载方式", "See download options", "ダウンロード方法を見る", "다운로드 방법 보기"],
  ["数据自主", "Your data, your call", "データ主権", "데이터 자율"],
  ["一人一实例，对话只属于你", "One instance per person — your conversations stay yours", "ひとりに一つのインスタンス、会話はあなたのもの", "한 사람당 하나의 인스턴스, 대화는 오직 당신의 것"],
  ["跨端同步", "Cross-device sync", "クロスデバイス同期", "멀티 디바이스 동기화"],
  ["浏览器 / 桌面 / 手机一致体验", "Same experience across browser, desktop, and mobile", "ブラウザ・デスクトップ・モバイルで同じ体験", "브라우저, 데스크톱, 모바일에서 일관된 경험"],
  ["开源可审计", "Open source, auditable", "オープンソースで監査可能", "오픈소스, 감사 가능"],
  ["MIT 协议，代码全部公开", "MIT-licensed, all code public", "MIT ライセンス、全コード公開", "MIT 라이선스, 전 코드 공개"],
  // FAQ rewrite (new)
  ["隐界是做什么的？", "What is Enclave?", "エンクレイブとは？", "엔클레이브는 무엇인가요?"],
  ["隐界是一个 AI 社交世界。每个用户都有一个属于自己的私人世界，里面有 AI 角色、朋友圈、群聊、电话、笔记，可以和角色长期对话、发展关系，让 AI 真正成为日常的一部分。", "Enclave is an AI social world. Every user gets a private world of their own — populated with AI characters, a feed, group chats, calls and notes. You build long-term conversations and relationships, and AI becomes part of your daily life.", "エンクレイブは AI ソーシャルワールドです。ユーザーごとにプライベートな世界が用意され、AI キャラクター、フィード、グループチャット、通話、ノートが揃います。長期的な会話と関係を育み、AI を日常の一部にできます。", "엔클레이브는 AI 소셜 월드입니다. 사용자마다 자신만의 프라이빗 세계가 있으며, AI 캐릭터, 피드, 그룹 채팅, 통화, 노트가 모두 포함됩니다. 장기간 대화와 관계를 쌓아 AI 를 일상의 일부로 만들 수 있습니다."],
  ["和普通的 AI 聊天工具有什么不同？", "How is this different from a regular AI chatbot?", "通常の AI チャットボットと何が違うのか？", "일반 AI 챗봇과 무엇이 다른가요?"],
  ["普通的 chatbot 是问一句答一句；隐界是一个有居民、有时间、有关系的虚拟世界。AI 角色会主动发动态、给你打电话、记得过去聊过的事，更像是真实的人际关系。", "A regular chatbot replies one question at a time. Enclave is a virtual world with residents, time and relationships. AI characters post moments, call you, and remember earlier conversations — closer to a real human relationship.", "通常のチャットボットは一問一答ですが、エンクレイブは住人・時間・関係性のあるバーチャル世界です。AI キャラクターが自発的に投稿し、電話をかけ、過去の会話を覚えていて、現実の人間関係に近い感覚です。", "일반 챗봇은 질문에 한 번 대답하지만, 엔클레이브는 거주민, 시간, 관계가 있는 가상 세계입니다. AI 캐릭터가 자발적으로 모먼트를 올리고, 전화를 걸며, 이전 대화를 기억해 실제 인간관계에 가까운 느낌을 줍니다."],
  ["免费注册即可开始使用，基础对话和功能完全免费。如果你需要更高级的模型、更多角色或更长记忆，可以选择按使用量付费的订阅。", "Sign up free and start right away — basic conversations and features are completely free. Want higher-end models, more characters, or longer memory? Opt into the pay-as-you-go subscription.", "無料登録ですぐに使え、基本的な会話と機能は完全無料です。上位モデル・キャラクター数・長期メモリーが必要な場合は従量課金のサブスクをご利用いただけます。", "무료로 가입하고 바로 시작할 수 있으며, 기본 대화와 기능은 모두 무료입니다. 더 높은 등급의 모델, 더 많은 캐릭터, 더 긴 기억이 필요하면 사용량 기반의 구독을 선택할 수 있습니다."],
  ["我的隐私和数据安全吗？", "Is my privacy and data safe?", "プライバシーとデータは安全ですか？", "개인정보와 데이터는 안전한가요?"],
  ["隐界采用一人一世界的私人实例：你的对话只属于你，别人看不到，平台也不会拿去训练任何对外的模型。你可以随时导出全部数据。", "Enclave runs an instance per person: your conversations are yours alone — no one else sees them, and we don't train any external model on them. You can export your full data at any time.", "エンクレイブはひとりにひとつのプライベートインスタンスです。会話は完全にあなただけのもので、他者には見えず、外部モデルの学習にも使いません。全データはいつでもエクスポート可能です。", "엔클레이브는 한 사람당 하나의 프라이빗 인스턴스를 운영합니다. 대화는 오직 당신의 것이며, 외부 모델 학습에 사용되지 않습니다. 전체 데이터를 언제든 내보낼 수 있습니다."],
  ["我能信你不会偷偷用我的数据吗？", "How do I know you won't quietly use my data?", "勝手にデータが使われないと、どう信じればいい？", "데이터를 몰래 사용하지 않는다는 것을 어떻게 믿을 수 있나요?"],
  ["整套代码完全开源（MIT 许可，github.com/yuanzui0728/yinjie-app），任何人都可以审计——包括你自己。如果你不放心托管版，也可以选择自己部署。", "The entire codebase is fully open source (MIT license, github.com/yuanzui0728/yinjie-app) — anyone can audit it, including you. If you'd rather not trust the managed cloud, self-host instead.", "コードは完全オープンソース（MIT ライセンス、github.com/yuanzui0728/yinjie-app）で、誰でも、もちろんあなた自身も監査できます。マネージドクラウドが不安なら、セルフホストも選べます。", "전체 코드는 완전 오픈소스(MIT 라이선스, github.com/yuanzui0728/yinjie-app)로, 누구든(당신 포함) 감사할 수 있습니다. 매니지드 클라우드가 불안하다면 자체 호스팅을 선택할 수도 있습니다."],
  ["支持哪些设备？", "Which devices are supported?", "どのデバイスに対応していますか？", "어떤 기기를 지원하나요?"],
  ["浏览器打开就能用，无需安装。同时提供 Windows / macOS 桌面端，iOS / Android 与微信小程序在路上，所有平台同账号同步。", "Open it in your browser — no install needed. Native Windows / macOS apps are available; iOS, Android, and a WeChat mini-program are coming. All platforms sync via the same account.", "ブラウザを開くだけで利用でき、インストールは不要。Windows / macOS のネイティブアプリも提供しており、iOS / Android と WeChat ミニプログラムは準備中。全プラットフォームで同じアカウントで同期します。", "브라우저에서 바로 사용 가능하며 설치가 필요 없습니다. Windows / macOS 네이티브 앱을 제공하며, iOS / Android 와 WeChat 미니 프로그램은 준비 중입니다. 모든 플랫폼이 같은 계정으로 동기화됩니다."],
  // Download page
  ["开始使用", "Get started", "はじめる", "시작하기"],
  ["浏览器即开即用，桌面端体验更佳；移动端与小程序在路上。所有数据云端同步。", "Open it in your browser, or grab the desktop build for a deeper experience. Mobile and the mini-program are on the way. Everything syncs in the cloud.", "ブラウザですぐに利用でき、本格利用にはデスクトップ版がおすすめ。モバイルアプリとミニプログラムは準備中。すべてクラウドで同期します。", "브라우저에서 즉시 사용하고, 더 깊이 사용하고 싶다면 데스크톱 버전을 받으세요. 모바일과 미니 프로그램은 준비 중이며, 모든 데이터가 클라우드로 동기화됩니다."],
  ["推荐", "Recommended", "おすすめ", "추천"],
  ["网页版（推荐）", "Web (recommended)", "Web 版（おすすめ）", "웹 버전(추천)"],
  ["打开浏览器即用，无需安装；最快开始体验隐界", "Open in your browser, no install — the fastest way to try Enclave", "ブラウザを開くだけ、インストール不要 — 最速でエンクレイブを体験", "브라우저만 열면 되고 설치가 필요 없습니다 — 가장 빠르게 엔클레이브를 체험하는 방법"],
  ["原生体验，含托盘和锁屏，适合长期重度使用", "Native experience with tray and lock screen — best for daily heavy use", "トレイとロック画面付きのネイティブ体験。日常のヘビー利用に最適", "트레이와 잠금 화면을 갖춘 네이티브 경험. 매일 깊이 사용하는 분께 추천"],
  ["原生移动端 App，敬请期待", "Native mobile app — coming soon", "ネイティブモバイルアプリ — 近日公開", "네이티브 모바일 앱 — 출시 예정"],
  ["自部署（高级）", "Self-host (advanced)", "セルフホスト（上級）", "자체 호스팅(고급)"],
  ["完全开源、MIT 协议；如果你想拥有 100% 自主权可以自己跑一份", "Fully open source under MIT — if you want 100% control, run your own copy", "完全オープンソース、MIT ライセンス。100% 自主権が欲しい方はご自身でデプロイできます", "MIT 라이선스의 완전 오픈소스 — 100% 자율성을 원한다면 직접 호스팅할 수 있습니다"],
  // Footer
  ["一个属于你的 AI 虚拟世界。私人居民、动态、群聊、电话——浏览器即开即用。", "A private AI world of your own. Private residents, moments, group chats and calls — open in your browser.", "あなただけの AI バーチャルワールド。プライベートな住人・モーメンツ・グループチャット・通話 — ブラウザで開くだけ。", "당신만의 AI 가상 세계. 프라이빗 거주민, 모먼트, 그룹 채팅, 통화 — 브라우저에서 바로."],
  // ===== SEO: per-page titles & descriptions =====
  ["隐界 · 一个属于你的 AI 虚拟世界", "Enclave · A private AI world of your own", "隐界 · あなただけの AI バーチャルワールド", "엔클레이브 · 당신만의 AI 가상 세계"],
  ["%s · 隐界 Enclave", "%s · Enclave", "%s · 隐界 Enclave", "%s · Enclave"],
  ["私人 AI 居民、朋友圈、群聊、电话——浏览器即开即用，免费开始你的隐界世界。", "Private AI residents, moments, group chats and calls — open it in your browser and start your Enclave world for free.", "プライベートな AI 住人、モーメンツ、グループチャット、通話 — ブラウザで開くだけ、エンクレイブの世界を無料で始めましょう。", "프라이빗 AI 거주민, 모먼트, 그룹 채팅, 통화 — 브라우저에서 바로 열어 엔클레이브 세계를 무료로 시작하세요."],
  ["下载隐界 · 网页 / 桌面 / 移动 全平台", "Download Enclave · Web · Desktop · Mobile", "隐界をダウンロード · Web · デスクトップ · モバイル", "엔클레이브 다운로드 · 웹 · 데스크톱 · 모바일"],
  ["挑选最顺手的方式开始用隐界：网页版即开即用，桌面端体验更佳，自部署完全自主。", "Pick the way that fits you best: open the web app instantly, install the desktop build for a deeper experience, or self-host for full control.", "あなたに合った方法でエンクレイブを開始：Web 版はすぐに使え、デスクトップ版でさらに深く、セルフホストで完全な自由を。", "당신에게 가장 잘 맞는 방식으로 엔클레이브를 시작하세요. 웹은 즉시 사용 가능, 데스크톱은 더 깊은 경험, 자체 호스팅은 완전한 자율성."],
  ["隐私政策 · 隐界 Enclave", "Privacy Policy · Enclave", "プライバシーポリシー · 隐界 Enclave", "개인정보 처리방침 · 엔클레이브"],
  ["隐界如何采集、存储、使用你的数据。包含自部署用户与托管云用户两种场景。", "How Enclave collects, stores, and uses your data — covering both self-hosted and managed-cloud users.", "エンクレイブがあなたのデータを収集・保存・利用する方法。セルフホストとマネージドクラウドの両方をカバーします。", "엔클레이브가 데이터를 수집·저장·이용하는 방식. 자체 호스팅과 매니지드 클라우드 사용자 모두를 다룹니다."],
  ["服务条款 · 隐界 Enclave", "Terms of Service · Enclave", "利用規約 · 隐界 Enclave", "서비스 약관 · 엔클레이브"],
  ["隐界 Enclave 服务条款：开源协议、合理使用、订阅与计费、免责声明。", "Enclave terms of service: open-source license, acceptable use, subscription & billing, and disclaimers.", "エンクレイブ利用規約：オープンソースライセンス、適切な利用、サブスクと請求、免責事項。", "엔클레이브 서비스 약관: 오픈소스 라이선스, 적절한 사용, 구독 및 결제, 면책 조항."],
  // ===== JSON-LD =====
  ["隐界 Enclave", "Enclave", "隐界 Enclave", "엔클레이브 Enclave"],
  ["首页", "Home", "ホーム", "홈"],
  ["隐界核心闭环演示动图：聊天、朋友圈、群聊、电话、笔记一气呵成", "Enclave core loop demo: chats, moments, groups, calls and notes flowing together", "エンクレイブのコアループ：チャット、モーメンツ、グループ、通話、ノートが一連の流れに", "엔클레이브 핵심 루프 데모: 채팅, 모먼트, 그룹, 통화, 노트가 자연스럽게 이어집니다"],
  // ===== Image SEO: descriptive screenshot alts =====
  ["隐界聊天界面：与 AI 角色的线程化对话、消息提醒、强提醒、已读标记", "Enclave chat screen: threaded AI character conversations with reminders, strong alerts, and read receipts", "エンクレイブのチャット画面：AI キャラクターとのスレッド会話、リマインダー、強通知、既読表示", "엔클레이브 채팅 화면: AI 캐릭터와의 스레드 대화, 알림, 강력한 알림, 읽음 표시"],
  ["隐界朋友圈：AI 角色与你共享的私人时间线，会主动发动态与互动", "Enclave moments: a private timeline shared with AI characters who post and react on their own", "エンクレイブのモーメンツ：AI キャラクターと共有するプライベートタイムライン、自発的に投稿・反応", "엔클레이브 모먼트: AI 캐릭터와 공유하는 프라이빗 타임라인, 자발적으로 게시하고 반응합니다"],
  ["隐界频道流：频道、视频号、官方账号的内容聚合界面", "Enclave channels feed: aggregated channels, video accounts, and official-account content", "エンクレイブのチャンネル：チャンネル、ビデオアカウント、公式アカウントを集約した画面", "엔클레이브 채널 피드: 채널, 비디오 계정, 공식 계정을 집약한 화면"],
  ["隐界群组：多 AI 角色与你的多人对话场景", "Enclave groups: multi-party rooms where you and several AI characters chat together", "エンクレイブのグループ：複数の AI キャラクターとあなたが集まる多人数チャット", "엔클레이브 그룹: 여러 AI 캐릭터와 함께하는 다자 대화 방"],
  ["隐界新人引导：首次进入虚拟世界的角色初始化与世界设定", "Enclave onboarding: the first-time character setup and world bootstrap flow", "エンクレイブのオンボーディング：初回のキャラクター設定と世界の立ち上げ", "엔클레이브 온보딩: 첫 진입 시 캐릭터 설정과 세계 초기화 화면"],
  ["隐界我的角色：你与 AI 化身的资料卡、个性、形象设定", "Enclave self character: profile cards, personality, and appearance for you and your AI avatar", "エンクレイブの「マイキャラ」：あなたと AI 分身のプロフィール、性格、ビジュアル設定", "엔클레이브 내 캐릭터: 당신과 AI 아바타의 프로필, 성격, 비주얼 설정"],
  // ===== Press Kit =====
  ["媒体资料", "Press Kit", "プレスキット", "프레스 키트"],
  ["下载隐界 Enclave 媒体资料包：产品介绍 PDF、截图、Logo 和创始人头像，给媒体与创作者直接使用。", "Download the Enclave press kit: product PDF, screenshots, logo, and founder avatar for media and creators.", "隐界 Enclave のプレスキット：製品 PDF、スクリーンショット、ロゴ、創始者アバターをメディアやクリエイター向けにダウンロードできます。", "Enclave 프레스 키트를 다운로드하세요: 제품 PDF, 스크린샷, 로고, 창업자 아바타를 미디어와 크리에이터가 바로 사용할 수 있습니다."],
  ["Press Kit", "Press Kit", "Press Kit", "Press Kit"],
  ["隐界 Enclave 媒体资料包", "Enclave Press Kit", "隐界 Enclave プレスキット", "Enclave 프레스 키트"],
  ["给媒体、博主和创作者准备的公开素材页。这里可以直接下载产品介绍、截图、Logo 和创始人头像，用于报道、评测、视频和资料库条目。", "A public asset page for media, bloggers, and creators. Download the product overview, screenshots, logo, and founder avatar for articles, reviews, videos, and directories.", "メディア、ブロガー、クリエイター向けの公開素材ページです。製品紹介、スクリーンショット、ロゴ、創始者アバターを記事、レビュー、動画、ディレクトリで利用できます。", "미디어, 블로거, 크리에이터를 위한 공개 자료 페이지입니다. 제품 소개, 스크린샷, 로고, 창업자 아바타를 기사, 리뷰, 영상, 디렉터리에 사용할 수 있습니다."],
  ["下载产品介绍 PDF", "Download product PDF", "製品紹介 PDF をダウンロード", "제품 소개 PDF 다운로드"],
  ["媒体联系", "Media contact", "メディア連絡", "미디어 문의"],
  ["隐界创始人品牌化插画头像", "Brand-style illustration avatar for the Enclave founder", "隐界創始者のブランドイラストアバター", "Enclave 창업자 브랜드 일러스트 아바타"],
  ["快速事实", "Quick facts", "概要", "빠른 정보"],
  ["素材下载", "Asset downloads", "素材ダウンロード", "자료 다운로드"],
  ["所有素材可直接用于报道、评测、视频封面和资料库条目；请保留产品名“隐界 Enclave”。", "All assets can be used directly in coverage, reviews, video covers, and directories; please keep the product name “隐界 Enclave”.", "すべての素材は記事、レビュー、動画サムネイル、ディレクトリでそのまま利用できます。製品名「隐界 Enclave」を残してください。", "모든 자료는 기사, 리뷰, 영상 커버, 디렉터리에 바로 사용할 수 있습니다. 제품명 “隐界 Enclave”를 유지해 주세요."],
  ["截图", "Screenshots", "スクリーンショット", "스크린샷"],
  ["截图来自当前线上版本，按当前页面语言自动匹配。", "Screenshots come from the current live build and match the current page language.", "スクリーンショットは現在の公開版から取得され、ページの言語に自動で合わせます。", "스크린샷은 현재 라이브 버전에서 가져오며 현재 페이지 언어에 맞춰집니다."],
  ["下载 PNG", "Download PNG", "PNG をダウンロード", "PNG 다운로드"],
  ["使用说明", "Usage notes", "利用上の注意", "사용 안내"],
  ["报道或引用时建议使用“隐界 Enclave”作为产品名。需要采访、补充截图、视频素材或其它格式文件，可以直接邮件联系。", "Use “隐界 Enclave” as the product name when covering or referencing it. Email us for interviews, extra screenshots, video assets, or other file formats.", "記事や引用では製品名として「隐界 Enclave」を使用してください。取材、追加スクリーンショット、動画素材、その他形式のファイルが必要な場合はメールでご連絡ください。", "보도하거나 인용할 때 제품명은 “隐界 Enclave”로 표기해 주세요. 인터뷰, 추가 스크린샷, 영상 자료, 다른 파일 형식이 필요하면 이메일로 문의해 주세요."],
  ["产品介绍 PDF", "Product overview PDF", "製品紹介 PDF", "제품 소개 PDF"],
  ["适合报道前快速了解产品定位、架构、使用场景与下载方式。", "A quick way to understand positioning, architecture, use cases, and download options before coverage.", "記事作成前に、製品の位置づけ、アーキテクチャ、利用シーン、ダウンロード方法を素早く把握できます。", "보도 전에 제품 포지셔닝, 아키텍처, 사용 사례, 다운로드 방식을 빠르게 파악할 수 있습니다."],
  ["PDF · 4 语种", "PDF · 4 languages", "PDF · 4 言語", "PDF · 4개 언어"],
  ["下载 PDF", "Download PDF", "PDF をダウンロード", "PDF 다운로드"],
  ["Logo 标识", "Logo mark", "ロゴマーク", "로고 마크"],
  ["用于文章配图、视频封面、资料库条目与社交媒体预览。", "For article images, video covers, directories, and social previews.", "記事画像、動画サムネイル、ディレクトリ、SNS プレビューに利用できます。", "기사 이미지, 영상 커버, 디렉터리, 소셜 미디어 미리보기에 사용할 수 있습니다."],
  ["PNG · 512x512", "PNG · 512x512", "PNG · 512x512", "PNG · 512x512"],
  ["下载 Logo", "Download logo", "ロゴをダウンロード", "로고 다운로드"],
  ["产品截图", "Product screenshots", "製品スクリーンショット", "제품 스크린샷"],
  ["覆盖聊天、朋友圈、群组、频道流、入坑引导与我的角色六个核心场景。", "Covers six core scenes: chat, moments, groups, channels feed, onboarding, and my character.", "チャット、モーメンツ、グループ、チャンネルフィード、オンボーディング、マイキャラの 6 つの主要シーンを収録。", "채팅, 모먼트, 그룹, 채널 피드, 온보딩, 내 캐릭터 등 6가지 핵심 장면을 포함합니다."],
  ["PNG · 390x844", "PNG · 390x844", "PNG · 390x844", "PNG · 390x844"],
  ["查看截图", "View screenshots", "スクリーンショットを見る", "스크린샷 보기"],
  ["创始人插画头像", "Founder illustration avatar", "創始者イラストアバター", "창업자 일러스트 아바타"],
  ["品牌化创始人插画头像，可用于媒体资料页和创作者简介；不代表真实照片。", "A brand-style founder illustration avatar for press pages and creator bios; it is not a real photo.", "プレスページやクリエイタープロフィールで使えるブランド調の創始者イラストアバターです。実写写真ではありません。", "프레스 페이지와 크리에이터 소개에 사용할 수 있는 브랜드 스타일 창업자 일러스트 아바타입니다. 실제 사진은 아닙니다."],
  ["PNG · 1024x1024", "PNG · 1024x1024", "PNG · 1024x1024", "PNG · 1024x1024"],
  ["下载头像", "Download avatar", "アバターをダウンロード", "아바타 다운로드"],
  ["产品名称", "Product name", "製品名", "제품명"],
  ["一句话介绍", "One-line description", "一言紹介", "한 줄 소개"],
  ["一个属于你的 AI 虚拟世界：私人 AI 居民、朋友圈、群聊、电话，浏览器即开即用。", "A private AI world of your own: AI residents, moments, groups, and calls, ready in the browser.", "あなただけの AI バーチャルワールド：プライベート AI 住人、モーメンツ、グループ、通話をブラウザですぐに利用できます。", "당신만의 프라이빗 AI 세계: AI 주민, 모먼트, 그룹, 통화를 브라우저에서 바로 사용할 수 있습니다."],
  ["核心定位", "Core positioning", "中核的な位置づけ", "핵심 포지셔닝"],
  ["面向长期陪伴和深度对话的 AI 社交世界，而不是问答式 chatbot。", "An AI social world for long-term companionship and deep conversations, not a Q&A chatbot.", "長期的な伴走と深い会話のための AI ソーシャルワールドであり、Q&A チャットボットではありません。", "장기적인 동행과 깊은 대화를 위한 AI 소셜 월드이며 Q&A 챗봇이 아닙니다."],
  ["许可", "License", "ライセンス", "라이선스"],
  ["MIT 开源，可自部署、审计和二次开发。", "Open source under MIT; self-hostable, auditable, and forkable.", "MIT オープンソース。セルフホスト、監査、二次開発が可能です。", "MIT 오픈소스이며 자체 호스팅, 감사, 2차 개발이 가능합니다."],
  ["平台", "Platforms", "プラットフォーム", "플랫폼"],
  ["Web 已可用，桌面端支持 Windows / macOS，iOS / Android 与小程序在路上。", "Web is live, desktop supports Windows / macOS, and iOS / Android plus the mini-program are on the way.", "Web は利用可能、デスクトップ版は Windows / macOS に対応し、iOS / Android とミニプログラムは準備中です。", "Web은 사용 가능하고 데스크톱은 Windows / macOS를 지원하며 iOS / Android와 미니 프로그램은 준비 중입니다."],
  ["隐私架构", "Privacy architecture", "プライバシー構造", "개인정보 보호 구조"],
  ["一人一世界，每个实例只服务一个真实用户。", "One world per person; each instance serves one real user.", "一人に一つの世界。各インスタンスは一人の実ユーザーだけに対応します。", "한 사람당 하나의 세계. 각 인스턴스는 한 명의 실제 사용자만을 위해 동작합니다."],
  // ===== privacy/terms date label + footer license =====
  ["最近更新：", "Last updated: ", "最終更新：", "마지막 업데이트: "],
  ["MIT License", "MIT License", "MIT License", "MIT 라이선스"],
];

const LOCALES = ["zh-CN", "en-US", "ja-JP", "ko-KR"];

function appendOrFillMissing(po, msgid, msgstr) {
  const msgidLine = `msgid ${JSON.stringify(msgid)}`;
  let index = po.indexOf(msgidLine);
  if (index >= 0) {
    while (index >= 0) {
      const blockEnd = po.indexOf("\n\n", index);
      const end = blockEnd >= 0 ? blockEnd : po.length;
      const block = po.slice(index, end);
      if (block.includes('msgstr ""')) {
        po = `${po.slice(0, index)}${block.replace('msgstr ""', `msgstr ${JSON.stringify(msgstr)}`)}${po.slice(end)}`;
      }
      index = po.indexOf(msgidLine, index + msgidLine.length);
    }
    return po;
  }
  const block = `\n#. js-lingui-explicit-id\nmsgid ${JSON.stringify(msgid)}\nmsgstr ${JSON.stringify(msgstr)}\n`;
  return po.replace(/\n*$/, "") + block + "\n";
}

for (let li = 0; li < LOCALES.length; li += 1) {
  const loc = LOCALES[li];
  const file = path.join(ROOT, `${loc}.po`);
  let po = readFileSync(file, "utf-8");
  let added = 0;
  for (const tuple of TRANSLATIONS) {
    const zh = tuple[0];
    const target = tuple[li];
    const nextPo = appendOrFillMissing(po, zh, target);
    if (nextPo !== po) {
      po = nextPo;
      added += 1;
    }
  }
  writeFileSync(file, po);
  console.log(`${loc}: appended ${added}`);
}
