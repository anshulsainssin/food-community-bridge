import { useCallback, useSyncExternalStore } from "react";

import { HINDI } from "@/lib/translations-hi";

// English is the source text; Hindi comes from the dictionary in translations-hi.ts (English text → Hindi).
// Anything not in the dictionary stays in English. The choice is remembered per browser.

export type Lang = "en" | "hi";

const STORAGE_KEY = "fwc-language";
const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current) return current;
  try {
    current = localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en";
  } catch {
    current = "en";
  }
  return current;
}

export function setLanguage(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not remembered (private mode); still applies until the page is closed.
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language. The server render (and hydration) is always English. */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, read, () => "en");
}

/** `text` in `lang` (Hindi from the dictionary, else unchanged); "{name}" placeholders are filled from `vars`. */
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>) {
  let out = lang === "hi" ? (HINDI[text] ?? text) : text;
  if (vars)
    for (const [key, value] of Object.entries(vars))
      out = out.split(`{${key}}`).join(String(value));
  return out;
}

/** `t("English text")` → the text in the chosen language. */
export function useT() {
  const lang = useLanguage();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars),
    [lang],
  );
}
