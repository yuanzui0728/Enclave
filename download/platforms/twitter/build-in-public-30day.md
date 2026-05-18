# Twitter / X — Build-in-Public 30-Day Plan

> Goal: 30 consecutive days of one focused tweet per day during the Month 1–2 push.
> Each day pairs **a builder anecdote with a visual artifact** (GIF, screenshot, or graph).
>
> Tone: candid, specific, not "Day 1: here's why I'm building..." LinkedIn cringe.
> Best examples: @levelsio, @marctingo, @dvassallo. Show, don't sell.

---

## The shape of a good tweet

```
[concrete fact or surprising number] +
[1-2 sentence story behind it] +
[GIF or screenshot]
[short link to repo, optional]
```

**Bad**: "Excited to share my journey building Enclave..."
**Good**: "Today the AI residents started arguing in group chat without me prompting them. Recorded this in disbelief. [gif]"

---

## 30-day content matrix

Each row is one tweet. Pick the order based on what you ship that week — the schedule below is the **suggested order**, not a deadline. Skip days when nothing genuine happened.

| Day | Theme | Hook | Visual |
|---|---|---|---|
| 1 | Origin | "2 years ago I got annoyed that my Character.AI conversations weren't mine. So I built this." | Today's product GIF |
| 2 | Tech | "The whole stack is BYOK — works with Ollama. Here's residents running on my MacBook with zero internet." | Screenshot of Ollama + Enclave |
| 3 | Resident | "Meet Lao Zhou. He's a retired chemistry teacher who comments on every Moments post about food. I made one resident, he started a movement." | Lao Zhou avatar + 3 of his comments |
| 4 | Behind-the-scenes | "How the Moments feed works — residents *generate posts about each other* in the background while you're not looking. Architecture sketch:" | Hand-drawn diagram |
| 5 | User feedback | "First HN comment that hit: 'this is what Replika could have been.' Saving this." | Screenshot of the comment |
| 6 | Bug confession | "Day-N bug: a resident kept proposing marriage to another resident every 4 hours. The schedule scheduler was firing the same idle hook in a loop. Fix:" | Code diff |
| 7 | Stat | "200 GitHub stars in 6 days. Mostly from r/SelfHosted. The lesson: people will star self-hostable things even if they don't run them." | Star history graph |
| 8 | Tech | "Memory architecture: per-conversation + per-relationship + per-world-day summaries, all in SQLite as text. No vector store. Working theory: cheap recall via good summary > expensive recall via embeddings, at this scale." | Schema diagram |
| 9 | Honest miss | "Tried to ship the Stripe integration today, blocked because I don't have Stripe Atlas yet ($500 I don't have). Going with Lemon Squeezy instead. Indie hacker tax." | (No visual needed — text-only OK) |
| 10 | Resident | "Two residents had a falling-out today. Relationship strength dropped from 78 → 22 over 3 days based on disagreements in group chats. I did not script this." | Relationship graph |
| 11 | Tech | "Multi-tenant in 80 LOC: each user gets a child Node process + isolated SQLite. Crashed processes don't take down neighbors. Architecture:" | docker stats screenshot |
| 12 | UX win | "Onboarding redesign — went from 'pick 14 residents' (paralysis) to 'pick 3, I'll add the rest' (50% completion → 90%)." | Before/after side-by-side |
| 13 | Community | "First non-zh translation contribution came in today. Korean. From a stranger on GitHub. I forgot people would do that for free." | PR screenshot |
| 14 | Stat | "Two weeks in: 500 stars, 30 issues, 8 PRs, ~50 self-host installs that ping the analytics opt-in. Conversion to active user looks like ~30%." | Funnel graph |
| 15 | Tech | "How I keep AI conversations under 8K context tokens after 6 months: a summarizer that runs nightly and writes to a 'distilled memory' table. Source:" | Code snippet |
| 16 | Resident | "Today a resident remembered something I told them 3 months ago in passing. The summarization pipeline actually works. Goosebumps." | Screenshot |
| 17 | Behind-the-scenes | "Building in public is hard when most days are 'I refactored an internal type today'. Reminder that the only metric that matters is whether a resident still feels alive." | (No visual — text only) |
| 18 | UX miss | "Tried to add a 'mute resident' feature today. Removed it 30 min later — if you can mute residents, the world feels less alive. Some features are bugs." | (No visual) |
| 19 | Tech | "Adding OpenRouter as a default gateway because their free tier means new users can try Enclave with $0. The whole onboarding now ends at 'paste your OpenRouter key'." | Screenshot of the onboarding |
| 20 | Number | "Cloud waitlist crossed 100. The most asked-for feature is 'mobile app that doesn't need Docker.' Working on it." | Waitlist screenshot |
| 21 | Resident | "Built a 'shake to meet a new resident' feature yesterday. Today people are using it to meet residents they've already met. The shake animation is the dopamine, not the new resident. Designing for this now." | GIF of shake-to-meet |
| 22 | Honest miss | "Tried to ship a music-generation feature using MiniMax's API. The free tier ran out on day 3. Disabled for self-hosters by default, opt-in only." | (No visual) |
| 23 | Tech | "TypeScript everywhere = one mental model. Backend types flow to frontend via @packages/contracts. Refactor breaks compile, not production." | Repo structure diagram |
| 24 | Community | "Discord at 100 members. Most active channel: #my-residents (people sharing their own AI residents). I should have made this from day one." | Discord screenshot |
| 25 | Stat | "GitHub stars over time, annotated with launches: HN Launch (+200), r/SelfHosted (+150), PH (+120), organic (+200/wk steady)." | Star graph with annotations |
| 26 | Roadmap | "Next 30 days: 1) Cloud Hosted ($14.99/mo, 50 slots) 2) Stripe via Lemon Squeezy 3) Mobile companion app. In that order. Whatever doesn't fit gets dropped." | (No visual) |
| 27 | Bug confession | "Mobile UI: reminder toast was rendering off-screen on iPhone notch devices. Took me 4 hours to realize CSS env(safe-area-inset-top) is the answer." | Before/after screenshot |
| 28 | Behind-the-scenes | "What 30 days of building in public did: 800 stars, 100 Discord, 20 paying waitlist commits, 1 marriage proposal between residents I have to debug." | Stat summary |
| 29 | User story | "A user emailed me a screenshot of a Moments post where a resident wrote a poem about their dead cat. I cried. I think this is why the thing exists." | (No screenshot — keep this one private; use blurred version or skip the visual) |
| 30 | Launch | "Cloud Hosted opens tomorrow for the first 50 people on the waitlist. Self-host stays free and open-source forever. Same product, different deployment. Link →" | Final hero shot |

---

## Visual asset prep

For each day with a visual, save the asset to:
```
download/platforms/twitter/assets/day-<NN>-<short-desc>.{png,gif,mp4}
```

Conventions:

- **GIFs**: ≤ 8 MB, 480p OK, no longer than 30 sec
- **Screenshots**: 1200 × 675 (Twitter's preview ratio)
- **Code snippets**: use [Carbon](https://carbon.now.sh/) with the `Night Owl` theme — minimal chrome, transparent background
- **Graphs**: keep axes labeled; this is X, not LinkedIn, but they still get screenshotted

---

## Thread strategy (use sparingly)

Threads work for: technical deep-dives (Day 4, 8, 11, 15), retro posts (Day 14, 25, 28).

Threads don't work for: resident anecdotes (single tweet is the punchline), bug confessions (one-and-done), launch announcements.

Max one thread per week. Most days should be one-tweet.

---

## Engagement tactics that work for indie builders

- **Reply, don't quote-tweet**. Quote-tweets read as defensive on X.
- **Tag people whose work you build on**, sparingly. (e.g. mention OpenRouter on Day 19, tag @OpenRouterAI.)
- **Reply within 30 min** when someone with an audience engages. Algorithm rewards conversation density.
- **Don't follow back for follow-back**. Builder bots smell this.
- **No "what should I build next" polls**. Decision-by-poll signals the maker doesn't know.

## Tactics that don't work

- ❌ "I'm building X. RT if you want early access." Begs are de-weighted.
- ❌ Tagging "AI Twitter" influencers cold.
- ❌ Daily streak humblebrags ("Day 47 of building in public!").
- ❌ Quote-RTing your own launch post repeatedly.

---

## Capture for retro

To `download/_shared/marketing/twitter-30day-retro.md`, log per tweet:

- Impressions
- Engagements (reply / repost / like)
- Profile visits
- Follow-through to GitHub stars (UTM if possible)

After 30 days, identify the 3 tweets with best conversion-to-star. The pattern in
those 3 is your evergreen template.
