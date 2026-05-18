# r/OpenSourceAI (or r/MachineLearning if posting research-flavored) — Ecosystem angle

> Audience: developers + researchers interested in the open-source AI ecosystem.
> Care about: licensing, reproducibility, what fills a real gap vs what's redundant.

## Required flair

`Project` (or `News` in r/MachineLearning — but only if you can frame the orchestration as novel)

---

## Title

```
Enclave: open-source attempt at the "social AI" gap — every user gets a private world of LLM residents, MIT licensed
```

## Body

```
The open-source AI stack has solid pieces for:

- Inference (llama.cpp, vLLM, Ollama)
- Chat frontends (Open WebUI, LibreChat, SillyTavern)
- Agent frameworks (LangChain, LlamaIndex, Autogen)
- Character cards (TavernAI, KoboldAI ecosystem)

But there's a gap that nobody seems to be filling: **AI residents living in a
shared social space, on the user's own hardware, with persistent state.**
Character.AI does this in their cloud and won't open-source it. Replika is closed.
Inworld is enterprise-only.

I've been building toward that gap. Repo:
https://github.com/yuanzui0728/enclave (MIT, TypeScript).

What it does that the existing pieces don't:

1. **Social graph between AI residents** — they form friendships (strength 0–100),
   share inside jokes, react to each other's Moments posts, occasionally have
   conflicts. The graph evolves without user input.

2. **Schedule system** — residents have wake/sleep cycles, work hours, free time.
   They post about their day at plausible hours. The "world clock" is a shared
   tick across the instance.

3. **Memory architecture** — per-resident, per-relationship summarization layered
   on top of raw chat history. Working context stays under 8K even after months
   of conversation.

4. **Moments feed** — AI-generated unprompted posts with comment threads where
   *other AI* react. This is the part that took longest to get right and is
   where most of the "feels alive" comes from.

5. **Model-agnostic** — speaks OpenAI chat-completions, so any
   inference backend (Ollama, vLLM, llama.cpp's --api, hosted gateways) works.
   No fine-tuning required; everything is prompt-engineered.

What I'd love from this community:

- Architecture review of the social-graph + memory module — they're in
  api/src/modules/social/ and api/src/modules/narrative/. The patterns might be
  reusable for other multi-agent simulations.
- Recipe contributions to the HuggingFace dataset
  (https://huggingface.co/datasets/w9000/enclave-character-recipes) — there are
  10 seed character recipes there now; would love more.
- Issues, especially around prompt-following on smaller models (sub-13B).

Stack: NestJS + SQLite for one-user-per-process isolation, React + Tauri for
desktop, four-language UI (zh/en/ja/ko), AGPL? No — MIT. The intention is
explicitly to be a substrate other projects can build on.

Not a paper, not a benchmark, just a deployed system. Happy to dig into any
sub-component.
```

## Pre-baked replies

- **"Where's the eval?"** → No formal eval. Subjective only: residents stay in character on 13B+; relationships feel earned after ~30 interactions. I'd love help building a proper coherence metric.
- **"How does memory work without a vector DB?"** → Summarize per conversation, summarize per relationship, summarize per world-day. All stored as text in SQLite. No embedding store. Working theory: cheap recall via good summary > expensive recall via embeddings, at this scale.
- **"AGPL?"** → MIT.
- **"Is this a research project?"** → No, a deployed system. I'm trying to ship a product, not a paper.

## Don't

- Don't oversell — this audience smells hype from 5 sentences away.
- Don't promise SOTA anything. The interesting thing here is the *system*, not the model performance.
- Don't post the cloud waitlist URL in the OP. They want to read code.
