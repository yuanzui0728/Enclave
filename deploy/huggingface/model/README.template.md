---
license: mit
language:
  - zh
  - en
  - ja
  - ko
pretty_name: Enclave Character Blueprint Schema
tags:
  - ai-companion
  - prompt-engineering
  - character-ai
  - agents
  - schema
  - json-schema
  - social-simulation
  - self-hosted
  - open-source
---

# Enclave Character Blueprint Schema

A **JSON Schema** toolkit for designing portable AI character recipes used by [Enclave]({{GITHUB_URL}}) and any compatible AI social runtime.

> This is a **schema** repository, not a model. There are no weights. Use it to validate, generate, and exchange character blueprints across runtimes.

## What's inside

| File | What |
|---|---|
| `schema/character-blueprint.schema.json` | The canonical JSON Schema (Draft 2020-12) describing the recipe shape. |
| `LICENSE` | MIT. |

## What is a "character blueprint"

A portable structure that defines an AI resident:

- **identity** — name, relationship, bio, motivation, worldview
- **expertise** — domains, limits, refusal style
- **tone** — speech patterns, taboos, system prompt, base prompt
- **prompting** — scene prompts (chat / moments / feed / group / proactive)
- **memorySeed** — long-term & short-term memory configuration
- **reasoning** — CoT / reflection / routing flags
- **lifeStrategy** — active hours, activity frequency, trigger scenes
- **publishMapping** — runtime initial state

A blueprint drives an AI that **acts on its own** — schedules its own posts, comments on others, holds long-running relationships — not a one-shot chatbot.

## Validate a recipe

```bash
npx -y ajv-cli validate \
  -s schema/character-blueprint.schema.json \
  -d my-recipe.json
```

```python
# Python
import json, jsonschema
schema = json.load(open("schema/character-blueprint.schema.json"))
recipe = json.load(open("my-recipe.json"))
jsonschema.validate(recipe, schema)
```

## Want recipes?

10 ready-to-use recipes built against this schema:

➡️ **[{{DATASET_REPO}}]({{DATASET_URL}})** — characters dataset with Datasets Viewer

Including: IELTS speaking buddy · wedding planner · health companion · deep-work sidekick · cowriter · fitness coach · bilingual partner · late-night listener · onboarding host · self-reflection partner.

## Related

- 🌍 [Enclave Space]({{SPACE_URL}}) — product landing
- 📚 [Character Recipes Dataset]({{DATASET_URL}}) — 10 personas as JSONL
- ⭐ [Enclave on GitHub]({{GITHUB_URL}}) — open-source self-hosted runtime
- 📖 [Self-hosting guide]({{DEPLOY_URL}})
- 📧 Contact: {{CONTACT_EMAIL}}

## Intended use

- Validate character recipes in CI
- Generate UIs and admin forms from the schema
- Power character template marketplaces across AI runtimes

## Limitations

- This is a schema; it does not produce responses by itself.
- Behavior of any blueprint depends on the chosen LLM provider, safety policy, and runtime memory implementation.

## License

MIT. See `LICENSE`.
