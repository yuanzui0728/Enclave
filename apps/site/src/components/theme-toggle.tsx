"use client";
import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "light" | "dark" | "system";
const STORAGE_KEY = "yinjie-site-theme";
const ORDER: Record<Mode, Mode> = { light: "dark", dark: "system", system: "light" };

function resolve(mode: Mode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function apply(mode: Mode) {
  const t = resolve(mode);
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  root.style.colorScheme = t;
}

export type ThemeToggleLabels = {
  light: string;
  dark: string;
  system: string;
  toggle: string;
};

export function ThemeToggle({ labels }: { labels: ThemeToggleLabels }) {
  // Server + first client render both use "system" so hydration matches;
  // the stored value is read in an effect and triggers a normal re-render.
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Mode | null;
    if (stored === "light" || stored === "dark" || stored === "system") setMode(stored);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((prev) => {
      const next = ORDER[prev];
      localStorage.setItem(STORAGE_KEY, next);
      apply(next);
      return next;
    });
  }, []);

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const current = mode === "light" ? labels.light : mode === "dark" ? labels.dark : labels.system;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${labels.toggle} · ${current}`}
      title={`${labels.toggle} · ${current}`}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-(--border-subtle) bg-(--surface-card) text-(--text-secondary) shadow-(--shadow-soft) transition hover:border-(--brand-primary) hover:text-(--brand-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)"
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}
