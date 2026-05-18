# Stripe Atlas vs Lemon Squeezy — Week 9 Decision

> Pick **one** for the first 50-slot Cloud SaaS rollout. Both routes drop into
> the same provider interface — only the env vars and the SDK import differ. This
> document captures the tradeoffs as of 2026-05.
>
> 📄 **Provider service template**:
> [`stripe-provider.service.ts.template`](./stripe-provider.service.ts.template)
> — copy to `apps/cloud-api/src/subscription/stripe-provider.service.ts`, fill
> the three method bodies, register in `subscription.module.ts`. The cloud-api
> directory is **not** part of the public repo (private business module), so the
> template lives here in `download/_shared/marketing/`.

---

## Decision matrix

| Factor | Stripe (via Atlas) | Lemon Squeezy |
|---|---|---|
| **Upfront cost** | ~$500 (Atlas one-time) | $0 |
| **Time to first dollar** | 2–6 weeks (entity + bank + Stripe approval) | < 24 hours |
| **Transaction fee** | 2.9% + $0.30 | 5% + $0.50 |
| **Sales tax (VAT/GST) handling** | You collect & remit | They are merchant-of-record, they handle it globally |
| **Subscription primitives** | First-class, mature | First-class, mature |
| **Refunds, chargebacks** | You handle, your liability | They handle, their liability |
| **Reporting / accounting** | Stripe Dashboard + plug into accounting | LSQ Dashboard, less polished |
| **Brand on the checkout page** | Your domain, no LSQ branding | "Powered by Lemon Squeezy" footer |
| **Ceiling** | Scales to $10B+ ARR | Fine until ~$2M+ ARR, then friction |

---

## Recommendation for Enclave's Week 9–12

**Start with Lemon Squeezy.** Switch to Stripe at MRR ≥ $5k.

Reasoning:

1. **Zero upfront cost** matches the "$0 budget" constraint of Month 3.
2. **24-hour activation** keeps the Week 9 momentum.
3. **MoR handling of VAT/GST** is a real time-saver — international Cloud users
   come from 30+ jurisdictions and you do not want to learn VAT rules in your
   first quarter of running this.
4. **5% fee vs 2.9% fee** on $14.99 = $0.31 extra per transaction. At 50 users
   for 3 months: ~$45 total. Not worth optimizing yet.
5. **The switch is bounded work**: when you outgrow LSQ, you migrate active
   subscriptions to Stripe via a `customer.email` lookup + reauth flow. ~2 days
   of work at any time.

---

## Operational checklist if you choose Lemon Squeezy

- [ ] Sign up at <https://lemonsqueezy.com/> (24 hour KYC review for non-US)
- [ ] Create a Store and a Product called "Enclave Cloud"
- [ ] Create a Variant: $14.99/mo recurring
- [ ] Set the Webhook URL to `https://yourdomain/api/cloud/lsq/webhook` (you'll
      add this route in `subscription-client.controller.ts` during activation)
- [ ] Copy `LSQ_API_KEY`, `LSQ_STORE_ID`, `LSQ_PRODUCT_VARIANT_MONTHLY`,
      `LSQ_WEBHOOK_SECRET` into `apps/cloud-api/.env`
- [ ] In `stripe-provider.service.ts`, rename to `lsq-provider.service.ts` (or
      add a sibling) and implement the three methods using
      `@lemonsqueezy/lemonsqueezy.js`
- [ ] Add the provider to `subscription.module.ts` providers
- [ ] Test in dev mode (LSQ has a test mode that does not charge real cards)
- [ ] Open the public route guard with a hidden URL — verify end-to-end with
      one real card before announcing
- [ ] Announce to the waitlist in batches of 10 per day (avoid overloading
      support in week 1)

---

## Operational checklist if you choose Stripe Atlas instead

- [ ] Apply at <https://stripe.com/atlas> ($500 one-time; ~7 day approval)
- [ ] Wait for: Delaware LLC formation, EIN, bank account, Stripe account
- [ ] Set up Stripe Tax (handles VAT/GST collection — not free, ~$5/mo + 0.5%
      of transactions) — without it, you must manually remit international tax
- [ ] Create a Product + Recurring Price ($14.99/mo)
- [ ] Set `STRIPE_*` env vars
- [ ] Implement the three methods in `stripe-provider.service.ts`
- [ ] Configure the webhook URL in Stripe Dashboard → Developers → Webhooks
- [ ] Verify with `stripe trigger` CLI in dev mode

---

## The migration path (when you outgrow LSQ)

If you hit ~$5k MRR with LSQ and the 5% fee becomes meaningful:

1. Apply to Stripe Atlas (or directly to Stripe if you've already incorporated)
2. Set up Stripe + Stripe Tax in parallel — do NOT cancel LSQ yet
3. Implement `stripe-provider.service.ts` alongside the existing `lsq-provider`
4. New signups go to Stripe; existing LSQ users stay on LSQ until renewal
5. On each LSQ user's renewal date, prompt them to "update payment method" —
   this re-collects a card via Stripe Checkout
6. After 6 months, the entire base is on Stripe
7. Turn off LSQ — refund any remaining edge cases

---

## What we will NOT do for Week 9

- ❌ Annual plans — billing logic complexity not justified for 50 users
- ❌ Multiple plan tiers — start with $14.99/mo, period. Tiering can come at
  MRR ≥ $3k when there's data on usage patterns
- ❌ Free trial — gives chargeback risk and complicates the queue. The
  open-source self-host *is* the free trial
- ❌ Coupons / promos — the first 50 get a permanent "founding member" badge,
  which is the only discount mechanism

---

## When to revisit this decision

Three signals trigger re-reading this:

1. MRR ≥ $5k → consider the LSQ → Stripe migration
2. Need to sell to a company that requires "Stripe receipt only" (some
   procurement teams) → exception route, hand-invoice
3. International expansion to a jurisdiction where LSQ is *more* expensive than
   Stripe+manual tax handling → revisit per-country math
