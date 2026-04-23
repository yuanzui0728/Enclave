# Desktop Web Fix Plan

日期：2026-04-20
范围：Web 端桌面布局（浏览器宽度 >= 960，`apps/app`）

## 当前基线

- `pnpm --filter @yinjie/app typecheck` 通过
- `pnpm --filter @yinjie/app lint` 通过
- `pnpm --filter @yinjie/app build` 通过
- `pnpm audit:desktop-web` 通过
- 当前桌面 Web 风险主要集中在运行时路由状态、返回链路和工作区选中态恢复，不在编译层

## 本轮已完成

- 桌面好友朋友圈已补 `returnPath` / `returnHash`，从 `通讯录 / 星标朋友 / 标签 / 朋友圈 / 聊天详情 / 头像卡片` 进入后可回到原上下文。
- 桌面好友朋友圈现在也会兼容旧的 `source=starred-friends` / `source=tags` 裸 hash：这类历史地址在缺少 `returnPath/returnHash` 时，会直接回对应的桌面通讯录 pane，不再退成裸 `/tabs/contacts` 或旧 `/contacts/tags`、`/contacts/starred`。
- 桌面好友朋友圈现在也会把旧 `returnPath=/contacts/starred` / `/contacts/tags` 收成桌面通讯录 `pane`。之前这类历史 hash 一旦自带旧返回地址，会优先复活旧通讯录路径，绕过上面的 `source` 兜底；现在即使没有 `returnHash`，也会自动补成对应的桌面 `starred-friends / tags` pane。
- 桌面壳现在会记录原始 querystring，带搜索参数的桌面页面不再把历史地址写成错误的对象串，返回链路可继续命中真实 URL。
- 桌面标签工作区已把 `tag + characterId` 写入 URL，刷新、返回、从资料页回来都能恢复到原标签分组和联系人。
- 桌面角色资料页删除联系人后，已优先回 `returnPath / returnHash`，不再强制退回普通通讯录。
- 桌面群聊详情进入群二维码时现在会带上来源会话上下文，二维码页可直接回到原群聊会话，不再只剩“返回群聊信息”这条兜底链路。
- 群二维码页现在会按原始 querystring 读取 `from/title` 来源会话参数，桌面群聊详情、移动群聊详情带过去的“回到来源会话”上下文不再因为 router 的解析后 search 对象失真而丢失。
- 群邀请这条链路里的桌面回跳现在也统一收敛了：`desktop/mobile` 的“回到会话”，以及桌面群二维码页里的“回到来源会话 / 回到会话”，都会改走 `/tabs/chat#conversationId=...`；复制到手机、群邀请存储和 `from` 参数仍保留原 `/chat` / `/group` 路径，不再从桌面工具页或桌面群二维码页跳回移动聊天路由。
- `desktop/mobile` 里的群邀请卡片“桌面打开”现在也会直接收敛到桌面消息工作区 `/tabs/chat#conversationId=...`。之前这里还在直接吃群二维码页存下来的 `/group/$groupId` handoff path，点当前群邀请或历史群邀请的“桌面打开”时会先落旧群聊路径。
- 桌面联系人和桌面消息里这批“进入聊天”的入口现在也统一改走 `/tabs/chat#conversationId=...`：包括添加朋友后的“发消息”、标签联系人详情里的“发消息 / 共同群聊”、头像资料卡里的“发消息”、桌面消息左侧会话列表本身、建群成功后的默认落点、聊天历史面板里的“定位到这条消息”，以及独立聊天窗口的 `returnTo`。这样从桌面联系人、聊天侧栏或独立聊天窗口继续返回时，不会再误跳到移动 `/chat` `/group` 页面。
- 移动“群聊”联系人目录现在也会过滤桌面专属 `returnPath`。之前这页如果吃到桌面工作区或桌面群二维码链路写回的 `/desktop/*` / `/tabs/*` 返回地址，窄屏回退时仍可能误跳回桌面协议；现在会像标签联系人、星标联系人一样先丢掉桌面专属返回目标。
- 桌面聊天详情里的“聊天背景 / 群背景 / 群二维码”现在也会带上桌面消息工作区的 `returnPath/returnHash`。从桌面聊天侧栏进入这些页面后，返回、异常兜底和缺失会话回跳都会优先收敛回 `/tabs/chat#conversationId=...&panel=details`，不再丢掉桌面详情侧栏上下文。
- 桌面添加朋友工作区现在会把当前选中的搜索结果 `characterId` 实时写回 hash，切换搜索结果后刷新、从资料页返回或复制当前桌面地址时，不会再回到旧角色或丢失当前选中态；`openCompose` 这类一次性发申请路由如果带着失效 `characterId` 进入，也会在结果列表稳定后自动清掉旧 flag、回收到当前有效角色，并保留原 `recommendationId` 上下文。
- 桌面聊天记录和聊天文件页现在只会在 `conversationId` 真正变化时同步本地选中态，缺失或失效的会话路由会统一交给 fallback 纠偏，避免 route 同步和默认选中逻辑互相打架，导致列表选中态来回抖动或 URL 反复残留旧会话。
- 桌面聊天记录页里的“定位到原消息”现在也统一回到桌面消息工作区 `/tabs/chat#conversationId=...&messageId=...`，不再从桌面工具页硬切回移动 `/chat` / `/group` 路由，避免在桌面 Web 上点定位时串布局。
- 桌面聊天独立窗口现在会在真实会话加载后，把 hash 里的 `title/type` 自动收敛到当前会话；窗口里继续打开消息定位或刷新时，不会再沿用旧会话标题，避免窗口头部已更新、URL 和后续 returnTo 仍停在旧元数据。
- 桌面聊天独立窗口现在在“关闭窗口”无法直接关掉时，也会和“回到主窗口”走同一套主窗口聚焦链路，不再把当前独立窗口直接改造成 `/tabs/chat` 或其它 fallback 页面。
- 桌面 Web 下的独立聊天窗、独立笔记窗、独立公众号文章窗、独立图片查看器，现在浏览器 fallback 也会按稳定窗口名复用现有弹窗，不再因为统一走 `_blank` 而每次都开新窗；前面补过的 `sessionId / windowId / label` 在浏览器端也真正生效了。
- 桌面聊天图片独立查看器现在会按整组图片 session 复用同一个独立窗口，不再因为切到另一张图、或从同一组图片里再次点击其他缩略图，就重复打开多个 viewer 窗口；同组图片只会更新当前 `activeId` 和窗口内容。
- 桌面聊天图片查看器现在会在会话图片列表已恢复、但路由里的 `activeId / imageUrl / title / returnTo` 仍指向过期图片时，自动把当前实际显示的图片项回写到 hash，避免界面已经回到首张有效图片、URL 还残留旧图片上下文。
- 桌面手机接力现在会在“公众号主页 / 服务号消息”这类不带文章上下文的 official handoff 失效后自动清掉 hash；如果 handoff 里带的是文章，也会优先按真实文章回写 `accountId/accountName/articleTitle`，文章失效后自动降级成服务号主页 / 订阅号入口 / 账号主页，不再长期挂着已删除文章的旧卡片。通话接力卡片也会在会话改名后自动回写最新标题，不再长期挂着旧账号名或旧会话名；同时“复制到手机”继续保留移动 `/chat` / `/group` 链路，“桌面打开聊天”则统一改走 `/tabs/chat#conversationId=...`，不再从桌面工具页先落旧聊天路径。
- 桌面独立笔记窗口现在会兼容旧的裸 hash 笔记链接，并在打开后自动改写成共享的 `draftId/noteId/returnTo` 路由协议；保存成功后的窗口地址也统一改走共享 builder，不再和收藏主页的笔记路由分叉。
- 桌面独立笔记窗口和收藏里的内嵌笔记编辑器，现在在“原笔记已删除、且没有本地草稿可恢复”的错误态，以及“删除成功后退出编辑”的链路里，都会继续走统一的 `returnTo` / 关闭窗口协议，不再硬跳 `/tabs/favorites`，避免从聊天消息、图片查看器或收藏子视图打开笔记后丢回跳上下文。
- 桌面独立笔记窗口现在在 `returnTo` 指向桌面聊天独立窗口时，也会像文章窗口一样优先回到原聊天窗口；同时缺少上下文时的“回到收藏”不再把当前独立窗口直接改造成收藏页，而是继续走独立窗口关闭 / 主窗口聚焦协议。
- 桌面笔记窗口、收藏内嵌笔记编辑器、聊天里的笔记卡片入口，以及桌面公众号文章独立窗口的 `returnTo`，现在统一改成读取当前完整路径（`pathname + search + hash`）；来源页一旦带 querystring，不会再只回到裸路径或丢掉当前筛选条件。
- 桌面公众号文章独立窗口现在在 `returnTo` 指向桌面聊天独立窗口时，会优先聚焦原聊天窗口，而不是把主窗口误导航到 `/desktop/chat-window`；从聊天独立窗口里打开文章后，关闭或“回到来源”会回到原窗口本身。
- 桌面独立笔记窗口、公众号文章窗口、聊天图片查看器现在在 `returnTo=/desktop/chat-window#...` 但原聊天独立窗已经不存在时，会自动把 fallback 收敛成等价的 `/tabs/chat#conversationId=...&messageId=...`，不再把主窗口或当前窗口误导航到独立聊天窗路由本身。
- 桌面公众号文章独立窗口现在也有稳定的 window session；窗口内切到相关文章后，会把当前文章和当前窗口 session 重新绑定，后续再从桌面工作区打开这篇当前文章时会复用已有窗口，不会因为窗口 label 还停在旧 `articleId` 上而再开出一个重复文章窗口。
- 桌面公众号文章独立窗口现在会在真实文章加载后，把 `accountId/title` 自动收敛回当前文章；窗口内点“更多内容”跳到相关文章时也会继续走同一套 builder，不再出现正文已经切到新文章、URL 还残留旧账号或旧标题的路由漂移。
- 桌面公众号文章独立窗口里的“打开公众号主页”现在也统一回桌面通讯录工作区 `/tabs/contacts#pane=official-accounts...`。主窗口存在时会优先聚焦主窗口，主窗口不存在时才把当前窗口带到同一条桌面路径，不再把独立文章窗口直接改造成旧 `/official-accounts/:id` 页面。
- 桌面搜索这条链路里的消息和公众号结果现在也统一改走桌面协议：聊天会话与消息命中直接回 `/tabs/chat#conversationId=...`，消息命中会把 `messageId` 一起写进 hash；公众号主页和文章命中则回 `/tabs/contacts#pane=official-accounts...`。这样从桌面搜索建议和桌面搜索页打开结果时，不会再掉进移动 `/chat` `/group` 或旧 `/official-accounts/*` 页面。
- 桌面搜索页和桌面搜索启动器现在会把 `/tabs/search` 返回状态统一补到角色资料、好友朋友圈、朋友圈、广场动态、视频号、游戏、小程序这些桌面结果上。之前桌面搜索只给角色资料补了返回协议，这几类结果打开后再点“返回上一页”经常只能回各自工作区，带不回当前搜索条件；现在会直接回当前桌面搜索工作区，并保住关键词与来源上下文。
- 桌面搜索里的“最近收藏 / 收藏命中”现在也会先把旧收藏路由收敛到桌面工作区再打开。老的 `/chat/$id#chat-message-*`、`/group/$id#chat-message-*`、`/chat/subscription-inbox`、`/official-accounts/*` 收藏快捷项，不会再先落旧移动聊天页或旧公众号页，再靠桌面分支二次转发。
- 桌面收藏页右侧的“打开内容”现在也会先把老收藏里残留的旧路由收敛到桌面工作区。历史遗留的 `/chat/$id#chat-message-*`、`/group/$id#chat-message-*`、`/chat/subscription-inbox`、`/official-accounts/*` 收藏项，不会再从桌面收藏页里直接掉回旧聊天页或旧公众号页。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover`、`/discover/encounter`、`/discover/scene` 目标现在也会直接收成 `/tabs/discover`。之前这类旧发现入口会先打开共享发现页或发现工具页，再靠页面重定向回桌面发现工作区；现在会直接回桌面发现页本身，不再多绕一跳。
- 旧 `/discover/encounter`、`/discover/scene` 在桌面布局下现在也会像旧 `/discover` 一样把现有 hash 一起带回 `/tabs/discover`；桌面搜索、搜索启动器和收藏页改写这两类旧发现工具目标时，也会继续保住原 hash，不再把现有返回上下文直接抹掉。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover/feed` 目标现在也会直接收成 `/tabs/feed`，而且 `feed-route-state` 会把历史 `returnPath=/discover/feed` 一起归一成桌面广场动态返回地址。之前这类旧广场动态链接会先打开共享广场页，再靠页面自愈；如果 hash 里还残留旧返回目标，后续“返回上一页”也可能继续复活旧 discover 路径。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover/moments` 目标现在也会直接收成 `/tabs/moments`，而且 `moments-route-state` 会继续把历史 `returnPath=/discover/moments` 归一成桌面朋友圈返回地址。之前这类旧总朋友圈链接会先打开共享页，再靠页面自愈；如果 hash 里还残留旧返回目标，后续“返回上一页”也可能继续复活旧 discover 路径。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover/moments/publish` 目标现在也会直接收成 `/tabs/moments`，并继续保住发表页 hash 里的 `returnPath / returnHash`。之前这类旧发表页链接会先打开共享发表页，再靠页面重定向回桌面朋友圈；现在会直接落桌面朋友圈，不再多绕一跳。
- 桌面壳里的 `视频号直播伴侣` 现在只归底部“更多”入口，不再同时点亮顶部“视频号”主导航。之前 `/desktop/channels/live-companion` 会同时命中两套导航匹配，造成桌面侧栏双高亮；现在直播伴侣作为独立工具页只保留“更多”选中态。
- 桌面壳左侧主导航现在也会认旧根路径：旧 `/chat`、`/contacts`、`/favorites`、`/official-accounts`、`/search`、`/games`、`/discover/games`、`/discover/channels`、`/channels/authors/*`、`/discover/mini-programs`、`/discover/moments/publish`、`/friend-moments/*` 在桌面自愈前就会先点亮对应工作区，不再出现“界面还是旧路径、侧栏高亮却掉线”的错位。
- 桌面壳底部“更多”入口现在也会认旧 `/profile/settings`。之前桌面设置页在自愈回 `/desktop/settings` 之前，底部“更多”不会先亮，设置工作区会短暂出现“页面已打开、入口未选中”的错位。
- 桌面壳底部“更多”入口现在也会认协议文档页 `/legal/*`。之前桌面里打开隐私政策、用户协议、社区规范时，页面虽然仍属于设置链路，但底部“更多”不会保持选中，导致设置子页导航态掉线。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/games`、`/discover/games` 目标现在也会直接收成 `/tabs/games`，而且 `mobile-games-route-state` 会把历史 `returnPath=/games|/discover/games` 一起归一成桌面游戏中心返回地址。之前这类旧游戏中心链接会先打开共享页，再靠页面自愈；如果 query 里还残留旧返回目标，后续“返回上一页”也可能继续复活旧游戏中心路径。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover/mini-programs` 目标现在也会直接收成 `/tabs/mini-programs`，而且 `mobile-mini-programs-route-state` 会把历史 `returnPath=/discover/mini-programs` 一起归一成桌面小程序返回地址。之前这类旧小程序链接会先打开共享页，再靠页面自愈；如果 query 里还残留旧返回目标，后续“返回上一页”也可能继续复活旧 discover 路径。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/discover/channels`、`/channels/authors/$authorId` 目标现在也会直接收成 `/tabs/channels`，而且旧作者页会把现有 `postId / returnPath / returnHash / section` 一起带回桌面视频号工作区。之前这类旧视频号链接会先打开共享页或共享作者页，再靠页面自愈；如果 hash 里还残留旧返回目标，后续“返回上一页”也可能继续复活旧 discover 路径。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/chat`、`/contacts`、`/profile`、`/favorites`、`/notes`、`/profile/settings` 目标现在也会直接收成各自的桌面主工作区，不再先打开共享根页再靠页面自愈。其中旧 `/notes` 会直接落到 `/tabs/favorites#category=notes`，旧设置页会直接落到 `/desktop/settings`，旧资料页会直接落到 `/tabs/profile`。
- 桌面搜索页、搜索启动器和收藏页里的旧 `/official-accounts` 根入口现在也会直接收成桌面通讯录里的公众号工作区，不再先打开共享公众号列表页再靠兼容页跳回桌面；如果旧 hash 里已经带了 `accountId / articleId`，这层选择态也会继续保住。
- `desktop/mobile` 里的公众号接力历史现在会把订阅号入口 `/chat/subscription-inbox` 和旧 `/contacts/official-accounts` 一起归进“公众号”分组，不再误落到“消息”或“其他”。之前订阅号接力卡片会因为先命中 `/chat/*` 分类，被错放到消息分组里。
- `desktop/mobile` 里的旧快捷入口历史现在也会按根路径归对组：旧 `/chat` 会回“消息”，旧 `/contacts`、`/discover` 会回“快捷入口”；旧资料/设置接力 `/profile`、`/tabs/profile`、`/profile/settings`、`/desktop/settings`、`/legal/*` 也一样，即使老记录里还带着 query 或 hash 也不会再掉进“其他”。
- `desktop/mobile` 里的游戏接力历史现在也会认桌面工作区根路径 `/tabs/games`。之前这类记录虽然语义上还是“游戏中心”，但会因为分组器只认旧 `/games`、`/discover/games` 而掉进“其他”。
- 桌面壳右上角“我”的资料卡里，“给自己发消息”快捷入口也已经改成桌面消息协议 `/tabs/chat#conversationId=...`。之前这里还在直跳移动 `/chat/$conversationId`，会把用户从桌面壳直接切回移动聊天页。
- 桌面通讯录里的“群聊”分组现在也统一回桌面消息工作区：`进入群聊` 走 `/tabs/chat#conversationId=...`，`群聊信息` 走 `/tabs/chat#conversationId=...&panel=details`。之前这两个入口还会直接掉进移动 `/group/$groupId` 和 `/group/$groupId/details`。
- 桌面通讯录联系人详情里的“共同群聊”入口也已经对齐到同一套桌面协议，点击后直接回 `/tabs/chat#conversationId=...`。之前这里也会把用户从桌面联系人详情带回移动 `/group/$groupId`。
- 桌面通讯录里好友详情、星标联系人这些“发消息”动作现在也会在 `contacts-page` 这层统一留在桌面消息工作区：桌面布局下创建或打开会话后直接回 `/tabs/chat#conversationId=...`，不再从这里漏回移动 `/chat/$conversationId`。
- 桌面角色资料页这条链路也对齐了：桌面布局下点“发消息”会直接回 `/tabs/chat#conversationId=...`，点“共同群聊”会回对应群会话的 `/tabs/chat#conversationId=...`。之前这页还会把桌面用户带去移动 `/chat/$conversationId` 和 `/group/$groupId`。
- 桌面里的“新的朋友”入口现在也统一直达通讯录工作区的 `pane=new-friends`。桌面“添加朋友”工作区、桌面聊天详情侧栏和桌面角色资料页里，如果当前已经有待处理好友申请，不会再先落旧 `/friend-requests` 再靠重定向回桌面通讯录，而是直接回 `/tabs/contacts#pane=new-friends`。
- 桌面角色资料页里的“语音通话 / 视频通话”现在也不再先落旧 `/chat/$conversationId/voice-call|video-call`。桌面布局下会先把一次性的 `callAction=voice|video` 写进 `/tabs/chat#conversationId=...`，桌面消息工作区接到后直接拉起当前线程里的桌面通话面板，并立刻清掉这层路由 flag，避免刷新后反复卡回旧通话页。
- 旧 `/chat/$conversationId/voice-call|video-call` 和 `/group/$groupId/voice-call|video-call` 这四条通话兼容页现在在桌面布局下也会继续把 `callAction=voice|video` 一起带进 `/tabs/chat#conversationId=...`。之前它们虽然会把用户带回桌面消息工作区，但通话动作本身会在兼容跳转时被直接丢掉。
- 旧 `/chat/$conversationId/details`、`/chat/$conversationId/search`、`/group/$groupId/details`、`/group/$groupId/search`，以及群公告 / 成员管理 / 群信息编辑 / 旧通话兼容页这批桌面聊天兼容壳，现在也会把旧 hash 里的 `#chat-message-*` 或 `message=` 一起收进 `/tabs/chat#conversationId=...&messageId=...`。之前这些页面虽然能把用户带回桌面消息工作区，但原来的消息定位态会在兼容跳转时被直接丢掉。
- `/group/new` 这条桌面分支也已经继续收口：桌面发起群聊对话框关闭时不只会回原桌面会话，像桌面通讯录“群聊”视图和旧 `source=chat-details` hash 这类入口，也会直接回 `/tabs/contacts#pane=groups` 或 `/tabs/chat#conversationId=...&panel=details`；创建成功后会直接进入新群的 `/tabs/chat#conversationId=...`。之前这条桌面分支还会把用户带去旧 `/contacts/groups`、`/chat/$conversationId/details` 和 `/group/$groupId`。
- 桌面小程序里的群接龙返回按钮也已经对齐：桌面工作区里点“返回群聊”会直接回 `/tabs/chat#conversationId=...`。之前这里还会把桌面用户带去移动 `/group/$groupId`；手机复制继续这条链路仍保留移动协议，不受影响。
- 桌面“聊天背景 / 群背景”两页的顶部返回按钮也已经改成直接回桌面消息详情侧栏：优先遵守现有 `returnPath/returnHash`，没有的话就兜底回 `/tabs/chat#conversationId=...&panel=details`。之前这里还会先落旧 `/chat/$conversationId/details`、`/group/$groupId/details`。
- 桌面群二维码页顶部的“返回群聊信息”按钮现在也直接回桌面消息详情侧栏：优先走已有 `returnPath/returnHash`，没有就兜底回 `/tabs/chat#conversationId=...&panel=details`。之前这里还会先落旧 `/group/$groupId/details`。
- 桌面直聊 / 群聊通话页自己的桌面 fallback 也已经收口：`返回聊天继续 / 返回群聊继续` 会直接回 `/tabs/chat#conversationId=...`，`查看聊天信息 / 查看群聊信息` 会直接回 `/tabs/chat#conversationId=...&panel=details`。之前这两页虽然已经有桌面布局分支，但按钮还在落旧 `/chat/*`、`/group/*/details` 路径。
- 桌面群聊线程顶部公告区旁边那个“公告页”按钮也已经收口到桌面详情侧栏：现在会直接打开 `/tabs/chat#conversationId=...&panel=details&detailsAction=announcement`，不再从桌面消息工作区跳去旧 `/group/$groupId/announcement` 再二次重定向回来。
- 桌面聊天 / 群聊里的联系人名片入口也已经收口：如果该角色已经是好友，点名片会直接回 `/tabs/chat#conversationId=...`；不再从桌面消息工作区漏回旧 `/chat/$conversationId`。未加好友的名片仍继续走桌面“添加朋友”工作区。
- 桌面消息工作区里的“消息提醒”卡片现在也不再把用户带回旧 `/chat` `/group`。提醒入口会在桌面布局下改走 `/tabs/chat#conversationId=...&messageId=...`，直接在当前桌面消息工作区定位到原消息；手机提醒浮条和复制链路仍保持原来的移动协议不变。
- 根布局上的“强提醒”本地通知现在也已经和桌面消息协议对齐：桌面下会把 `/tabs/chat#conversationId=...&messageId=...` 当成当前会话与通知落点，不再继续按旧 `/chat/$conversationId#chat-message-*` 判断活跃会话或发通知，避免桌面点通知后又被带回旧移动聊天页。
- 旧 `/chat` 消息列表地址现在在桌面布局下也会主动自愈回 `/tabs/chat`。之前这条旧地址虽然会直接渲染桌面消息工作区，但 URL 本身不会收口，刷新或复制当前地址时仍会长期残留旧移动消息列表路径。
- 旧 `/contacts` 通讯录地址现在在桌面布局下也会主动自愈回 `/tabs/contacts`。之前这条旧地址虽然会直接渲染桌面通讯录工作区，但 URL 本身不会收口，刷新或复制当前地址时仍会长期残留旧移动通讯录路径。
- 旧 `/profile` 资料页地址现在在桌面布局下也会主动自愈回 `/tabs/profile`。之前这条旧地址虽然能打开“我”的共享页，但 URL 本身不会收口，桌面壳右上角资料态也不会把它识别成同一条资料链路；现在旧资料页、桌面资料工作区和桌面设置会统一落在同一套桌面协议上。
- 桌面资料页里的“设置”入口现在不会再把用户带回旧 `/profile/settings`，而旧 `/profile/settings` 设置地址本身也会在桌面布局下主动自愈回 `/desktop/settings`。之前这条旧路径不只会长期残留在桌面地址栏里，还会让设置页标题和返回按钮误走“资料页”协议；现在桌面设置统一收口到 `/desktop/settings`，桌面壳右上角“我”的资料态也会把 `/desktop/settings` 识别成同一条桌面资料链路。
- `desktop/mobile` 里的“设置”快捷卡片现在也把“复制到手机”和“桌面打开”拆成了两套协议：复制继续保留 `/profile/settings`，桌面打开则直接落 `/desktop/settings`。之前这里两个按钮共用同一条旧设置路径，桌面入口还会先落一次旧 `/profile/settings` 再靠页面自愈。
- 资料页和设置页共用的三份协议文档现在也会按布局回到正确的设置页：桌面返回 `/desktop/settings`，移动继续返回 `/profile/settings`。之前文档页顶部返回按钮写死旧设置路径，桌面里从“隐私政策 / 服务条款 / 社区规范”返回时仍会复活 `/profile/settings`。
- 旧 `/favorites` 收藏地址现在在桌面布局下也会主动自愈回 `/tabs/favorites`。之前这条旧地址虽然能打开桌面收藏工作区，但 URL 本身不会收口，还会继续污染内嵌笔记编辑器默认写入的 `returnTo`；现在收藏页主路径和笔记入口返回地址都会统一收成 `/tabs/favorites`。
- 旧 `/notes` 笔记兼容地址现在在桌面布局下如果没有附带 hash，会默认收回收藏里的“笔记”分类，而不是只落到裸 `/tabs/favorites`。之前这页文案虽然写的是“回到收藏里的笔记视图”，但无 hash 的旧地址实际只会打开全部收藏。
- 旧 `/chat/$conversationId`、`/group/$groupId` 聊天地址现在在桌面布局下也会主动自愈回 `/tabs/chat#conversationId=...`，并保留 `highlightedMessageId`。之前这些旧地址虽然能在桌面里渲染工作区，但 URL 本身不会收口，刷新或继续复制当前地址时仍会长期残留旧移动聊天路径。
- 旧直聊地址里的游戏邀约 route context 现在在桌面布局下也会先把 `/games`、`/discover/games` 归一成 `/tabs/games`。之前桌面聊天里的“回到组局 / 回到游戏”虽然最终能二次自愈回桌面游戏中心，但入口动作本身还是会先落旧 discover 路径；现在会直接回桌面游戏工作区。
- 旧 `/official-accounts/service/$accountId` 和 `/chat/subscription-inbox` 这两条公众号消息地址现在在桌面布局下也会主动自愈回 `/tabs/chat#officialView=...`，并继续带上 `articleId`。之前这两条旧地址虽然能在桌面里渲染消息工作区，但 URL 本身不会收口，刷新或继续复制当前地址时仍会长期残留旧服务号 / 订阅号路径。
- 旧 `/discover` 发现页地址现在在桌面布局下也会主动自愈回 `/tabs/discover`。之前这条旧地址虽然会直接渲染桌面发现工作区，但 URL 本身不会收口，而且桌面里的“摇一摇”等入口还可能继续把旧 `/discover` 写进 `returnPath`；现在都会统一收成 `/tabs/discover`。
- 桌面发现页里的“摇一摇”按钮现在也不再先跳旧 `/discover/encounter` 再被桌面重定向拦回发现页了；它会直接在桌面发现工作区里执行随机相遇，把结果写入通讯录并刷新好友申请 / 会话相关数据，避免桌面按钮看起来能点、实际只是在原地兜一圈。
- 旧 `/discover/moments` 朋友圈地址现在在桌面布局下也会主动自愈回 `/tabs/moments`；同时桌面朋友圈跳好友朋友圈时，`returnPath` 也统一收成 `/tabs/moments`，并兼容修正历史上已经写进好友朋友圈 hash 的旧 `/discover/moments` 返回地址，不再让旧 discover 路径在回跳链路里反复复活。
- 桌面朋友圈总工作区自己的路由态现在也会把旧 `returnPath=/discover/moments` 收成 `/tabs/moments`。之前只要桌面地址里还残留这类旧返回目标，当前页虽然已经在 `/tabs/moments`，但点“返回上一页”仍会把旧 discover 路径重新带活；现在总朋友圈和好友朋友圈两边都只认桌面返回地址。
- 旧 `/discover/moments/publish` 在桌面布局下现在也会把原来的 `returnPath / returnHash` 一起带回 `/tabs/moments`，不再只是裸跳朋友圈工作区。之前这条旧发表页虽然会回桌面朋友圈，但会把来源上下文直接丢掉；现在从旧链接或旧返回链路进来后，后续返回仍能命中原桌面来源。
- 桌面视频号的路由态现在也会把旧 `returnPath=/discover/channels` 直接收成 `/tabs/channels`。这样不只是工作区页面和旧作者页 `/channels/authors/$authorId` 在桌面下折回 `/tabs/channels` 时会归一，历史 hash 本身在被解析或重新写回时也不会再把旧 discover 返回地址原样带活。
- 桌面看一看、游戏中心、小程序工作区现在也会把旧 `returnPath` 一起收敛掉：旧 `/discover/feed`、`/games`、`/discover/games`、`/discover/mini-programs` 在桌面自愈到 `/tabs/*` 时，不会再把这些旧返回地址继续写进新的 hash/search；游戏中心发出的组局邀约路径也会跟着改吃收敛后的桌面返回地址，避免旧 discover 路径从“返回上一页”或“回到刚才页面”链路里再次复活。
- 桌面视频号工作区已补分栏切换入口，并把当前 `section` 与作者页回收链路继续对齐，刷新或从作者页折返时不会丢 `推荐 / 朋友 / 关注 / 直播` 上下文。
- 桌面视频号作者侧栏现在会在主区切到其他作者内容时自动收敛，避免右侧作者资料和当前视频内容错位。
- 桌面视频号作者资料查询和侧栏渲染现在只会吃纠偏后的 `authorId`，主区切作者时不会再短暂渲染旧作者侧栏。
- 桌面视频号现在只会在当前选中视频仍属于同一作者时保留 `authorId`；如果原 `postId` 已失效、主区回退到其他视频，右侧作者侧栏和 hash 里的旧作者上下文都会一起收回，不再出现“主区是新视频、侧栏还是旧作者”的串号。
- 桌面搜索、看一看、视频号、游戏、小程序这几条共享页现在都会在桌面布局下主动校验 `pathname`，即使旧 `/search`、`/discover/feed`、`/discover/channels`、`/discover/games`、`/discover/mini-programs` 地址里的 hash/search 已经和当前工作区状态一致，也会立刻 `replace` 回对应的 `/tabs/*` 主路由，不再出现“界面已经是桌面工作区、URL 还残留旧移动路径”的漂移。
- 桌面游戏中心现在会按原始 `?game=` / `?invite=` query 同步恢复选中游戏和当前组局邀约，刷新或从外部入口跳回时不再丢上下文；切到其他游戏时也会自动收掉不匹配的旧邀约面板。
- 桌面小程序工作区现在会按原始 `?miniProgram=` / `sourceGroupId` query 恢复选中入口和群接力上下文，刷新或从搜索结果跳回时不再丢状态；切到非 `group-relay` 小程序时也会自动收回旧群上下文，避免顶部提示、返回群聊按钮和接力链接串到其他小程序。
- 桌面公众号工作区现在会在切账号时自动丢弃旧账号文章选中态，避免“账号 B 主页里还带着账号 A 文章上下文”的串号。
- 桌面公众号工作区现在会在 `accounts` 模式下同时回收失效或缺失的 `accountId` / `articleId`：旧文章如果仍属于当前有效账号会被保留，不属于当前账号时会自动切回当前有效文章或清空文章，避免界面已经纠偏到账号 A、URL 却还残留账号 B 或旧文章上下文，导致刷新或切模式后继续串号。
- 桌面公众号工作区现在也会把旧地址里缺失的 `officialMode=accounts` 自动补回 URL：如果 hash 里已经带了 `accountId`，界面虽然会本地退到“按号查看”，但外层聊天 / 通讯录路由以前不会自愈，后续再点“公众号”入口时可能又误跳回 feed；现在会直接把 `accounts` 模式收敛回 hash。
- 桌面公众号工作区和桌面订阅号工作区现在连自己的无回调 fallback 也统一只会回桌面通讯录 `pane=official-accounts&officialMode=accounts`。之前这两处桌面组件内部还残留旧 `/official-accounts/$accountId` 兜底，一旦宿主没接回调，就会从桌面工作区串回旧公众号详情页。
- 桌面服务号消息线程现在连自己的无回调 fallback 也会留在桌面消息工作区：打开公众号主页会回 `/tabs/chat#officialView=official-accounts&officialMode=accounts...`，打开文章和关闭文章则回 `/tabs/chat#officialView=service-account...`。之前这处桌面组件只要宿主没接 `onOpenAccount / onOpenArticle / onCloseArticle`，账号主页就会掉回旧 `/official-accounts/$accountId`，文章开关也会直接失效。
- 旧 `/official-accounts` 这条桌面公众号列表入口现在也会在源头直接写 `officialMode=feed`，不再先产出一份只有 `pane=official-accounts` 的半成品 hash，再依赖通讯录工作区自己推断默认模式。
- 旧 `/contacts/starred`、`/contacts/tags`、`/contacts/groups`、`/contacts/world-characters`、`/contacts/official-accounts` 这批桌面通讯录兼容页现在也会保住当前桌面 hash 里的选中态。星标朋友会继续带上当前 `characterId`，标签页会继续带上 `tag + characterId`，群聊页会继续带上当前选中群，世界角色会继续带上当前角色，公众号列表则会继续带上现有 `officialMode/accountId/articleId`；不再因为旧路径自愈而退成裸 pane，导致原来的桌面选中上下文丢掉。
- 桌面搜索、搜索启动器和收藏页里如果还命中旧 `/contacts/official-accounts` 目标，现在也会直接收敛成显式 `officialMode=feed` 的桌面公众号列表地址；不再从旧快捷入口重新产出一份缺 mode 的列表 hash。
- 桌面搜索、搜索启动器和收藏页里如果还命中旧 `friend-requests / contacts/starred / contacts/tags / contacts/groups / contacts/world-characters` 目标，现在也会直接收敛到桌面通讯录工作区自己的 pane hash，不再先落这些旧移动通讯录页，再靠页面级重定向补救。
- 桌面搜索、搜索启动器和收藏页现在也会保住旧 `/contacts/*` 目标里已经带上的桌面选中态。之前 `/contacts/tags#pane=tags&tag=...&characterId=...`、`/contacts/groups#pane=groups&characterId=...`、`/contacts/official-accounts#pane=official-accounts&officialMode=accounts&accountId=...&articleId=...` 这类旧收藏或搜索目标，虽然会被收敛进桌面通讯录，但打开后只剩裸 pane；现在对应的 `tag / characterId / officialMode / accountId / articleId` 都会继续保住。
- 桌面搜索、搜索启动器和收藏页现在也会把旧 `/friend-moments/$characterId` 目标直接收成 `/desktop/friend-moments/$characterId`。之前这类旧好友朋友圈链接会在桌面里原样打开移动页，既不会自愈到桌面工作区，也容易丢掉现有的返回状态；现在会统一走桌面好友朋友圈路径，并继续保住 hash 里的返回上下文。
- 桌面搜索、搜索启动器和收藏页里的旧 `/contacts/official-accounts` 目标现在也会把“缺 `officialMode`、但已经带 `accountId/articleId`”的半成品 hash 自动补成 `accounts`。之前这类旧桌面收藏或搜索目标会被误收成 `feed + accountId/articleId`，后续还得再靠公众号工作区二次纠偏。
- 桌面搜索、搜索启动器和收藏页里的旧 `/official-accounts/$accountId` 目标现在也会像兼容页一样保住同账号下的 `articleId`。之前这类旧公众号主页链接虽然能回到桌面通讯录，但会把当前正文选中态抹掉；现在如果 hash 已经指向同一个账号，会继续带上原来的文章选择。
- 桌面搜索、搜索启动器和收藏页里的旧 `/official-accounts/articles/$articleId` 目标现在也会一起保住同篇文章附带的 `accountId`。之前这类旧文章链接只会带着 `articleId` 回桌面通讯录，一旦正文失效或还没完成账号纠偏，原来的公众号账号上下文就会先丢；现在如果 hash 已经指向同一篇文章，会继续把对应账号一起带回去。
- 桌面搜索、搜索启动器和收藏页现在还会保住旧服务号/订阅号目标里的 `articleId`。之前 `/official-accounts/service/$accountId#articleId=...` 和 `/chat/subscription-inbox#articleId=...` 这类旧目标虽然会被收敛进桌面消息工作区，但只改了路径没带上文章上下文，打开后会直接丢正文选中态。
- 旧 `/official-accounts/service/$accountId` 和 `/chat/subscription-inbox` 这两条桌面兼容壳现在只会在 hash 本来就属于同一条 official 视图时继续带 `articleId`。之前只要当前 hash 里有文章 id 就会原样带走，服务号和订阅号之间有机会互相串旧正文；现在裸 legacy hash 仍会保住文章选中态，但来自另一条 official 视图的旧 `articleId` 会先被丢掉。
- 桌面搜索、搜索启动器和收藏页对这两类旧 official 目标也补成了同一套“同视图才保留正文”的规则，不再把服务号旧 hash 里的 `articleId` 误带进订阅号，或把订阅号旧正文误带进服务号线程。
- 桌面搜索页和桌面搜索启动器里的角色详情入口现在也会带上 `/tabs/search` 的 `returnPath / returnHash`。之前从搜索结果、联系人建议、世界角色建议或旧角色快捷链接打开资料页后，返回经常只能掉回普通通讯录；现在会直接回当前搜索工作区，并保住当前关键词与来源上下文。
- 旧 `/official-accounts/$accountId` 这条桌面详情入口现在也会在源头直接写 `officialMode=accounts`，并且如果当前桌面通讯录 hash 已经选中了同账号下的一篇文章，也会把这层 `articleId` 一起保住；不再先产出一份缺 mode 的半成品 hash，或在旧详情自愈时把当前公众号文章上下文冲掉。
- 桌面内部几条继续跳公众号主页/文章的入口现在也统一显式写 `officialMode=accounts` 了，包括公众号文章独立窗口里的“打开公众号主页”和 `desktop/mobile` 里的官方 handoff 卡片；不再继续产出带 `accountId/articleId` 但缺 mode 的半成品 hash。
- 旧 `/official-accounts/articles/$articleId` 这条桌面文章入口也不再继续写“只带 `articleId`、不带 mode”的回跳状态了；现在文章窗口自己的 `returnTo` 也会显式带上 `officialMode=accounts`，避免回桌面通讯录时继续依赖工作区侧推断模式。
- 旧 `/official-accounts/articles/$articleId` 这条桌面文章入口现在也会在当前 hash 已经指向同一篇文章时继续保住现有 `accountId`。之前兼容壳只会把 `articleId` 带回桌面通讯录，一旦正文失效或账号纠偏还没完成，账号上下文会先丢；现在同篇文章的旧链接回桌面时会继续保留原来的公众号账号。
- 桌面公众号工作区的“服务号消息 / 订阅号消息” fallback，以及 `desktop/mobile` 里的“桌面回到当前工作区” official handoff，现在都统一改成直达 `/tabs/chat#officialView=...`；不再先跳旧的 `/official-accounts/service/...` 或 `/chat/subscription-inbox` 页面，再靠桌面布局二次转发，避免桌面官方消息入口继续挂在旧路径协议上。
- 桌面公众号工作区现在会在 feed 模式下校验当前可见文章列表，服务号/订阅号带回来的旧 `articleId` 如果已经不在列表里，会自动回收到首条有效内容，并把这条 fallback 结果继续写回聊天 / 通讯录 hash，避免界面已经高亮新文章、URL 却还残留旧 `articleId`。
- 桌面订阅号消息工作区现在会在进入时校验 `articleId` 是否仍在当前 inbox 列表里，旧文章上下文会自动回收到首条有效订阅；如果当前 inbox 已空，也会把旧 `articleId` 从路由里收回，避免界面已经回到空列表但 URL 还残留旧文章上下文。
- 桌面服务号消息线程现在会在打开文章时同时校验文章所属账号和文章是否仍然存在；跨账号或已删除的旧 `articleId` 都会自动回退到当前服务号线程，不再出现“会话头部是 B 号、正文却还是 A 号文章”或“正文卡在失效文章错误页”的错位。
- 桌面广场动态工作区现在会在当前列表不再包含路由里的 `postId` 时自动清空详情选中态，避免主列表已经换批、右侧详情还停在旧动态上。
- 桌面总朋友圈现在只会把 `character` 作者送进好友朋友圈工作区；点到“我”的动态或吃到错误 `authorId` 时会留在桌面朋友圈并自动清掉无效作者路由，不再跳进不存在的角色朋友圈页。
- 桌面收藏工作区已把 `category + sourceId` 写入 URL，并把“收藏 -> 笔记编辑 -> 返回收藏”的返回地址补回当前 hash，刷新或关闭笔记编辑后不会退回默认列表。
- 桌面笔记编辑器现在会在原笔记已被删除、但本地仍残留草稿时自动降级为“新笔记保存”，避免继续拿失效 `noteId` 走更新接口。
- 已补桌面专项审计命令：
  - `pnpm --filter @yinjie/app lint:desktop-web`
  - `pnpm --filter @yinjie/app audit:desktop-web:routing`
  - `pnpm --filter @yinjie/app audit:desktop-web`
  - `pnpm audit:desktop-web`

## 历史问题记录

### P0

- 桌面好友朋友圈路由状态只记录了 `source` 和 `momentId`，没有统一的 `returnPath` / `returnHash`。
- 结果：从 `通讯录 / 星标朋友 / 标签 / 朋友圈 / 聊天头像卡片` 进入 `"/desktop/friend-moments/$characterId"` 后，返回只能回到宽泛入口，不能恢复原工作区里的精确选中态。
- 相关文件：
  - `apps/app/src/features/moments/friend-moments-route-state.ts`
  - `apps/app/src/routes/friend-moments-page.tsx`
  - `apps/app/src/routes/contacts-page.tsx`
  - `apps/app/src/routes/moments-page.tsx`
  - `apps/app/src/features/desktop/chat/desktop-message-avatar-popover.tsx`
  - `apps/app/src/features/desktop/chat/desktop-chat-details-panel.tsx`

- 桌面标签工作区当前没有把 `selectedTag` 和 `selectedCharacterId` 写进 URL。
- 结果：从标签页打开角色资料再返回时，最多只能回到 `pane=tags`，无法恢复到原来的标签分组和联系人上下文。
- 相关文件：
  - `apps/app/src/features/desktop/contacts/desktop-contacts-tags-pane.tsx`
  - `apps/app/src/features/contacts/contacts-route-state.ts`
  - `apps/app/src/routes/character-detail-page.tsx`

### P1

- 当前工作区里已经在补桌面资料页返回链路、桌面通讯录星标/标签入口和桌面广场动态选中态同步，但这些修复还处于未提交状态，仍需要合并后做整链路回归。
- 结果：如果这些改动中途被打断，桌面布局仍容易出现“能打开详情，但刷新或返回后丢上下文”的回归。
- 重点文件：
  - `apps/app/src/routes/character-detail-page.tsx`
  - `apps/app/src/routes/contacts-page.tsx`
  - `apps/app/src/routes/discover-feed-page.tsx`
  - `apps/app/src/features/desktop/feed/desktop-feed-workspace.tsx`

- 项目此前没有桌面 Web 专项审计命令，桌面回归依赖全量 `lint/build`，不利于高频修复时快速聚焦。

## 建议修复顺序

1. 继续做桌面专项回归
- 执行 `pnpm --filter @yinjie/app audit:desktop-web`
- 或在仓库根目录执行 `pnpm audit:desktop-web`
- 手工走以下链路：
  - 通讯录 -> 星标朋友 -> 资料页 -> 返回
  - 通讯录 -> 星标朋友 -> 资料页 -> 删除联系人
  - 通讯录 -> 标签 -> 资料页 -> 返回
  - 通讯录 -> 标签 -> 资料页 -> 删除联系人
  - 通讯录 / 朋友圈 / 聊天头像卡片 -> 好友朋友圈 -> 返回
  - 通讯录 / 朋友圈 / 聊天头像卡片 -> 好友朋友圈 -> 资料页 -> 返回
  - 广场动态 / 视频号 -> 详情选中 -> 刷新 -> 返回
  - 收藏 -> 切分类 / 选条目 -> 刷新
  - 收藏 -> 笔记 -> 关闭 / 返回

2. 再看剩余桌面上下文问题
- 如果手工回归还有“返回到正确页面但没恢复正确筛选条件”的问题，再考虑把搜索词等次级 UI 状态也纳入 URL。

## 修复准备现状

- 已确认桌面 Web 当前没有阻塞构建的静态错误。
- 已补桌面 Web 专项审计脚本，后续可以在每次修复后快速复跑。
- 当前剩余工作以手工回归和边界场景核验为主，不再是主干路由协议缺失。
