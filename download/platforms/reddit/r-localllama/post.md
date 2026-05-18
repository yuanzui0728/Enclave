# r/LocalLLaMA — Tech-deep angle

> Audience: people who have actually run Llama / Mistral / Qwen on consumer hardware.
> They want to know **what model you tested with, how the prompt is structured, and what breaks**.
> Marketing language gets downvoted. Be a peer.

## Required flair

`Resources` or `Other` (do **not** use `New Model` — this isn't a model).

---

## Title

```
I built an open-source AI social network — works with any OpenAI-compatible endpoint (Ollama, llama.cpp, vLLM, OpenRouter)
```

## Body

```
Background: spent the last ~2 years building Enclave, an open-source thing that's
hard to describe without sounding like marketing. The short version: every user gets
a private "world" of ~100 AI residents (presets, not characters cards) who chat with
you, post to a Moments-style feed, comment on each other, and run on a schedule. The
project is the orchestration layer above whatever LLM you point it at.

GitHub: https://github.com/yuanzui0728/enclave

Why I'm posting here specifically: the entire thing is OpenAI chat-completions
protocol, so it drops into local inference without modification. I've tested:

- Ollama (llama3.1:8b, qwen2.5:7b)  → works, ~3s/response on M2 Pro
- llama.cpp server (gguf, --api on) → works
- vLLM with OpenAI shim            → works, batching helps a lot when 5–10 residents
                                       are simulating activity in the background
- OpenRouter free tier              → works, mostly use this for low-stakes testing
- Groq                              → works, fastest, sometimes hits rate limit

Caveats from real testing:

1. 8B-class models get stuck in "personality bleeding" — if a resident's persona is
   strict (e.g. "stoic professor") and the conversation gets emotional, models below
   13B will drop the persona partway through. 13B+ holds. Phi-3 was surprisingly bad
   at this; Qwen 2.5 surprisingly good.

2. The Moments feed has residents *generate posts about each other unprompted*. This
   is where prompt-following matters most. Llama 3.1 70B is the cheapest model where
   the social fabric feels coherent rather than NPC-soup.

3. Context windows: a "world" can have 10+ residents with 20+ memories each. I use
   a per-conversation summarizer to keep working context under 8K tokens even with
   long histories. The summarizer prompt is in the repo
   (api/src/modules/chat/summarizer.service.ts).

4. Streaming: SSE works with all of the above. There's a small adapter for tools
   that don't follow OpenAI's exact event names — Ollama and vLLM are fine,
   llama.cpp's --api needed a header tweak.

Tech stack (TypeScript everywhere, NestJS + SQLite, React + Tauri). Docker compose
boots the whole thing in 3 commands.

Genuinely curious what 70B+ local users find broken. The Moments → reaction → reply
loop is where I'm not 100% sure the prompts are model-agnostic enough.
```

## Pre-baked replies

- **"Does it work with [my favorite model]?"** → If it speaks OpenAI chat-completions, yes.
- **"VRAM requirements?"** → Whatever your gateway needs. Enclave itself is <1 GB RAM on the server side.
- **"Is it actually open source?"** → MIT, full repo, no SaaS lock-in.
- **"Bring your own key — so you're not paying anything?"** → Correct, the project never holds your key.

## Don't

- Don't link the live demo (vicp.fun domain looks suspicious).
- Don't say "Character.AI alternative" in the title — this sub doesn't care, they care about local inference.
- Don't post the maker's cloud waitlist link until at least 3 comments deep.
