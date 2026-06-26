# Bring Your Own Key (BYOK)

Enclave never holds your AI key — you bring one, and we route every model call through it.
That's why the cloud cost of self-hosting Enclave is essentially **$0**: you pay only the LLM
gateway you choose, on your own account, and you can stop / switch any time.

This page is a 5-minute path from zero to a running world.

---

## 1. Pick a gateway

There is no wrong answer. All five options below speak the OpenAI chat-completions protocol,
so any of them drop into the same three env vars.

| Gateway | Best for | Free tier | Sign-up |
|---|---|---|---|
| **OpenRouter** | International users — one key, 100+ models, easy switching | Yes (free Llama / Mistral models) | <https://openrouter.ai/keys> |
| **Requesty** | OpenAI-compatible gateway, one key, 400+ models | — | <https://app.requesty.ai/api-keys> |
| **Groq** | Fastest inference, generous free quota | Yes (large daily limit) | <https://console.groq.com/keys> |
| **DeepSeek** | Cheapest paid option, great for Chinese-language users | $5 signup credit historically | <https://platform.deepseek.com/api_keys> |
| **Together AI** | Open-weight Llama 3.1 70B / Qwen 2.5 etc. | $5 signup credit | <https://api.together.xyz/settings/api-keys> |
| **Ollama** (local) | 100% offline, zero API cost, your laptop pays the bill | n/a (your hardware) | <https://ollama.com/> |
| **OpenAI** (official) | If you already have a key and want first-party reliability | n/a | <https://platform.openai.com/api-keys> |

> 💡 **Don't know which to pick?** Start with **OpenRouter free tier**. You can later flip to a paid model by changing two lines.

---

## 2. Plug it in

After `cp api/.env.example api/.env`, open `api/.env`. The top section is a multi-option template —
**comment out Option A (DeepSeek default) and uncomment the option you picked.**

For example, OpenRouter free Llama:

```env
DEEPSEEK_API_KEY=sk-or-v1-your-openrouter-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

Or Groq free Llama 3.3 70B:

```env
DEEPSEEK_API_KEY=gsk_your-groq-key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
```

Or Requesty (OpenAI-compatible gateway, `provider/model` naming):

```env
DEEPSEEK_API_KEY=rqsty-...-key
OPENAI_BASE_URL=https://router.requesty.ai/v1
AI_MODEL=openai/gpt-4o-mini
```

> The variable is called `DEEPSEEK_API_KEY` for historical reasons —
> it is the generic "gateway key" slot and works for any OpenAI-compatible provider.

Vision-capable model? Anything that supports image input through the OpenAI protocol works:
`gpt-4o-mini`, `claude-3-5-sonnet`, `gemini-1.5-flash`, `qwen-vl-plus`, etc.

---

## 3. Boot the world

```bash
docker compose up -d
# open http://localhost
```

Your first sign-in becomes the world owner — there is no shared cloud, no Enclave-Inc account,
no telemetry beacon waiting on the other side. Everything from chat history to AI residents'
inner state lives in `./data/database.sqlite` on your machine.

---

## 4. Optional: MiniMax for richer media

The 视频号 (short-video) and music-generation features call MiniMax. They are **optional** —
Enclave runs fine without them (the gateway above handles all chat / Moments / group chat).

If you want NPC-generated videos & songs:

```env
MINIMAX_API_KEY=your-minimax-key
MINIMAX_BASE_URL=https://api.minimaxi.com
```

Sign up at <https://www.minimaxi.com/>. Monthly plans start around ¥30. If you skip this,
the corresponding features show a "media generation disabled" placeholder and the rest of the
product is unaffected.

---

## 5. Switching gateways later

Stop the stack (`docker compose down`), change the three env vars, start again
(`docker compose up -d`). Conversation history and AI relationships are model-agnostic — you can
upgrade from a free 8B model to GPT-4o on a Sunday afternoon without losing a single message.

---

## FAQ

**Q: Will Enclave see my key?**
A: No. The key never leaves your machine — it sits in `api/.env`, gets injected into the API
container as an env var, and is only used to make outbound HTTPS calls to your chosen gateway.

**Q: My free-tier quota ran out mid-conversation. What happens?**
A: Enclave bubbles up the gateway's error. AI residents will say "I'm having trouble thinking
right now" rather than crashing. Top up the gateway or switch to another, restart, and resume.

**Q: Can I use multiple gateways at once (e.g. cheap model for chitchat, smart model for memory)?**
A: That's on the v0.2 roadmap (per-character model routing). Today: one default gateway per
world. Subscribers ([Cloud waitlist](https://1gw06751dd053.vicp.fun/)) will get the routed
version first.

**Q: Should I run Ollama for true privacy?**
A: If you have a GPU with ≥8 GB VRAM, yes — `llama3.1:8b` or `qwen2.5:7b` give a usable
experience and zero data ever leaves your hardware. Without a GPU, the latency makes daily
use painful.

---

Got stuck? Open an issue or join the Discord (link in README). One of the maintainers will
usually answer within a day.
