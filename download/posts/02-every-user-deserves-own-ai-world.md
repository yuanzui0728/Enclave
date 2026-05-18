---
title: "Every user deserves their own AI world — an architecture deep-dive"
slug: every-user-deserves-own-ai-world
date: 2026-06-01
status: draft
target_channels: [enclaveai.top/blog, hn-secondary, r/LocalLLaMA-followup]
word_count_target: 1800
---

# Every user deserves their own AI world

*An architecture deep-dive into how Enclave gives every user a private,
isolated world without burning down on hosting cost.*

---

If you're going to claim "one AI world per user," the architecture has to back
it up. This post is the design rationale and the implementation, with enough
detail that a competent backend engineer could rebuild it.

## The constraint

For each user, we want:

1. **Isolation**: their world is their world. No cross-contamination of memories,
   characters, or social graph state across users.
2. **Persistence**: schedules, relationships, Moments posts — everything has to
   survive restarts.
3. **Cheap**: at the limit, the per-user marginal cost should be measured in
   cents per month for storage, plus whatever the user spends on their LLM
   gateway.
4. **Self-hostable** by a single user, *and* multi-tenant in a way that doesn't
   require Kubernetes.

Most consumer AI products solve this by putting all users in one massive
multi-tenant database with row-level security. That works at scale but it
trades isolation for operational simplicity. We made the opposite trade.

## The shape: process-per-user, file-per-user

Each user gets:

- **An isolated SQLite database** at `data/accounts/{userId}/database.sqlite`
- **A dedicated Node.js process** running the same NestJS app as the
  single-user self-host
- **A unique port** allocated from a pool (8001–8999), accessed through a
  reverse proxy

The orchestrator is `apps/cloud-api` — a small NestJS service whose only job
is starting, stopping, and reverse-proxying these per-user processes.

Why this shape? Three reasons:

### Reason 1: the self-host code IS the multi-tenant code

When the world (per-user process) is identical to the single-user self-host,
every fix in the single-user path applies to the multi-tenant path with zero
adaptation. There's no "cloud-only" code path that drifts from the open-source
version. The hosted product is just "we run the self-host for you."

This matters specifically for Enclave because *the open-source version is the
canonical product*. If hosting forced a different code path, the hosted version
would inevitably diverge — and that's the closed-platform pattern we're trying
to avoid.

### Reason 2: SQLite scales further than people think

A single SQLite database per user, with one connection per process, handles
~100K writes/day comfortably on a $5 VPS. The largest writers in the system —
Moments generation, memory summarization, chat persistence — are all batched
and run on a schedule, not in user-request critical paths. So even active
users push <1K writes/day to their own DB.

The complete database for a heavy user after 6 months of use is ~50 MB. Storing
1000 users is 50 GB — fits on any modern disk, costs about $1/month at S3
prices, $0 on a local VPS. We don't need Postgres; we don't even need to think
about Postgres.

### Reason 3: blast radius is one user

When the inevitable bug hits — a runaway scheduler, an infinite loop in the
Moments generator, a corrupted state from a bad migration — it affects exactly
one user's process. The orchestrator's health check restarts that process. The
other 999 users never knew.

This is the same property a process-per-customer architecture gives you in any
domain (databases, browsers, mail servers). It's "OS isolation as a feature."

## The orchestrator

`apps/cloud-api/src/orchestration/world-lifecycle-worker.service.ts` is ~400
lines that handle:

1. **Port allocation** from a configurable pool, with conflict detection
2. **Process spawning** via `child_process.spawn`, environment-injected with
   the user's LLM credentials and per-user `DATABASE_PATH`
3. **Heartbeat tracking** — each world process pings the orchestrator every
   30s; missed heartbeats trigger restart
4. **Idle suspension** — worlds with no user activity for N hours suspend (the
   process exits cleanly); next request from the user wakes them
5. **Graceful shutdown** — `SIGTERM` is honored; the world commits any pending
   state before exiting

The MiniMax token plan (paid LLM gateway, when used) gets distributed across
worlds via a hash-stable scheme: each `worldId` is hashed and modulo'd against
the number of available keys, so a given world always gets the same key. This
makes per-world quota enforcement straightforward and doesn't require a shared
token-counter service.

## Per-user state, in detail

Inside each world's SQLite, the schema mirrors the single-user self-host
exactly. The interesting tables:

- **`residents`** — the AI characters in the world. Each has a persona,
  schedule, current state (mood, last-active, current-activity).
- **`friendships`** — a (resident_a, resident_b, strength) table tracking the
  social graph between residents. Strength is 0–100, evolves based on
  interactions.
- **`relationships`** — the analog of `friendships` but for (user, resident)
  pairs. Tracks how each resident feels about the user specifically.
- **`memories`** — text summaries at three granularities: per-conversation,
  per-relationship, per-world-day. We rely on summarization rather than vector
  embeddings; "cheap recall via good summary" outperforms "expensive recall
  via embedding lookup" at our message volume.
- **`moments`** — the Moments-feed posts. Each post has author (a resident),
  timestamp, generated content, and a comment thread.
- **`comments`** — comments on Moments. Authors can be the user, *or any other
  resident*. The "AI residents commenting on each other" loop is just rows in
  this table.

Everything is plain text in SQLite. No vector store, no external services, no
inference cache (the LLM gateway is responsible for that).

## The Moments loop

This is the part that took longest to feel right, so it deserves its own
section.

The naive version: cron job, every hour, pick a resident, ask an LLM to
generate a post in their voice. This makes a feed but the feed feels empty —
the residents post but don't *react*.

The version we shipped:

1. **Generation**: a scheduler runs every ~20 minutes. It picks a resident
   whose schedule says "free time now" and a topic (their current activity,
   today's world weather, a recent event from another resident).
2. **Reactions**: when a new Moments post lands, the scheduler queues 1–3
   *reactions* from other residents. Reactions are scored by friendship
   strength — close friends are more likely to engage.
3. **Threads**: a reaction that lands well (semantic similarity to author's
   tone) sometimes triggers a reply from the original author. Sometimes a
   third resident chimes in.

The threading dynamics are deliberately under-tuned. We don't try to model
"realistic" thread depth — we let it emerge from the cheap rules above. The
result: most posts get 0–2 reactions; a few get a small flurry; the feed has
a believable distribution without us hand-coding "realistic Twitter dynamics."

## Memory architecture

The single most surprising design choice in Enclave is that **we don't use a
vector store.**

Common wisdom in 2024–2025 was: long-running AI chat = vector store with
semantic retrieval. We tried it; it's hard to tune, expensive to host, and
ages badly (re-indexing on schema changes is real pain).

What we do instead:

1. After each conversation, summarize it in 200 words and save to the
   `memories` table tagged with `(user, resident, conversation_id)`.
2. Nightly, a "world summarizer" reads the day's memories and writes a
   `world-day` summary — a few paragraphs about what happened across all
   residents.
3. When a resident needs context, we pull the latest 5 per-pair memories
   (recent), the latest 3 world-day summaries (broad context), and inject
   them as system context.

Total context budget is held under 8K tokens *even after six months of usage*.

Why this works: humans don't recall conversations by embedding similarity.
They recall by summary. We're approximating the human path.

## What we still haven't solved

- **Per-character model routing** — different residents using different models
  (cheap for chitchat, smart for important conversations). On the v0.2
  roadmap. The plumbing exists, the UI doesn't.
- **Multi-world for a single user** — some users want a "work world" and a
  "personal world" with separate residents. Possible architecturally (just
  spawn two processes), no UI.
- **Real-world Provider integration** — residents proposing food orders,
  bookings, etc., via real APIs. Foundation exists in `action-runtime`; few
  Providers are wired up.
- **Mobile native app** — Tauri covers desktop. Mobile is on the roadmap but
  hasn't started.

## What this design implies for cost

A reasonable scale calculation for Enclave Cloud:

- 100 active users on a $5/mo VPS (4 GB RAM)
- Each user's idle process: ~30 MB RAM, ~2% CPU when active
- Each user's monthly LLM cost (via DeepSeek): ~$0.07 (because Enclave
  generates a lot of background activity, but each generation is short and
  per-token cheap)
- Each user's storage: ~50 MB
- Marginal monthly cost per user: ~$0.10 (LLM + storage + bandwidth)
- At $14.99/mo subscription: ~99% gross margin per user

The plan economics work because we're not trying to be a hyperscaler. SQLite
+ Linux + careful process management is enough for a four-figure user base on
one rented machine.

## Why this matters beyond Enclave

The pattern — "self-hostable single-tenant code that *is* the multi-tenant
code, with process isolation per user" — works for any product where:

- Per-user state is rich and durable
- The product is, or aspires to be, open-source self-hostable
- The user base is in the hundreds–thousands, not millions
- Isolation and predictability matter more than maximum density

I'd love to see more products built this way. The dominant pattern of "one
giant shared database with RLS" is fine for ad-supported social media. It's
the wrong shape for intimate or expressive products. And it's actively wrong
for products that say they're open-source self-hostable but actually require
a different stack to run hosted.

— *Yuanzui*

> *Enclave is MIT-licensed. The repo:
> https://github.com/yuanzui0728/enclave. The multi-tenant orchestrator code:
> `apps/cloud-api/`.*
