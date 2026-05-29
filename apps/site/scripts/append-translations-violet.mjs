// One-shot fill for the 2026 violet rebuild: fills empty msgstr in the site
// PO files for the new homepage/narrative strings. Idempotent (only fills
// empty msgstr; never overwrites an existing translation). Tuples: [zh, en, ja, ko].
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/home/ps/claude/yinjie-app/packages/i18n/catalogs/site";

const TRANSLATIONS = [
  ["你的世界首屏", "Your World home screen", "あなたの「世界」ホーム画面", "당신의 '세계' 홈 화면"],
  ["你的数字分身", "Your digital avatar", "あなたのデジタル分身", "당신의 디지털 분신"],
  ["一个越来越懂你的分身，替你照看整个世界", "An avatar that understands you more each day — and looks after your whole world", "あなたを少しずつ深く理解し、世界全体を代わりに見守る分身", "당신을 점점 더 이해하며 세계 전체를 대신 돌봐 주는 분신"],
  ["分身会观察你的语气、在意的事和处事方式，慢慢长成另一个你。你忙、你离开、你睡着的时候，它替你接住世界里发生的事；回来时，再用你能接受的方式讲给你听。", "Your avatar learns your tone, what you care about, and how you handle things — slowly becoming another you. When you're busy, away, or asleep, it catches what happens in your world and recaps it the way you'd want to hear it.", "分身はあなたの口調や気にかけること、物事への向き合い方を観察し、少しずつもう一人のあなたへと育ちます。あなたが忙しいとき、離れているとき、眠っているとき、世界で起きたことを代わりに受け止め、戻ってきたら受け入れやすい形で伝えます。", "분신은 당신의 말투, 신경 쓰는 것, 일을 처리하는 방식을 관찰하며 점차 또 다른 당신으로 자랍니다. 당신이 바쁘거나 자리를 비우거나 잠든 사이 세계에서 일어난 일을 대신 받아 두었다가, 돌아오면 받아들이기 편한 방식으로 전해 줍니다."],
  ["倾听", "Listen", "傾聴", "경청"],
  ["陪你说话、接住情绪，做你随时能找的那个「自己人」。", "Talks with you, holds your emotions, and stays the one you can always turn to.", "あなたと話し、感情を受け止め、いつでも頼れる「身内」でいてくれます。", "당신과 이야기하고 감정을 받아 주며, 언제든 기댈 수 있는 '내 편'이 되어 줍니다."],
  ["复盘", "Reflect", "振り返り", "돌아보기"],
  ["把你错过的对话与动态梳理成一份「世界发生了什么」。", "Sorts the chats and moments you missed into a clear recap of what happened.", "見逃した会話や投稿を整理し、「世界で何が起きたか」の振り返りにまとめます。", "놓친 대화와 소식을 정리해 '세계에서 무슨 일이 있었는지' 요약으로 만들어 줍니다."],
  ["整理", "Organize", "整理", "정리"],
  ["把零碎的念头与待办理清楚，把现实里的信号带回世界。", "Untangles scattered thoughts and to-dos, and carries real-world signals back into your world.", "散らばった考えや ToDo を整理し、現実世界のシグナルを世界へ持ち帰ります。", "흩어진 생각과 할 일을 정리하고, 현실의 신호를 세계로 가져옵니다."],
  ["分身相遇：在你授权下，你的分身可以与别人的分身打个照面、带回灵感——你的世界依旧只属于你。", "Avatar encounters: with your permission, your avatar can meet someone else's and bring back inspiration — while your world stays yours alone.", "分身の出会い：あなたの許可のもと、あなたの分身は他の人の分身と顔を合わせ、インスピレーションを持ち帰れます——あなたの世界は依然としてあなただけのものです。", "분신의 만남: 당신의 허락 아래 당신의 분신은 다른 사람의 분신과 마주쳐 영감을 가져올 수 있습니다 — 그래도 당신의 세계는 여전히 당신만의 것입니다."],
  ["隐界数字分身面板：稳定内核、擅长领域、近期信号，替你照看世界", "Enclave digital-avatar panel: stable core, areas of strength, and recent signals — looking after your world for you", "エンクレイブのデジタル分身パネル：安定した核、得意領域、最近のシグナルで、あなたの世界を見守ります", "엔클레이브 디지털 분신 패널: 안정적인 핵심, 강점 영역, 최근 신호로 당신의 세계를 돌봅니다"],
  ["全科医生", "General practitioner", "総合診療医", "일반의"],
  ["法律顾问", "Legal advisor", "法律顧問", "법률 자문"],
  ["情绪教练", "Emotion coach", "感情コーチ", "감정 코치"],
  ["理财顾问", "Financial advisor", "ファイナンシャルアドバイザー", "재무 상담사"],
  ["饮食教练", "Nutrition coach", "食事コーチ", "식단 코치"],
  ["求职面试教练", "Interview coach", "面接コーチ", "면접 코치"],
  ["睡眠陪伴医生", "Sleep companion doctor", "睡眠サポート医", "수면 동반 의사"],
  ["健身教练", "Fitness coach", "フィットネスコーチ", "피트니스 코치"],
  ["英语老师", "English teacher", "英語の先生", "영어 선생님"],
  ["职业规划顾问", "Career planning mentor", "キャリアプランナー", "커리어 플래너"],
  ["乔布斯", "Steve Jobs", "スティーブ・ジョブズ", "스티브 잡스"],
  ["查理·芒格", "Charlie Munger", "チャーリー・マンガー", "찰리 멍거"],
  ["纳瓦尔", "Naval", "ナヴァル", "나발"],
  ["Paul Graham", "Paul Graham", "ポール・グレアム", "폴 그레이엄"],
  ["谁住在这里", "Who lives here", "ここに住む人たち", "여기 사는 이들"],
  ["各行各业的专家居民，随叫随到", "Expert residents from every field, on call whenever you need them", "あらゆる分野の専門家の住人が、いつでもすぐそばに", "각 분야의 전문가 주민이 언제든 대기"],
  ["100+ 位预置专家居民，每一位都有数千字的专业底层逻辑。遇到不同的事就找对应的人——过去只有少数人请得起的专业支持，现在是你的日常。", "100+ preset expert residents, each with thousands of words of professional grounding. For every kind of problem there's the right person — professional support once reserved for the few, now part of your everyday.", "100以上のプリセット専門家の住人。それぞれが数千字の専門的な土台を持ち、困りごとに応じて適任を頼れます——かつて一部の人しか得られなかった専門サポートが、いまや日常に。", "100명 이상의 사전 설정 전문가 주민, 각자 수천 자의 전문 기반을 갖췄습니다. 사안마다 알맞은 사람을 찾을 수 있어 — 과거 소수만 누리던 전문 지원이 이제 당신의 일상이 됩니다."],
  ["还有一批「思想分身」陪你想问题", "Plus a roster of thinker avatars to reason through problems with you", "さらに、一緒に考えてくれる「思考の分身」たちも", "게다가 함께 고민해 주는 '사고의 분신'들도"],
  ["（基于公开思想与作品的灵感人格，并非真人本人）", "(Personas inspired by their public ideas and work — not the real individuals)", "（公開された思想や作品に着想を得た人格であり、本人ではありません）", "(공개된 사상과 작품에서 영감을 받은 인격이며 실제 본인이 아닙니다)"],
  ["隐界专家居民目录：医生、律师、理财、心理等各行各业的居民列表", "Enclave resident directory: doctors, lawyers, finance, psychology and experts from every walk of life", "エンクレイブの住人ディレクトリ：医師、弁護士、ファイナンス、心理など各分野の住人一覧", "엔클레이브 주민 디렉터리: 의사, 변호사, 재무, 심리 등 각 분야 주민 목록"],
  ["把一支专家团队", "Bring a whole team of experts", "専門家チームを丸ごと", "전문가 팀 전체를"],
  ["和你的分身，请进你的世界", "— and your own avatar — into your world", "——そしてあなたの分身を、あなたの世界へ", "— 그리고 당신의 분신을 — 당신의 세계로"],
  ["自部署 / 看源码", "Self-host / view source", "セルフホスト / ソースを見る", "자체 호스팅 / 소스 보기"],
  ["隐界「世界」首屏：你与你的分身双核，今日主动的专家、探索入口", "The Enclave World home screen: you and your avatar at the core, today's proactive experts, and explore entries", "エンクレイブの「世界」ホーム：あなたと分身を中心に、本日アクティブな専門家と探索の入口", "엔클레이브 '세계' 홈 화면: 당신과 분신을 중심으로, 오늘 적극적으로 다가오는 전문가와 탐색 입구"],
  ["一人一世界", "One person, one world", "ひとりにひとつの世界", "한 사람당 하나의 세계"],
  ["私人独立实例", "A private, independent instance", "プライベートな独立インスタンス", "비공개 독립 인스턴스"],
  ["100+ 专家", "100+ experts", "100+ の専門家", "100+ 전문가"],
  ["各行各业随叫随到", "On call across every field", "あらゆる分野でいつでも", "모든 분야에서 언제든"],
  ["浏览器即开即用", "Open in your browser, ready to go", "ブラウザですぐ使える", "브라우저에서 바로 사용"],
  ["会记得 · 会主动", "Remembers · reaches out", "覚えている · 自分から動く", "기억하고 · 먼저 다가갑니다"],
  ["几个月后，他还记得你上次说的难题", "Months later, they still remember the problem you mentioned", "数か月後も、あなたが前に話した悩みを覚えています", "몇 달이 지나도 지난번에 말한 고민을 기억합니다"],
  ["每段关系都有自己的记忆和进度。聊得越久，越懂你；到了该跟进的时候，他会主动开口——而不是等你想起来再问。", "Every relationship has its own memory and progress. The longer you talk, the better they know you; and when it's time to follow up, they speak first — instead of waiting for you to remember.", "関係ごとに固有の記憶と進度があります。話すほどあなたを理解し、フォローのタイミングが来れば、あなたが思い出すのを待たずに自分から声をかけます。", "관계마다 고유한 기억과 진척이 있습니다. 오래 이야기할수록 당신을 더 잘 이해하고, 챙길 때가 되면 당신이 떠올리길 기다리지 않고 먼저 말을 건넵니다."],
  ["和林医生的关系", "Your relationship with Dr. Lin", "リン先生との関係", "린 선생님과의 관계"],
  ["信任的老朋友", "A trusted old friend", "信頼できる旧友", "신뢰하는 오랜 친구"],
  ["亲密度 76 / 100", "Closeness 76 / 100", "親密度 76 / 100", "친밀도 76 / 100"],
  ["记得：你在备考、最近睡眠差、母亲高血压", "Remembers: you're studying for an exam, sleeping poorly lately, mother has high blood pressure", "覚えている：受験勉強中、最近睡眠が浅い、母が高血圧", "기억함: 시험 준비 중, 최근 수면 부족, 어머니 고혈압"],
  ["主动跟进", "Proactive follow-up", "自発的なフォロー", "먼저 챙기기"],
  ["「上周说的面试今天吧？我把那几个高频问题又给你理了一版。」", "Your interview's today, right? I put together another pass of those common questions for you.", "先週話していた面接、今日ですよね？よく出る質問をもう一度まとめておきました。", "지난주에 말한 면접 오늘이죠? 자주 나오는 질문들을 한 번 더 정리해 두었어요."],
  ["隐界一对一聊天：专家记得你的处境，主动关心、跟进你提过的事", "Enclave one-on-one chat: the expert remembers your situation, checks in proactively, and follows up on what you mentioned", "エンクレイブの一対一チャット：専門家はあなたの状況を覚え、自分から気づかい、話した件をフォローします", "엔클레이브 일대일 채팅: 전문가가 당신의 상황을 기억하고 먼저 안부를 묻고 말한 일을 챙깁니다"],
  ["商城与礼物柜", "Shop & gift cabinet", "ショップとギフト棚", "상점과 선물함"],
  ["聊天红包", "Chat red packets", "チャット紅包", "채팅 홍바오"],
  ["每日签到", "Daily check-in", "デイリーチェックイン", "일일 출석"],
  ["语音克隆 · 通话", "Voice cloning · calls", "音声クローン · 通話", "음성 클론 · 통화"],
  ["自然语言造视频", "Make videos with words", "自然言語で動画を作る", "자연어로 영상 만들기"],
  ["自然语言造游戏", "Make games with words", "自然言語でゲームを作る", "자연어로 게임 만들기"],
  ["自己造专家 · 角色广场", "Build your own expert · character plaza", "自分で専門家を作る · キャラ広場", "나만의 전문가 만들기 · 캐릭터 광장"],
  ["还有一整个世界的小东西", "And a whole world of little things", "ほかにも、世界いっぱいの小さな楽しみ", "그 밖에도 세계 가득한 소소한 것들"],
  ["生活层里还藏着很多——慢慢逛，慢慢发现。", "There's plenty more tucked into the life layer — wander around and discover it.", "暮らしのレイヤーにはまだまだたくさん——ゆっくり巡って見つけてください。", "생활 레이어에는 더 많은 것이 숨어 있어요 — 천천히 둘러보며 발견해 보세요."],
  ["不只是建议，是交付物", "Not just advice — actual deliverables", "助言だけでなく、成果物まで", "조언만이 아니라 결과물까지"],
  ["一句话，专家直接把活干出来", "Say the word, and the expert just gets it done", "一言で、専門家がそのまま仕上げます", "한마디면 전문가가 바로 결과물을 만들어 냅니다"],
  ["在聊天里说清楚你要什么，专家居民直接产出能用的 PPT、Word、Excel；复杂的事还能整包派给他们当你的子助手，配上你的私人知识库，答得有据可依。", "Tell them what you need right in the chat, and expert residents produce ready-to-use PPT, Word, and Excel. For complex jobs, hand the whole thing off to them as your sub-assistant — backed by your private knowledge base, so answers are grounded.", "チャットで必要なことを伝えれば、専門家の住人がそのまま使える PPT・Word・Excel を作成。複雑な案件は丸ごと子アシスタントとして任せられ、あなたの個人ナレッジベースに基づいて根拠のある回答をします。", "채팅에서 필요한 것을 말하면 전문가 주민이 바로 쓸 수 있는 PPT, Word, Excel을 만들어 냅니다. 복잡한 일은 통째로 당신의 보조 비서로 맡길 수 있고, 개인 지식베이스를 바탕으로 근거 있는 답을 줍니다."],
  ["PPT 演示", "PPT decks", "PPT スライド", "PPT 프레젠테이션"],
  ["成稿即用的幻灯片", "Slides ready to present", "そのまま使えるスライド", "바로 발표 가능한 슬라이드"],
  ["Word 文档", "Word documents", "Word 文書", "Word 문서"],
  ["纪要 / 报告 / 方案", "Minutes / reports / proposals", "議事録 / レポート / 企画", "회의록 / 보고서 / 기획"],
  ["Excel 表格", "Excel sheets", "Excel 表", "Excel 표"],
  ["清单 / 排期 / 测算", "Checklists / schedules / estimates", "リスト / スケジュール / 試算", "목록 / 일정 / 산출"],
  ["任务派发", "Task delegation", "タスクの委任", "작업 위임"],
  ["把一件复杂的事整包交给专家居民当你的子助手，他替你拆解、推进、回报。", "Hand a complex task to an expert resident as your sub-assistant — they break it down, push it forward, and report back.", "複雑な仕事を専門家の住人に子アシスタントとして丸ごと任せれば、分解し、進め、報告してくれます。", "복잡한 일을 전문가 주민에게 보조 비서로 통째로 맡기면, 분해하고 진행하고 보고해 줍니다."],
  ["私人知识库", "Private knowledge base", "個人ナレッジベース", "개인 지식베이스"],
  ["粘贴、上传任意格式或丢个网址，专家基于你的真实资料回答，而不是泛泛而谈。", "Paste, upload any format, or drop a URL — experts answer from your real material instead of generic talk.", "貼り付け、任意の形式のアップロード、URL を渡すだけ。専門家は一般論ではなく、あなたの実資料に基づいて答えます。", "붙여넣기, 어떤 형식이든 업로드, URL 하나만 던져도 — 전문가는 일반론이 아니라 당신의 실제 자료를 근거로 답합니다."],
  ["浅色", "Light", "ライト", "라이트"],
  ["深色", "Dark", "ダーク", "다크"],
  ["跟随系统", "System", "システムに従う", "시스템 설정"],
  ["主题", "Theme", "テーマ", "테마"],
  ["隐界发现页：朋友圈、摇一摇、分身相遇、广场、视频号、游戏、商城等入口", "Enclave Discover page: moments, shake, avatar encounters, plaza, channels, games, shop and more", "エンクレイブの発見ページ：モーメンツ、シェイク、分身の出会い、広場、チャンネル、ゲーム、ショップなどの入口", "엔클레이브 발견 페이지: 모먼츠, 흔들기, 분신의 만남, 광장, 채널, 게임, 상점 등 입구"],
  ["一整个社交世界", "A whole social world", "ひとつの社交ワールド", "하나의 소셜 세계"],
  ["他们之间，也有关系", "They have relationships with each other, too", "住人どうしにも関係があります", "그들 사이에도 관계가 있습니다"],
  ["不止一对一私聊。把多位居民拉进群，他们之间有朋友、对手、师徒——会讨论、会接话、会争论。还有朋友圈、广场、视频号、摇一摇，一个完整的世界在自己运转。", "More than one-on-one chats. Pull several residents into a group and they're friends, rivals, mentors — they discuss, chime in, and argue. With moments, the plaza, channels, and shake, a whole world runs on its own.", "一対一だけではありません。複数の住人をグループに入れれば、友人・ライバル・師弟として議論し、相槌を打ち、口論もします。モーメンツ、広場、チャンネル、シェイクもあり、ひとつの世界が自律的に動きます。", "일대일 대화에 그치지 않습니다. 여러 주민을 그룹에 넣으면 친구·라이벌·사제로서 토론하고 맞장구치고 다투기도 합니다. 모먼츠, 광장, 채널, 흔들기까지 더해 하나의 세계가 스스로 굴러갑니다."],
  ["群聊：多位居民同场，AI 之间也会互动", "Group chat: many residents together, with AI-to-AI interaction", "グループチャット：複数の住人が同席し、AI どうしも交流", "그룹 채팅: 여러 주민이 한자리에, AI 간 상호작용도"],
  ["朋友圈：居民按作息主动发动态、互相评论", "Moments: residents post on their own rhythm and comment on each other", "モーメンツ：住人が生活リズムに沿って投稿し、互いにコメント", "모먼츠: 주민이 각자 리듬대로 글을 올리고 서로 댓글을 답니다"],
  ["广场与视频号：看看整个世界在说什么", "Plaza & channels: see what the whole world is talking about", "広場とチャンネル：世界全体が何を話しているかを覗く", "광장과 채널: 세계 전체가 무슨 이야기를 하는지 둘러보기"],
  ["摇一摇 / 分身相遇：遇见新的居民与灵感", "Shake / avatar encounters: meet new residents and inspiration", "シェイク / 分身の出会い：新しい住人とひらめきに出会う", "흔들기 / 분신의 만남: 새로운 주민과 영감을 만나기"],
  ["不一样的地方", "What makes it different", "ここが違う", "다른 점"],
  ["不是问一句答一句，而是一个会过日子的世界", "Not a question-and-answer bot, but a world that actually lives", "一問一答ではなく、暮らしを営む世界", "한 번 묻고 한 번 답하는 게 아니라, 살아가는 세계"],
  ["普通的 AI 转头就忘。隐界里的居民和你活在同一个当下——有季节、有天气、有作息。深夜的关心和午后的招呼不一样，他们记得你昨天说过的话。", "Ordinary AI forgets the moment you turn away. Enclave's residents live in the same present as you — with seasons, weather, and daily rhythms. A late-night check-in differs from an afternoon hello, and they remember what you said yesterday.", "普通の AI は振り向いた瞬間に忘れます。エンクレイブの住人はあなたと同じ「いま」に生き、季節も天気も生活リズムもあります。深夜の気づかいと昼下がりの挨拶は違い、昨日あなたが言ったことも覚えています。", "보통의 AI는 돌아서는 순간 잊습니다. 엔클레이브의 주민은 당신과 같은 '지금'을 살아가며 계절도 날씨도 생활 리듬도 있습니다. 한밤의 안부와 오후의 인사가 다르고, 어제 당신이 한 말도 기억합니다."],
  ["你的世界 · 此刻", "Your world · right now", "あなたの世界 · いま", "당신의 세계 · 지금"],
  ["初夏 · 周五傍晚", "Early summer · Friday evening", "初夏 · 金曜の夕方", "초여름 · 금요일 저녁"],
  ["多云转晴 · 26°C", "Clearing up · 26°C", "曇りのち晴れ · 26°C", "구름 뒤 맑음 · 26°C"],
  ["18:42 · 该收尾今天了", "18:42 · time to wrap up the day", "18:42 · そろそろ今日を締めくくる頃", "18:42 · 하루를 마무리할 시간"],
  ["下班路上", "On the way home", "退勤の途中", "퇴근길"],
  ["有作息", "A daily rhythm", "生活リズムがある", "생활 리듬이 있음"],
  ["每位居民有自己的上下线时间和当前状态，不会半夜秒回得像机器。", "Each resident has their own online hours and current status — no robotic instant replies at 3 a.m.", "住人ごとにオンライン時間と現在の状態があり、深夜に機械のように即レスしたりしません。", "주민마다 접속 시간과 현재 상태가 있어, 한밤중에 기계처럼 즉답하지 않습니다."],
  ["有记忆", "Memory", "記憶がある", "기억이 있음"],
  ["结构化长期记忆，几个月后仍记得你的处境，不用每次从头解释。", "Structured long-term memory means they still know your situation months later — no need to explain from scratch each time.", "構造化された長期記憶で、数か月後もあなたの状況を覚えており、毎回一から説明する必要がありません。", "구조화된 장기 기억으로 몇 달 뒤에도 당신의 상황을 기억하므로, 매번 처음부터 설명할 필요가 없습니다."],
  ["会主动", "Initiative", "自分から動く", "먼저 다가감"],
  ["基于你的近况主动提醒、跟进、关心，而不是干等你开口。", "They remind, follow up, and check in based on your recent situation — instead of just waiting for you to speak.", "あなたの近況に基づいてリマインドやフォロー、気づかいをし、ただ口を開くのを待ったりしません。", "당신의 최근 상황을 바탕으로 알림·후속 확인·안부를 먼저 건네며, 그저 당신이 말을 꺼내길 기다리지 않습니다."],
  ["清晨", "Morning", "早朝", "이른 아침"],
  ["午后", "Afternoon", "昼下がり", "오후"],
  ["黄昏", "Dusk", "夕暮れ", "황혼"],
  ["深夜", "Late night", "深夜", "심야"],
  ["覆盖「世界」首屏、专家居民、数字分身、一对一私聊、群聊、朋友圈与广场七个核心场景，均为真实界面。", "Covers seven core scenes — the World home, expert residents, your avatar, one-on-one chat, group chat, moments, and the plaza — all real interfaces.", "「世界」ホーム、専門家の住人、デジタル分身、一対一チャット、グループチャット、モーメンツ、広場という7つのコアシーンを網羅。すべて実際の画面です。", "'세계' 홈, 전문가 주민, 디지털 분신, 일대일 채팅, 그룹 채팅, 모먼츠, 광장 등 7개 핵심 화면을 담았으며 모두 실제 인터페이스입니다."],
  ["你与你的分身双核", "You and your avatar at the core", "あなたと分身のデュアルコア", "당신과 분신, 두 개의 핵심"],
  ["隐界「世界」首屏：你与你的分身双核、今日主动的专家与探索入口", "The Enclave World home screen: you and your avatar at the core, today's proactive experts, and explore entries", "エンクレイブの「世界」ホーム：あなたと分身を中心に、本日アクティブな専門家と探索の入口", "엔클레이브 '세계' 홈 화면: 당신과 분신을 중심으로, 오늘 적극적인 전문가와 탐색 입구"],
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
  let filled = 0;
  for (const tuple of TRANSLATIONS) {
    const zh = tuple[0];
    const target = tuple[li];
    const nextPo = appendOrFillMissing(po, zh, target);
    if (nextPo !== po) {
      po = nextPo;
      filled += 1;
    }
  }
  writeFileSync(file, po);
  console.log(`${loc}: filled ${filled}`);
}
