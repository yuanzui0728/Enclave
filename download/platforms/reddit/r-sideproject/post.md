# r/SideProject — Builder story angle

> Audience: other indie builders who want to know the build journey, not the tech.
> They reward honest stories about what didn't work, what surprised you, and what's next.
> Marketing-y "Introducing my product" posts get downvoted.

## Required flair

`Sharing` or `Update`

---

## Title

```
After 2 years of nights & weekends, I shipped my open-source Character.AI alternative — now I have to figure out if it's a side project or a business
```

## Body

```
Hi r/SideProject. This is half a launch, half a "what would you do in my shoes?" post.

The project: Enclave (https://github.com/yuanzui0728/enclave) — an open-source AI
social network where every user gets a private world of ~100 AI residents who chat
with you and with each other.

The history:

- Started in late 2023 as "what if my Character.AI conversations didn't disappear
  when the company pivots?" — 1-file Node script, hardcoded prompts.
- 6 months in: the chat part worked but felt empty. AI residents need to do things
  when you're not looking, otherwise the world has no temperature. Spent 4 months
  building a Moments feed (AI posts unprompted) + a schedule system (residents have
  jobs, free time, sleep cycles).
- 12 months: my friends started using it. Logs showed they came back every day —
  not for the chat, but to read what the residents had been doing without them.
  That was the "oh, this is actually a thing" moment.
- 18 months: shipped multi-tenant (each user = an isolated SQLite + process). Added
  Tauri desktop builds. Did a Chinese-language launch via a few content channels,
  got ~200 organic users.
- 24 months (now): the codebase is ~150K LoC of TypeScript across ~30 NestJS
  modules. Four languages (zh / en / ja / ko). I'm full-time on it as of this month.

The decision point I'm sitting on:

I quit my job to do this. I have ~3 months of runway. The product works but the
distribution doesn't — almost all users came from Chinese channels, and the
business model needs international users to pay for hosted versions. So I'm
flipping the order: ship the English open-source experience first (a Show HN goes
up next week), see if the international self-hosting crowd takes to it, then open
a Cloud waitlist for people who don't want to run Docker.

Two things I keep flip-flopping on:

1. **MIT or AGPL?** I picked MIT to be friendlier to forks, but a friend pointed
   out that the moment a bigger player wraps this, MIT means I have no leverage.
   What did you pick for similar projects and would you do it again?

2. **Cloud-hosted vs always-self-host?** The cloud option has ~95% gross margin
   on paper (DeepSeek API + tiny VPS). But it's a different business — support
   load, abuse handling, GDPR. I'm tempted to stay pure-OSS and monetize via
   custom hosting / consulting / enterprise licenses. The flip side is that PMF
   is faster to find when you control the deployment.

Tech stack for the curious: NestJS + SQLite + React + Tauri, BYOK (Bring Your
Own LLM Key — works with Ollama, OpenRouter, Groq, DeepSeek, OpenAI, anything
that speaks the chat-completions protocol).

Open to any feedback — especially from anyone who's made the OSS-to-business
transition.
```

## Pre-baked replies

- **"How are you paying for development now?"** → Savings + family. Window is 3 months. Need to either find MRR or pull the cord.
- **"Did you do PMF before quitting?"** → Honestly no. I had ~200 active users who came back, but they were Chinese-only and not paying. That's not PMF — that's "people like this for free."
- **"What's the unit economics on Cloud?"** → DeepSeek is $0.07/M tokens; a heavy user is <1M/month; VPS is $5/month for 30 users. ~$1/user/month cost on a $15/month plan = ~93% margin if I can fill it.
- **"Why open source?"** → Without it, no HN, no Show HN, no organic GitHub crowd. The OSS *is* the marketing.

## Don't

- Don't humblebrag. This sub reads through it.
- Don't ask for upvotes or stars. Let the link be a link.
- Don't be defensive about the runway question. Saying "3 months and I'm scared" is more relatable than "I have a strategic timeline".
