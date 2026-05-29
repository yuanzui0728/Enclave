import Image from "next/image";
import type { SupportedLocale } from "@/lib/locales";

// Real app screenshot framed as a phone. Bezel uses surface/border tokens so
// it reads correctly in both light (兰花薰衣紫) and dark (深空夜紫) themes,
// unlike a hardcoded black bezel which vanishes on a dark canvas.
export function PhoneShot({
  locale,
  shotKey,
  alt,
  priority = false,
  className = "",
  width = 300,
}: {
  locale: SupportedLocale;
  shotKey: string;
  alt: string;
  priority?: boolean;
  className?: string;
  width?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2.5rem] border border-(--border-subtle) bg-(--surface-card) p-2 shadow-(--shadow-shell) ${className}`}
      style={{ width }}
    >
      <Image
        src={`/screenshots/${locale}/${shotKey}.png`}
        alt={alt}
        width={390}
        height={844}
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        sizes={`${width}px`}
        className="block h-auto w-full rounded-[1.9rem]"
      />
    </div>
  );
}
