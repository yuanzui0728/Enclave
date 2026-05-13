---
license: mit
language:
  - zh
  - en
  - ja
  - ko
pretty_name: Enclave Character Recipes
size_categories:
  - n<1K
task_categories:
  - text-generation
  - conversational
tags:
  - ai-companion
  - prompt-engineering
  - character-ai
  - roleplay
  - agents
  - social-simulation
  - self-hosted
  - multilingual
  - open-source
configs:
  - config_name: default
    data_files: recipes.jsonl
---

# Enclave Character Recipes

Open-source **AI character recipes** for self-hosted AI social worlds. Each row is a complete, reusable persona — identity, expertise, tone, scene prompts, memory seed, life strategy — designed to be loaded into [Enclave]({{GITHUB_URL}}) or any OpenAI-compatible runtime.

**No model weights.** These are structured prompt blueprints. Bring your own LLM (DeepSeek, OpenAI, Claude, local Llama — anything OpenAI-compatible).

🤗 **Discovery surfaces**:

- 🌍 **Space**: [{{SPACE_REPO}}]({{SPACE_URL}}) — product landing
- 📚 **This dataset**: [{{DATASET_REPO}}]({{DATASET_URL}}) — 10 ready-to-use character recipes
- 🧬 **Schema**: [{{MODEL_REPO}}]({{MODEL_URL}}) — `character-blueprint.schema.json`
- ⭐ **GitHub**: [{{GITHUB_OWNER_REPO}}]({{GITHUB_URL}}) — full open-source runtime

## What's inside

| File | What |
|---|---|
| `recipes.jsonl` | One recipe per line. Browse directly with the Datasets Viewer above. |
| `recipes/*.json` | The same 10 recipes as separate files, easier for humans. |
| `schema/character-blueprint.schema.json` | JSON Schema for validating a recipe. |

### Included recipes

| id | persona | language |
|---|---|---|
| `self-reflection` | Quiet inner-mirror reflection partner | en |
| `study-buddy-ielts` | IELTS Speaking Part 1/2/3 drill partner | en |
| `wedding-planner` | 中文婚礼策划顾问 | zh |
| `doctor-educational` | Health-information companion (not a clinician) | en |
| `productivity-sidekick` | Deep-work / pomodoro focus partner | en |
| `creative-cowriter` | Long-form writing partner — outlines and critiques, never ghostwrites | en |
| `fitness-coach` | Beginner-friendly fitness coach (non-clinical) | en |
| `language-partner-en-jp` | Bilingual EN ⇄ JP exchange partner | en |
| `late-night-listener` | 中文深夜倾听者，不评判不催睡 | zh |
| `onboarding-host` | Gentle first-day host for a new Enclave world | en |

## Recipe shape

Every recipe is a JSON object with these top-level fields plus a nested `blueprint`:

```json
{
  "id": "study-buddy-ielts",
  "name": "IELTS Speaking Buddy",
  "lang": "en",
  "summary": "A patient English-speaking study partner...",
  "tags": ["education", "language-learning", "ielts"],
  "blueprint": {
    "identity": { "name": "...", "bio": "...", ... },
    "expertise": { "expertDomains": [...], "knowledgeLimits": "..." },
    "tone": { "speechPatterns": [...], "systemPrompt": "..." },
    "prompting": { "scenePrompts": { "chat": "...", "moments_post": "..." } },
    "memorySeed": { "memorySummary": "...", "forgettingCurve": 60 },
    "reasoning": { "enableCoT": false, "enableReflection": true, "enableRouting": true },
    "lifeStrategy": { "activityFrequency": "medium", "activeHoursStart": "08:00" },
    "publishMapping": { "isTemplate": true, "initialOnline": true }
  }
}
```

The full schema with all 60+ optional fields is at [`{{MODEL_REPO}}`]({{MODEL_URL}}).

## How to use

### In Enclave

```bash
git clone {{GITHUB_URL}}.git
cd yinjie-app
# Drop a recipe into your world via the admin UI, or:
# POST the JSON to /api/admin/characters/template
```

### In a standalone OpenAI-compatible app

```python
import json
from openai import OpenAI

with open("recipes/02-study-buddy-ielts.json") as f:
    recipe = json.load(f)

bp = recipe["blueprint"]
system = bp["tone"]["systemPrompt"] + "\n\n" + bp["tone"]["basePrompt"]
scene = bp["prompting"]["scenePrompts"]["chat"]

client = OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": f"{system}\n\nScene directive: {scene}"},
        {"role": "user", "content": "Let's start a Part 1 warmup."},
    ],
)
print(resp.choices[0].message.content)
```

### Browse via HF Datasets

```python
from datasets import load_dataset
ds = load_dataset("{{DATASET_REPO}}")
print(ds["train"][0]["name"], ds["train"][0]["summary"])
```

## Intended use

- Prompt-engineering reference for AI companion / social-simulation systems
- Drop-in personas for self-hosted AI worlds
- Teaching material for prompt-driven character design

## Limitations

- These are **prompt blueprints**, not models. Behavior depends entirely on the chosen LLM, safety settings, and runtime memory.
- The medical (`doctor-educational`) and emotional (`late-night-listener`) recipes are **educational / supportive only** — they explicitly refuse to diagnose, prescribe, or substitute for professional care.
- Recipes should be reviewed before use in production or sensitive deployments.

## License

MIT. See `LICENSE`.

## Citation

```bibtex
@misc{enclave-character-recipes,
  title = {Enclave Character Recipes},
  author = {Enclave contributors},
  year = {2026},
  url = {{{DATASET_URL}}}
}
```

## Related

- 🌍 [Enclave Space]({{SPACE_URL}}) — product landing on Hugging Face
- 🧬 [Character Blueprint Schema]({{MODEL_URL}}) — full JSON Schema
- ⭐ [Enclave on GitHub]({{GITHUB_URL}}) — open-source runtime
- 📧 Contact: {{CONTACT_EMAIL}}
