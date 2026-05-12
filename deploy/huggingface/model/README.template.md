---
license: mit
language:
  - zh
  - en
  - ja
  - ko
pretty_name: Enclave Character Recipes
tags:
  - ai-companion
  - prompt-engineering
  - character-ai
  - agents
  - social-simulation
  - roleplay
  - self-hosted
  - open-source
---

# Enclave Character Recipes

This repository contains the public Hugging Face model-card entry for Enclave character recipes.

It does not contain model weights. Enclave runs on OpenAI-compatible LLM providers and uses structured character blueprints to define identity, tone, memory seed, scene prompts, reasoning flags, and publishing behavior.

## Files

- `schema/character-blueprint.schema.json` describes the portable recipe shape.
- `recipes/starter-self-reflection.recipe.json` is a starter recipe for an inner-reflection companion.

## Related Links

- Space: {{SPACE_URL}}
- GitHub: {{GITHUB_URL}}
- Self-hosting guide: {{DEPLOY_URL}}

## Intended Use

Use these recipes as prompt-engineering assets inside Enclave or as examples for building AI companion/social-agent systems. A recipe is not a standalone model and does not provide inference by itself.

## Limitations

- No model weights are included.
- Behavior depends on the selected LLM provider, model, safety settings, and runtime memory.
- Recipes should be reviewed before use in production or sensitive domains.

## License

MIT. See `LICENSE`.
