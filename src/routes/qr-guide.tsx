import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  ClipboardPaste,
  ImageUp,
  Keyboard,
  QrCode,
  ScanLine,
  Store,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/qr-guide")({
  head: () => ({
    meta: [
      { title: "How to Use the Pickup QR | Food Waste Connect" },
      {
        name: "description",
        content: "Step-by-step guide to showing, scanning and verifying the pickup QR code.",
      },
      { property: "og:title", content: "How to Use the Pickup QR | Food Waste Connect" },
      {
        property: "og:description",
        content: "Show, scan or paste the pickup QR link to confirm a food pickup.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QrGuidePage,
});

type Lang = "en" | "hi";
type Step = { title: string; body: string };
type Method = { icon: typeof Camera; title: string; when: string; steps: Step[] };

const LANG_KEY = "fwc-qr-guide-lang";

const copy = {
  en: {
    eyebrow: "Help / Pickup QR",
    title: "How the pickup QR works",
    intro:
      "When an NGO or volunteer collects food, they confirm the pickup by scanning a one-time QR code on the donor's phone. It takes under a minute — here is exactly what to do.",
    donorHeading: "If you are the donor",
    donorSteps: [
      {
        title: "Open the Pickup page",
        body: "After an NGO / volunteer claims your donation, open Pickup. Your QR code and a 10-character code appear under the status timeline.",
      },
      {
        title: "Wait for them to arrive",
        body: 'Don\'t send the QR or code in advance. It works once, and it means "I have handed over the food".',
      },
      {
        title: "Show your screen",
        body: "When they are with you, show the QR code. They scan it, and the status changes to Picked Up on both phones.",
      },
    ],
    receiverHeading: "If you are the NGO / volunteer",
    receiverIntro:
      'Open Pickup in your account. Under the status timeline there is a box "Scan the donor\'s QR to confirm pickup". Use any one of these ways:',
    methods: [
      {
        icon: ScanLine,
        title: "1. Scan inside the app",
        when: "Easiest — works on Android and iPhone (needs camera permission).",
        steps: [
          { title: 'Tap "Scan QR code"', body: "Allow camera access when your phone asks." },
          {
            title: "Point at the donor's QR",
            body: "Hold it steady for a second. The pickup is confirmed automatically.",
          },
        ],
      },
      {
        icon: ImageUp,
        title: "2. Upload a screenshot of the QR",
        when: "If the donor sent you a screenshot of their QR, or the camera won't open.",
        steps: [
          {
            title: 'Tap "Upload QR screenshot"',
            body: "Choose the screenshot or photo from your gallery (on a computer you can also drag it in or press Ctrl+V).",
          },
          {
            title: "That's it",
            body: "The app reads the QR from the image and confirms the pickup automatically. Make sure the whole QR is visible in the image.",
          },
        ],
      },
      {
        icon: Camera,
        title: "3. Phone camera / Google Lens, then paste the link",
        when: "Another option if in-app scanning doesn't work on your phone.",
        steps: [
          {
            title: "Open your phone's camera or Google Lens",
            body: "Point it at the donor's QR code. A link appears on the screen.",
          },
          {
            title: "Tap the link — or copy it",
            body: "Tapping opens Food Waste Connect and confirms the pickup straight away (you must be signed in). Or long-press the link and choose Copy.",
          },
          {
            title: "Paste it in the app",
            body: 'Back on Pickup, tap "Paste link" (or long-press the box and choose Paste), then tap Verify.',
          },
        ],
      },
      {
        icon: Keyboard,
        title: "4. Type the code",
        when: "If nothing else works.",
        steps: [
          {
            title: "Read the code under the QR",
            body: "It looks like 1A2B3-C4D5E. Capital or small letters both work, and the dash is optional.",
          },
          {
            title: "Type it and tap Verify",
            body: "Use the same box where you would paste the link.",
          },
        ],
      },
    ] satisfies Method[],
    problemsHeading: "Something went wrong?",
    problems: [
      {
        title: '"This QR code is for a different donation"',
        body: "The donor is showing the QR of another donation. Ask them to open the Pickup page for the food you claimed.",
      },
      {
        title: '"Camera access was blocked"',
        body: "Allow camera for this site in your browser settings, or upload a screenshot of the QR instead (way 2).",
      },
      {
        title: '"This pickup QR code has already been used"',
        body: "The pickup is already confirmed. Refresh the Pickup page — the status should be Picked Up.",
      },
      {
        title: '"Only the NGO or volunteer who claimed this donation can verify"',
        body: "You are signed in with a different account. Sign in with the account that claimed the food.",
      },
      {
        title: 'Tapping the link shows "Sign in"',
        body: "Sign in first, then scan the QR again (or paste the link on the Pickup page).",
      },
    ],
    cta: "Go to Pickup",
  },
  hi: {
    eyebrow: "मदद / पिकअप QR",
    title: "पिकअप QR कैसे इस्तेमाल करें",
    intro:
      "जब NGO या वॉलंटियर खाना लेने आते हैं, तो वे डोनर के फ़ोन पर दिख रहा एक बार चलने वाला QR कोड स्कैन करके पिकअप कन्फ़र्म करते हैं। इसमें एक मिनट से भी कम लगता है — नीचे पूरा तरीका दिया है।",
    donorHeading: "अगर आप डोनर हैं",
    donorSteps: [
      {
        title: "Pickup पेज खोलें",
        body: "जब कोई NGO / वॉलंटियर आपका डोनेशन क्लेम कर ले, तो Pickup खोलें। स्टेटस टाइमलाइन के नीचे आपका QR कोड और 10 अक्षरों का कोड दिखेगा।",
      },
      {
        title: "उनके आने का इंतज़ार करें",
        body: 'QR या कोड पहले से न भेजें। यह सिर्फ़ एक बार चलता है और इसका मतलब है "मैंने खाना दे दिया"।',
      },
      {
        title: "अपनी स्क्रीन दिखाएँ",
        body: "जब वे आपके पास हों, QR कोड दिखाएँ। वे स्कैन करेंगे और दोनों फ़ोन पर स्टेटस Picked Up हो जाएगा।",
      },
    ],
    receiverHeading: "अगर आप NGO / वॉलंटियर हैं",
    receiverIntro:
      'अपने अकाउंट में Pickup खोलें। स्टेटस टाइमलाइन के नीचे "Scan the donor\'s QR to confirm pickup" वाला बॉक्स मिलेगा। इनमें से कोई भी एक तरीका अपनाएँ:',
    methods: [
      {
        icon: ScanLine,
        title: "1. ऐप के अंदर स्कैन करें",
        when: "सबसे आसान — Android और iPhone दोनों पर चलता है (कैमरा की अनुमति चाहिए)।",
        steps: [
          { title: '"Scan QR code" दबाएँ', body: "फ़ोन पूछे तो कैमरा की अनुमति (Allow) दें।" },
          {
            title: "डोनर के QR पर कैमरा रखें",
            body: "एक सेकंड स्थिर रखें। पिकअप अपने-आप कन्फ़र्म हो जाएगा।",
          },
        ],
      },
      {
        icon: ImageUp,
        title: "2. QR का स्क्रीनशॉट अपलोड करें",
        when: "अगर डोनर ने QR का स्क्रीनशॉट भेजा है, या कैमरा नहीं खुल रहा।",
        steps: [
          {
            title: '"Upload QR screenshot" दबाएँ',
            body: "गैलरी से स्क्रीनशॉट या फ़ोटो चुनें (कंप्यूटर पर ड्रैग करके या Ctrl+V से भी डाल सकते हैं)।",
          },
          {
            title: "बस इतना ही",
            body: "ऐप फ़ोटो में से QR पढ़कर पिकअप अपने-आप कन्फ़र्म कर देगा। ध्यान रखें कि फ़ोटो में पूरा QR दिख रहा हो।",
          },
        ],
      },
      {
        icon: Camera,
        title: "3. फ़ोन का कैमरा / Google Lens, फिर लिंक पेस्ट करें",
        when: "अगर ऐप के अंदर स्कैन आपके फ़ोन पर न चले, तो यह भी एक तरीका है।",
        steps: [
          {
            title: "फ़ोन का कैमरा या Google Lens खोलें",
            body: "डोनर के QR कोड पर रखें। स्क्रीन पर एक लिंक आएगा।",
          },
          {
            title: "लिंक दबाएँ — या कॉपी करें",
            body: "लिंक दबाने पर Food Waste Connect खुलेगा और पिकअप तुरंत कन्फ़र्म हो जाएगा (आपका साइन-इन होना ज़रूरी है)। या लिंक को देर तक दबाकर Copy चुनें।",
          },
          {
            title: "ऐप में पेस्ट करें",
            body: 'वापस Pickup पर जाएँ, "Paste link" दबाएँ (या बॉक्स को देर तक दबाकर Paste चुनें), फिर Verify दबाएँ।',
          },
        ],
      },
      {
        icon: Keyboard,
        title: "4. कोड टाइप करें",
        when: "अगर कुछ भी काम न करे।",
        steps: [
          {
            title: "QR के नीचे लिखा कोड पढ़ें",
            body: "यह 1A2B3-C4D5E जैसा दिखता है। बड़े या छोटे अक्षर दोनों चलेंगे, डैश (-) ज़रूरी नहीं।",
          },
          { title: "टाइप करके Verify दबाएँ", body: "उसी बॉक्स में जहाँ लिंक पेस्ट करते हैं।" },
        ],
      },
    ] satisfies Method[],
    problemsHeading: "कोई दिक्कत आई?",
    problems: [
      {
        title: '"This QR code is for a different donation"',
        body: "डोनर किसी दूसरे डोनेशन का QR दिखा रहे हैं। उनसे उसी खाने का Pickup पेज खोलने को कहें जो आपने क्लेम किया है।",
      },
      {
        title: '"Camera access was blocked"',
        body: "ब्राउज़र सेटिंग में इस साइट के लिए कैमरा Allow करें, या QR का स्क्रीनशॉट अपलोड करें (तरीका 2)।",
      },
      {
        title: '"This pickup QR code has already been used"',
        body: "पिकअप पहले ही कन्फ़र्म हो चुका है। Pickup पेज रिफ़्रेश करें — स्टेटस Picked Up दिखना चाहिए।",
      },
      {
        title: '"Only the NGO or volunteer who claimed this donation can verify"',
        body: "आप किसी दूसरे अकाउंट से साइन-इन हैं। उसी अकाउंट से साइन-इन करें जिससे खाना क्लेम किया था।",
      },
      {
        title: 'लिंक दबाने पर "Sign in" दिख रहा है',
        body: "पहले साइन-इन करें, फिर QR दोबारा स्कैन करें (या Pickup पेज पर लिंक पेस्ट करें)।",
      },
    ],
    cta: "Pickup पर जाएँ",
  },
};

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-5">
      {steps.map((step, index) => (
        <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <span className="flex size-7 items-center justify-center rounded-full border border-primary text-xs font-medium">
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="font-medium break-words">{step.title}</p>
            <p className="mt-1 text-sm leading-6 break-words text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function QrGuidePage() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === "hi") setLang("hi");
    } catch {
      // Storage unavailable: stay in English.
    }
  }, []);
  function choose(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Not remembered; the choice still applies on this visit.
    }
  }
  const t = copy[lang];

  return (
    <AppShell>
      <PageIntro
        eyebrow={t.eyebrow}
        title={<>{t.title}</>}
        description={t.intro}
        action={
          <div className="flex gap-2" role="group" aria-label="Language">
            <Button
              variant={lang === "en" ? "primary" : "outline"}
              onClick={() => choose("en")}
              aria-pressed={lang === "en"}
            >
              English
            </Button>
            <Button
              variant={lang === "hi" ? "primary" : "outline"}
              onClick={() => choose("hi")}
              aria-pressed={lang === "hi"}
              lang="hi"
            >
              हिंदी
            </Button>
          </div>
        }
      />

      <div lang={lang} className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <section className="border-b border-border p-4 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <h2 className="flex items-center gap-2 font-display text-2xl italic sm:text-3xl">
            <Store className="size-5 shrink-0 text-accent" />
            {t.donorHeading}
          </h2>
          <div className="mt-7">
            <StepList steps={t.donorSteps} />
          </div>
          <div className="mt-8 flex items-center gap-4 border border-border-strong bg-card p-5">
            <QrCode className="size-12 shrink-0 text-accent" />
            <p className="font-mono text-lg tracking-widest">1A2B3-C4D5E</p>
          </div>
        </section>

        <section className="p-4 sm:p-8 lg:p-10">
          <h2 className="flex items-center gap-2 font-display text-2xl italic sm:text-3xl">
            <Truck className="size-5 shrink-0 text-accent" />
            {t.receiverHeading}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.receiverIntro}</p>
          <div className="mt-7 space-y-px bg-border">
            {t.methods.map(({ icon: Icon, title, when, steps }) => (
              <article key={title} className="bg-background py-6 first:pt-0">
                <h3 className="flex items-start gap-2 font-medium">
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="min-w-0 break-words">{title}</span>
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{when}</p>
                <div className="mt-5">
                  <StepList steps={steps} />
                </div>
              </article>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-3 border border-border-strong bg-card p-4 text-xs leading-5 text-muted-foreground">
            <ClipboardPaste className="mt-0.5 size-4 shrink-0 text-accent" />
            <span className="min-w-0 break-words">
              {lang === "hi" ? "लिंक कुछ ऐसा दिखेगा:" : "The link looks like this:"}{" "}
              <span className="font-mono">…/pickup?id=…&amp;code=…</span>
            </span>
          </div>
        </section>
      </div>

      <section lang={lang} className="border-t border-border p-4 sm:p-8 lg:p-10">
        <h2 className="flex items-center gap-2 label-caps">
          <AlertTriangle className="size-4 text-accent" />
          {t.problemsHeading}
        </h2>
        <div className="mt-6 grid gap-px bg-border sm:grid-cols-2">
          {t.problems.map((problem) => (
            <article key={problem.title} className="min-w-0 bg-background p-4 sm:p-5">
              <p className="text-sm font-medium break-words">{problem.title}</p>
              <p className="mt-1 text-sm leading-6 break-words text-muted-foreground">
                {problem.body}
              </p>
            </article>
          ))}
        </div>
        <Button asChild size="wide" className="mt-8">
          <Link to="/pickup">
            {t.cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </AppShell>
  );
}
