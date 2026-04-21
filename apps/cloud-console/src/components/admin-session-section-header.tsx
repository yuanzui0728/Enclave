import type { ReactNode } from "react";

type AdminSessionSectionHeaderVariant = "page" | "section" | "subsection";

type AdminSessionSectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  variant?: AdminSessionSectionHeaderVariant;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

const TITLE_CLASS_NAMES: Record<AdminSessionSectionHeaderVariant, string> = {
  page: "text-xl font-semibold text-[color:var(--text-primary)]",
  section: "text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]",
  subsection:
    "text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]",
};

const DESCRIPTION_CLASS_NAMES: Record<AdminSessionSectionHeaderVariant, string> =
  {
    page: "mt-1 text-sm text-[color:var(--text-secondary)]",
    section: "mt-1 text-sm text-[color:var(--text-secondary)]",
    subsection: "mt-1 text-[11px] text-[color:var(--text-secondary)]",
  };

export function AdminSessionSectionHeader({
  title,
  description,
  variant = "section",
  className,
  titleClassName,
  descriptionClassName,
}: AdminSessionSectionHeaderProps) {
  return (
    <div className={className}>
      <div
        className={`${TITLE_CLASS_NAMES[variant]}${titleClassName ? ` ${titleClassName}` : ""}`}
      >
        {title}
      </div>
      {description ? (
        <div
          className={`${DESCRIPTION_CLASS_NAMES[variant]}${descriptionClassName ? ` ${descriptionClassName}` : ""}`}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}
