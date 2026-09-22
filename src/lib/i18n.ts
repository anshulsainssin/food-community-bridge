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
    "nav.sponsor": "Sponsor a Meal",
    "nav.inventory": "Live Kitchen Inventory",
    "nav.distribution": "Distribution Tracker",
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
    "networkImpact": "Today's impact",
    "home.eyebrow": "Ratna Nidhi Central Kitchen",
    "home.titleMain": "Ratna Nidhi Central Kitchen",
    "home.titleEmphasis": "& Daily Meal Project.",
    "home.description": "Preparing 2,200+ fresh cooked meals every single day for children at partner schools and distribution centers — raw ration to plate, tracked live.",
    "home.sponsorBtn": "Sponsor a Meal",
    "home.inventoryBtn": "Live Kitchen Inventory",
    "home.tile.mealsToday": "Meals cooked today",
    "home.tile.children": "Beneficiary children served",
    "home.tile.centers": "Active kitchen centers",
    "home.tile.sponsored": "Meals sponsored",
    "home.tile.mealsUnit": "meals",
    "home.tile.childrenUnit": "children",
    "home.tile.centersUnit": "centers",
    "home.tile.allTime": "all time",
    "home.card.sponsor.title": "Sponsor a Meal",
    "home.card.sponsor.desc": "₹500 sponsors 50 fresh cooked meals. Track your sponsorship and get a dynamic impact certificate.",
    "home.card.sponsor.cta": "Sponsor now",
    "home.card.inventory.title": "Live Kitchen Inventory",
    "home.card.inventory.desc": "Daily raw ration stock — grains, pulses, vegetables, and cooking oil — with automatic re-order alerts.",
    "home.card.inventory.cta": "View inventory",
    "home.card.distribution.title": "Distribution Tracker",
    "home.card.distribution.desc": "See every school and center receiving meals today, live on the map.",
    "home.card.distribution.cta": "Track distribution",
  },
  hi: {
    "nav.overview": "डैशबोर्ड",
    "nav.sponsor": "भोजन प्रायोजित करें",
    "nav.inventory": "रसोई भंडार",
    "nav.distribution": "वितरण ट्रैकर",
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
    "networkImpact": "आज का प्रभाव",
    "home.eyebrow": "रत्ननिधि सेंट्रल किचन",
    "home.titleMain": "रत्ननिधि सेंट्रल किचन",
    "home.titleEmphasis": "और दैनिक भोजन परियोजना।",
    "home.description": "साझेदार स्कूलों और वितरण केंद्रों पर बच्चों के लिए प्रतिदिन 2,200+ ताजा पका हुआ भोजन तैयार करना — कच्चे राशन से थाली तक, लाइव ट्रैक किया गया।",
    "home.sponsorBtn": "भोजन प्रायोजित करें",
    "home.inventoryBtn": "रसोई भंडार",
    "home.tile.mealsToday": "आज पका भोजन",
    "home.tile.children": "लाभार्थी बच्चे",
    "home.tile.centers": "सक्रिय रसोई केंद्र",
    "home.tile.sponsored": "प्रायोजित भोजन",
    "home.tile.mealsUnit": "भोजन",
    "home.tile.childrenUnit": "बच्चे",
    "home.tile.centersUnit": "केंद्र",
    "home.tile.allTime": "अब तक",
    "home.card.sponsor.title": "भोजन प्रायोजित करें",
    "home.card.sponsor.desc": "₹500 में 50 ताजा पका हुआ भोजन प्रायोजित करें। अपना प्रायोजन ट्रैक करें और एक प्रभाव प्रमाण पत्र पाएं।",
    "home.card.sponsor.cta": "अभी प्रायोजित करें",
    "home.card.inventory.title": "रसोई भंडार",
    "home.card.inventory.desc": "दैनिक कच्चे राशन का स्टॉक — अनाज, दाल, सब्जियाँ और खाना पकाने का तेल — स्वचालित पुनः-आदेश सूचनाओं के साथ।",
    "home.card.inventory.cta": "भंडार देखें",
    "home.card.distribution.title": "वितरण ट्रैकर",
    "home.card.distribution.desc": "आज भोजन प्राप्त करने वाले हर स्कूल और केंद्र को मानचित्र पर लाइव देखें।",
    "home.card.distribution.cta": "वितरण ट्रैक करें",
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
