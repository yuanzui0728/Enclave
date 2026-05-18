# HuggingFace — Release Playbook

> HF is **not a primary traffic channel** — but it's free distribution to the AI-research
> crowd and looks good in the README badges. The three repos are already wired; this is the
> manual you follow when you want to push an update.

---

## Current HF assets (w9000 namespace)

| Repo | Type | What it is |
|---|---|---|
| `huggingface.co/spaces/w9000/enclave` | Space (static SDK) | 502-line landing HTML, `deploy/huggingface/space/static/index.html` |
| `huggingface.co/datasets/w9000/enclave-character-recipes` | Dataset | 10 seed character recipes (`deploy/huggingface/dataset/recipes/*.json`) |
| `huggingface.co/w9000/enclave-character-blueprint` | Model (schema) | The Character Blueprint Schema JSON (`deploy/huggingface/model/schema/`) |

> The "model" repo is **not actually a model** — HF doesn't have a "Schema" repo type yet, so we
> host the JSON Schema in the model repo namespace. Mention this in the README so people don't
> think there's a trained model behind it.

---

## Token state

⚠️ **Current token is read-only**. To `pnpm hf:publish` you need a **write-scoped** token.

How to fix:
1. Go to https://huggingface.co/settings/tokens
2. Create a new token with scope `write` (or `Fine-grained` with write access to the three repos)
3. `export HF_TOKEN=hf_xxx` in your shell (or set it in `.env`)
4. Test with `pnpm hf:stage` first (writes to a local staging area, doesn't push) before `pnpm hf:publish`

---

## What to push, and when

| Trigger | Asset to refresh | Command |
|---|---|---|
| Released a new app version (v0.X.Y) | Space `index.html` (CTA versions, changelog) | `pnpm hf:publish:space` |
| Added a new resident preset that's worth sharing | Dataset (add a new recipe JSON) | `pnpm hf:publish:dataset` |
| Bumped the Character Blueprint Schema | Model repo (schema JSON) | `pnpm hf:publish:model` |
| Major redesign of the project | All three | `pnpm hf:publish` |

(Replace with actual script names — check `package.json`'s `scripts` section before running. The
publishing script lives at `scripts/huggingface-release.mjs`.)

---

## Pre-push checklist

- [ ] HF_TOKEN is write-scoped (test with `huggingface-cli whoami | grep write`)
- [ ] `deploy/huggingface/space/README.template.md` `frontmatter` is correct (`sdk: static`, `pinned: false`)
- [ ] `index.html` renders correctly locally (`python3 -m http.server` in `deploy/huggingface/space/static/`)
- [ ] All linked images in `index.html` exist under `static/assets/` (HF doesn't follow relative-to-repo, only relative-to-space)
- [ ] OG image at `static/assets/screenshots/core-feed.png` is < 1 MB (HF rejects > 5 MB blobs in the cards)
- [ ] If updating dataset: each recipe JSON validates against `character-blueprint.schema.json`

---

## Stretch: add a real Space (Gradio demo) when budget allows

The current Space is pure static HTML — it's a landing page. If/when we have
~$10/month free for HF compute, we can add a second Space that's a real
interactive demo:

- SDK: `gradio` (free CPU tier is sufficient for the chat-only path)
- Resident pool: 3 seed residents (no Moments, no group chat — keep stateless)
- LLM gateway: a fixed, low-cost OpenRouter free model
- Throttle: 1 message every 5 seconds per session to avoid burning the free tier

Filed as future work — *not* a Month 1–2 priority.

---

## Capture for retro

After each HF push, log to `download/_shared/marketing/huggingface-pushes.log`:

```
2026-MM-DD  v0.X.Y  space|dataset|model  <commit hash>  <#likes-before>→<#likes-after>
```

The HF community grows in a small slow trickle; this log helps confirm whether
the channel is worth the friction of maintaining.

---

## Don't

- ❌ Don't push secrets or keys into the dataset recipes — they're public.
- ❌ Don't iframe-embed the vicp.fun demo into the Space — HF strips iframes from
  static spaces, and the vicp.fun cert/branding looks broken outside its own context.
- ❌ Don't tag the Space with `text-generation` or other model-domain tags —
  HF moderators may flag it for misclassification.
