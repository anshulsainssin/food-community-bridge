import { useCallback, useEffect, useState } from "react";

export type Language = "en" | "hi";

const LANGUAGE_KEY = "fwc-language";

// Small, additive translation dictionary. Anything not listed here simply falls
// back to the English source string already used throughout the existing UI —
// this file never replaces existing copy, it only offers a Hindi alternative
// for the handful of high-traffic labels (nav, notifications, auth actions).
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.findFood": "Find food",
    "nav.pickup": "Pickup",
    "nav.impact": "Impact",
    "nav.profile": "Profile",
    "nav.about": "About",
    "nav.contact": "Contact",
    "nav.admin": "Admin",
    "nav.dashboard": "Dashboard",
    "nav.donations": "Donations",
    "nav.packing": "Packing",
    "nav.delivery": "Delivery",
    "nav.trackDonation": "Track Donation",
    "nav.logout": "Logout",
    "nav.notifications": "Notifications",
    "nav.settings": "Settings",
    "notifications.title": "Notifications",
    "notifications.empty": "No notifications",
    "notifications.signInPrompt": "Sign in to see your notifications.",
    "notifications.soundOn": "Turn notification sound off",
    "notifications.soundOff": "Turn notification sound on",
    "auth.signIn": "Sign in",
    "auth.signOut": "Sign out",
    "networkImpact": "Network impact",
  },
  hi: {
    "nav.overview": "डैशबोर्ड",
    "nav.findFood": "खाना खोजें",
    "nav.pickup": "पिकअप",
    "nav.impact": "प्रभाव",
    "nav.profile": "प्रोफ़ाइल",
    "nav.about": "हमारे बारे में",
    "nav.contact": "संपर्क करें",
    "nav.admin": "एडमिन",
    "nav.dashboard": "डैशबोर्ड",
    "nav.donations": "दान",
    "nav.packing": "पैकिंग",
    "nav.delivery": "डिलीवरी",
    "nav.trackDonation": "दान ट्रैक करें",
    "nav.logout": "लॉगआउट",
    "nav.notifications": "सूचनाएँ",
    "nav.settings": "सेटिंग्स",
    "notifications.title": "सूचनाएँ",
    "notifications.empty": "कोई सूचना नहीं",
    "notifications.signInPrompt": "अपनी सूचनाएँ देखने के लिए साइन इन करें।",
    "notifications.soundOn": "सूचना ध्वनि बंद करें",
    "notifications.soundOff": "सूचना ध्वनि चालू करें",
    "auth.signIn": "साइन इन करें",
    "auth.signOut": "साइन आउट करें",
    "networkImpact": "नेटवर्क प्रभाव",
  },
};

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return stored === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

const listeners = new Set<(lang: Language) => void>();
let currentLanguage: Language = "en";

/** Shared across every component using the hook, so switching language anywhere updates the whole app at once. */
export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(currentLanguage);

  useEffect(() => {
    currentLanguage = readStoredLanguage();
    setLanguageState(currentLanguage);
    const listener = (lang: Language) => setLanguageState(lang);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    currentLanguage = lang;
    try {
      window.localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      // Best-effort persistence only; the in-memory value still updates for this session.
    }
    for (const listener of listeners) listener(lang);
  }, []);

  const t = useCallback(
    (key: string) => TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key,
    [language],
  );

  return { language, setLanguage, t };
}
