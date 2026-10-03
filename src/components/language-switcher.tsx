import { useEffect } from "react";

import { setLanguage, useLanguage } from "@/lib/i18n";

/** Compact English / हिंदी toggle for the header. */
export function LanguageSwitcher({
  className = "",
  hideOnPhone = false,
}: {
  className?: string;
  hideOnPhone?: boolean;
}) {
  const lang = useLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const other = lang === "hi" ? "en" : "hi";
  return (
    <>
      {/* Phones: one compact button that switches to the other language. */}
      {!hideOnPhone && (
        <button
          type="button"
          lang={other}
          aria-label={other === "hi" ? "हिंदी में देखें" : "View in English"}
          onClick={() => setLanguage(other)}
          className={`h-8 min-w-8 shrink-0 border border-border-strong px-1.5 text-xs text-muted-foreground hover:bg-muted sm:hidden ${className}`}
        >
          {other === "hi" ? "हिं" : "EN"}
        </button>
      )}
      <div
        role="group"
        aria-label="Language / भाषा"
        className={`hidden shrink-0 border border-border-strong text-xs sm:flex ${className}`}
      >
        {(
          [
            ["en", "EN"],
            ["hi", "हिं"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            lang={value}
            aria-pressed={lang === value}
            onClick={() => setLanguage(value)}
            className={`h-8 min-w-9 px-2 transition-colors ${lang === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
