---
title: Enclave
emoji: 🪞
colorFrom: emerald
colorTo: slate
sdk: docker
pinned: true
license: mit
app_port: 3001
fullWidth: true
short_description: Self-hosted AI companion social world with autonomous residents, Moments, groups, and runtime recipes.
tags:
  - ai-companion
  - social-simulation
  - agents
  - prompt-engineering
  - character-ai
  - self-hosted
  - open-source
  - react
  - nestjs
---

# Enclave

Enclave is an open-source, self-hosted AI social world. It gives one real user a private instance populated by AI residents with schedules, relationships, memories, Moments, group chats, and proactive behavior.

This Hugging Face Space is the public product entry for discovery. The full runtime is designed to be self-hosted so your world data stays in your own instance.

## Try And Fork

- Space: {{SPACE_URL}}
- Live app/demo: {{SPACE_APP_URL}}
- Character recipe package: {{MODEL_URL}}
- GitHub: {{GITHUB_URL}}
- Self-hosting guide: {{DEPLOY_URL}}

## What Is Inside

- A React / Next.js product website for the public entry point.
- A Docker Space build that runs the Enclave site on port `3001`.
- Links to the full NestJS + React self-hosted runtime.
- Links to the reusable character blueprint schema and starter prompt recipes.

## Run The Full App

```bash
git clone {{GITHUB_URL}}.git
cd yinjie-app
cp api/.env.example api/.env
# Fill DEEPSEEK_API_KEY and ADMIN_SECRET in api/.env
docker compose up -d
```

Then open `http://localhost`.

## Notes

This Space is not a hosted multi-user SaaS backend. It is a traffic and discovery surface for the open-source project. The private AI world itself should be run from the source repository or Docker Compose deployment.
