"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

interface CloudWaitlistProps {
  locale?: string;
  source?: string;
  variant?: "inline" | "card";
}

type Status = "idle" | "submitting" | "success" | "error";

const PRICE_OPTIONS = [
  { value: "<10", label: "< $10 / mo" },
  { value: "10-20", label: "$10 – $20 / mo" },
  { value: "20-50", label: "$20 – $50 / mo" },
  { value: ">50", label: "$50+ / mo" },
  { value: "n/a", label: "Not sure yet" },
];

export function CloudWaitlist({
  locale = "en",
  source = "site",
  variant = "card",
}: CloudWaitlistProps) {
  const [email, setEmail] = useState("");
  const [priceWillingness, setPriceWillingness] = useState("");
  const [feature, setFeature] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isCard = variant === "card";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/cloud-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, priceWillingness, feature, source, locale }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setErrorMessage(
          data.error === "invalid_email"
            ? "Please enter a valid email."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      setStatus("success");
      setEmail("");
      setPriceWillingness("");
      setFeature("");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className={
          isCard
            ? "rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 text-center"
            : "text-center"
        }
        role="status"
      >
        <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
        <p className="text-base font-semibold">You're on the waitlist.</p>
        <p className="mt-1 text-sm text-(--text-secondary)">
          We'll email you when Enclave Cloud opens. In the meantime, the open-source self-host is
          ready today.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isCard
          ? "space-y-4 rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 shadow-(--shadow-soft)"
          : "space-y-4"
      }
      data-source={source}
    >
      {isCard ? (
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Enclave Cloud — Join the waitlist</h3>
          <p className="text-sm text-(--text-secondary)">
            Hosted version is coming. Self-hosting stays free and open-source forever.
          </p>
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="cw-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="cw-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-lg border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm focus:border-(--brand-primary) focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="cw-price" className="text-sm font-medium">
          What would you pay per month?
        </label>
        <select
          id="cw-price"
          value={priceWillingness}
          onChange={(e) => setPriceWillingness(e.target.value)}
          className="w-full rounded-lg border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm focus:border-(--brand-primary) focus:outline-none"
        >
          <option value="">Pick one (optional)</option>
          {PRICE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="cw-feature" className="text-sm font-medium">
          The one feature that would make you pay
        </label>
        <textarea
          id="cw-feature"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="What's the thing? (optional, 1-2 sentences)"
          rows={2}
          maxLength={1000}
          className="w-full rounded-lg border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm focus:border-(--brand-primary) focus:outline-none"
        />
      </div>

      {status === "error" ? (
        <p className="text-sm text-red-500" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting" || !email}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--brand-primary) px-5 py-3 text-sm font-semibold text-white shadow-(--shadow-soft) transition hover:bg-(--brand-secondary) disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Join the waitlist"}
        <ArrowRight size={16} />
      </button>

      <p className="text-xs text-(--text-muted)">
        We email when Cloud opens, then once a month at most. Unsubscribe with one click.
      </p>
    </form>
  );
}
