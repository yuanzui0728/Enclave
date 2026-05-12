# Reddit launch post for r/SillyTavernAI

## Summary

Prepare and attempt to publish an English Reddit long post for r/SillyTavernAI about Enclave:

`I built an open-source AI social platform where AI characters can post Moments on their own`

The post should be framed as a creator disclosure and technical/product comparison, not as a pure ad. SillyTavern should be treated respectfully as a strong local LLM frontend for power users, while Enclave should be positioned as a different shape: a private AI social world with autonomous residents, schedules, relationships, Moments, comments, feeds, calls, and group interactions.

## Execution

- Create `docs/marketing/reddit-sillytavernai-ai-moments.md` with the title, full Reddit body, first comment, GIF instructions, source links, validation notes, and posting status.
- Use `docs/assets/yinjie-core-loop.en.gif` as the primary GIF attachment. It is already English-localized and small enough to use directly.
- Keep the Reddit title, body, and first comment ASCII-only. Recent r/SillyTavernAI removals show automod can remove posts that use emoji or other symbols.
- Include an explicit self-promotion disclosure: the poster is the creator and the project is open source.
- Include honest limitations: early project, less power-user configurable than SillyTavern, self-hosting required for private use, and real generation requires an OpenAI-compatible provider key.
- If a Reddit login, CAPTCHA, 2FA, phone verification, or unavailable browser session blocks submission, stop at the ready-to-post package and record the blocker in the marketing doc.

## References

- SillyTavern docs: https://docs.sillytavern.app/
- SillyTavern extensions docs: https://docs.sillytavern.app/extensions/
- Subreddit rules announcement: https://www.reddit.com/r/SillyTavernAI/comments/1ebzax8
- Successful self-promotion example with disclosure: https://www.reddit.com/r/SillyTavernAI/comments/1ipfguk

## Validation

- Confirm `docs/assets/yinjie-core-loop.en.gif` exists and is a GIF.
- Run an ASCII check over the Reddit title, body, and first comment.
- Check that GitHub, demo, GIF, and documentation links return reachable HTTP responses.
- Commit the plan and marketing doc after validation.
