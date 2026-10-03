import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  HandHeart,
  Scale,
  ShieldCheck,
  Store,
  Thermometer,
  Truck,
} from "lucide-react";

import { AppShell, PageIntro } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useLanguage, useT } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Mutual Disclaimer | FoodBridge" },
      {
        name: "description",
        content:
          "Terms of use, donor and receiver responsibilities, and food safety guidelines for FoodBridge.",
      },
      { property: "og:title", content: "Terms & Mutual Disclaimer | FoodBridge" },
      {
        property: "og:description",
        content: "Responsibilities of donors and receivers, and food safety guidelines.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

type Section = { icon: typeof Scale; title: string; points: string[] };

const LAST_UPDATED = "3 October 2026";

const content: Record<"en" | "hi", { sections: Section[]; note: string }> = {
  en: {
    sections: [
      {
        icon: Scale,
        title: "What FoodBridge does",
        points: [
          "FoodBridge is a platform that connects hotels, restaurants, caterers and other donors who have surplus food with verified NGOs and volunteers who can collect it.",
          "The platform only helps people find each other and coordinate pickups. It does not prepare, store, inspect, transport or serve any food, and it is not a party to the donation.",
          "Food is given free of charge. It must not be sold or used for commercial purposes.",
        ],
      },
      {
        icon: Store,
        title: "Donor responsibilities",
        points: [
          "Only donate food that, to the best of your knowledge, is fresh, safe to eat and was prepared and handled hygienically.",
          "Do not donate spoiled food, food past its use-by date, or leftovers from plates that have been served.",
          "Give accurate details: food name, quantity, when it was prepared, the pickup deadline, how it has been stored, how it is packed, and whether it is vegetarian. Mention allergens (for example nuts, dairy, gluten) in the notes.",
          "Keep the food stored safely until pickup (hot food hot, cold food cold) and pack it in clean, covered, food-grade containers.",
          "Hand the food only to the NGO / volunteer who claimed it, and confirm the handover with the pickup QR code.",
        ],
      },
      {
        icon: Truck,
        title: "NGO and volunteer (receiver) responsibilities",
        points: [
          "Claim food only after your NGO registration or volunteer profile has been verified, and only when you can collect it before the pickup deadline.",
          "Check the food at pickup — look, smell, temperature and packaging. If anything seems unsafe, do not accept it and report the listing.",
          "Transport the food quickly and keep it hot or cold as needed. Distribute it as soon as possible.",
          "Distribute the food free of charge to people in need, and handle it hygienically.",
          "After the handover, the receiver is responsible for how the food is stored, transported and served.",
        ],
      },
      {
        icon: Thermometer,
        title: "Food safety guidelines",
        points: [
          "Keep hot food hot (above 60°C) and cold food cold (below 5°C). Perishable food should not sit at room temperature for more than about 2 hours.",
          "On this platform a listing can be claimed only within its safe pickup window: the earliest of the pickup deadline, 24 hours after the food was prepared, and 24 hours after it was posted.",
          "Use clean, covered, food-grade containers. Keep raw and cooked food separate. Label vegetarian and non-vegetarian food clearly.",
          "Wash hands before handling food. People who are unwell should not handle food.",
          "When in doubt, throw it out — do not serve food that looks, smells or tastes wrong.",
        ],
      },
      {
        icon: ShieldCheck,
        title: "Verification and reports",
        points: [
          "NGOs and volunteers are verified by platform admins from the details and documents they submit. Verification lowers risk but is not a guarantee of anyone's conduct.",
          "Verification documents are stored privately. They are visible only to the person who uploaded them and to platform admins, never on a public page or profile.",
          "Anyone can report a problematic listing. Admins review reports and may remove listings or suspend accounts.",
        ],
      },
      {
        icon: HandHeart,
        title: "Mutual disclaimer",
        points: [
          "Donors and receivers act voluntarily and in good faith. The donor's food-safety checklist and details are the donor's own declarations, made to the best of their knowledge.",
          "FoodBridge does not guarantee the quality, safety or suitability of any food, or the conduct of any user, and is not responsible for loss, illness or damage arising from a donation.",
          "Each donor and receiver is responsible for following the food safety laws and rules that apply to them (in India, including the applicable FSSAI regulations).",
          "By posting or claiming food, you agree to these terms and to the responsibilities above.",
        ],
      },
    ],
    note: "This page is general information, not legal advice. For questions about your own legal obligations, consult a qualified professional.",
  },
  hi: {
    sections: [
      {
        icon: Scale,
        title: "FoodBridge क्या करता है",
        points: [
          "FoodBridge एक प्लेटफ़ॉर्म है जो होटल, रेस्टोरेंट, कैटरर और दूसरे डोनर्स के बचे हुए खाने को सत्यापित NGOs और वॉलंटियर्स तक पहुँचाने में मदद करता है।",
          "यह प्लेटफ़ॉर्म सिर्फ़ लोगों को जोड़ता है और पिकअप में मदद करता है। यह खुद खाना न बनाता है, न रखता है, न जाँचता है, न ले जाता है और न परोसता है, और डोनेशन में पक्षकार नहीं है।",
          "खाना मुफ़्त दिया जाता है। इसे बेचा नहीं जा सकता या व्यापार के लिए इस्तेमाल नहीं किया जा सकता।",
        ],
      },
      {
        icon: Store,
        title: "डोनर की ज़िम्मेदारियाँ",
        points: [
          "सिर्फ़ वही खाना दान करें जो आपकी जानकारी में ताज़ा, खाने लायक और साफ़-सफ़ाई से बना और रखा गया हो।",
          "खराब खाना, एक्सपायरी डेट निकल चुका खाना, या परोसी गई थालियों का बचा हुआ जूठा खाना दान न करें।",
          "सही जानकारी दें: खाने का नाम, मात्रा, कब बना, पिकअप की आख़िरी समय-सीमा, कैसे रखा गया, कैसे पैक है, और शाकाहारी है या नहीं। एलर्जी वाली चीज़ें (जैसे मेवे, दूध, ग्लूटेन) नोट्स में लिखें।",
          "पिकअप तक खाना सुरक्षित रखें (गर्म खाना गर्म, ठंडा खाना ठंडा) और साफ़, ढके हुए, फ़ूड-ग्रेड डिब्बों में पैक करें।",
          "खाना सिर्फ़ उसी NGO / वॉलंटियर को दें जिसने उसे क्लेम किया है, और पिकअप QR कोड से हैंडओवर कन्फ़र्म करें।",
        ],
      },
      {
        icon: Truck,
        title: "NGO और वॉलंटियर (रिसीवर) की ज़िम्मेदारियाँ",
        points: [
          "खाना तभी क्लेम करें जब आपका NGO रजिस्ट्रेशन या वॉलंटियर प्रोफ़ाइल सत्यापित हो चुकी हो, और आप पिकअप की समय-सीमा से पहले खाना ले सकें।",
          "पिकअप के समय खाना जाँचें — दिखावट, गंध, तापमान और पैकिंग। कुछ भी असुरक्षित लगे तो खाना न लें और लिस्टिंग रिपोर्ट करें।",
          "खाना जल्दी ले जाएँ और ज़रूरत के हिसाब से गर्म या ठंडा रखें। जितनी जल्दी हो सके बाँटें।",
          "खाना ज़रूरतमंद लोगों में मुफ़्त और साफ़-सफ़ाई से बाँटें।",
          "हैंडओवर के बाद खाने को रखने, ले जाने और परोसने की ज़िम्मेदारी रिसीवर की होती है।",
        ],
      },
      {
        icon: Thermometer,
        title: "खाद्य सुरक्षा दिशानिर्देश",
        points: [
          "गर्म खाना गर्म (60°C से ऊपर) और ठंडा खाना ठंडा (5°C से नीचे) रखें। जल्दी खराब होने वाला खाना कमरे के तापमान पर लगभग 2 घंटे से ज़्यादा न रखें।",
          "इस प्लेटफ़ॉर्म पर लिस्टिंग सिर्फ़ सुरक्षित पिकअप समय में क्लेम हो सकती है: पिकअप की समय-सीमा, खाना बनने के 24 घंटे बाद, और पोस्ट होने के 24 घंटे बाद — इनमें जो सबसे पहले हो।",
          "साफ़, ढके हुए, फ़ूड-ग्रेड डिब्बे इस्तेमाल करें। कच्चा और पका खाना अलग रखें। शाकाहारी और मांसाहारी खाने पर साफ़ लेबल लगाएँ।",
          "खाना छूने से पहले हाथ धोएँ। जो लोग बीमार हों, वे खाना न संभालें।",
          "शक हो तो खाना न परोसें — जो खाना दिखने, सूँघने या चखने में ठीक न लगे, उसे न दें।",
        ],
      },
      {
        icon: ShieldCheck,
        title: "सत्यापन और रिपोर्ट",
        points: [
          "NGOs और वॉलंटियर्स को प्लेटफ़ॉर्म एडमिन उनके दिए गए विवरण और दस्तावेज़ों के आधार पर सत्यापित करते हैं। सत्यापन से जोखिम कम होता है, लेकिन यह किसी के आचरण की गारंटी नहीं है।",
          "सत्यापन दस्तावेज़ निजी रूप से रखे जाते हैं। इन्हें सिर्फ़ अपलोड करने वाला व्यक्ति और प्लेटफ़ॉर्म एडमिन देख सकते हैं, कभी किसी सार्वजनिक पेज या प्रोफ़ाइल पर नहीं।",
          "कोई भी गलत लिस्टिंग रिपोर्ट कर सकता है। एडमिन रिपोर्ट देखते हैं और लिस्टिंग हटा सकते हैं या अकाउंट निलंबित कर सकते हैं।",
        ],
      },
      {
        icon: HandHeart,
        title: "आपसी अस्वीकरण (Mutual Disclaimer)",
        points: [
          "डोनर और रिसीवर अपनी इच्छा से और नेक नीयत से काम करते हैं। डोनर की फ़ूड-सेफ़्टी चेकलिस्ट और जानकारी डोनर की अपनी घोषणा है, जो उसकी पूरी जानकारी के अनुसार दी गई है।",
          "FoodBridge किसी भी खाने की गुणवत्ता, सुरक्षा या उपयुक्तता, या किसी यूज़र के आचरण की गारंटी नहीं देता, और किसी डोनेशन से होने वाले नुकसान, बीमारी या क्षति के लिए ज़िम्मेदार नहीं है।",
          "हर डोनर और रिसीवर अपने ऊपर लागू खाद्य सुरक्षा कानूनों और नियमों का पालन करने के लिए ज़िम्मेदार है (भारत में लागू FSSAI नियमों सहित)।",
          "खाना पोस्ट या क्लेम करके आप इन नियमों और ऊपर दी गई ज़िम्मेदारियों से सहमत होते हैं।",
        ],
      },
    ],
    note: "यह पेज सामान्य जानकारी है, कानूनी सलाह नहीं। अपनी कानूनी ज़िम्मेदारियों के बारे में सवाल हों तो किसी योग्य विशेषज्ञ से सलाह लें।",
  },
};

function TermsPage() {
  const lang = useLanguage();
  const t = useT();
  const { sections, note } = content[lang];

  return (
    <AppShell>
      <PageIntro
        eyebrow="Help / Terms & safety"
        title={<>{t("Terms & mutual disclaimer")}</>}
        description="How donors and receivers share responsibility, and the food safety guidelines everyone follows."
      />
      <div lang={lang} className="grid gap-px bg-border lg:grid-cols-2">
        {sections.map(({ icon: Icon, title, points }) => (
          <section key={title} className="min-w-0 bg-background p-4 sm:p-8 lg:p-10">
            <h2 className="flex items-center gap-2 font-display text-2xl italic sm:text-3xl">
              <Icon className="size-5 shrink-0 text-accent" />
              <span className="min-w-0 break-words">{title}</span>
            </h2>
            <ul className="mt-6 space-y-3">
              {points.map((point) => (
                <li
                  key={point}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm leading-6"
                >
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <span className="break-words">{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="border-t border-border px-4 py-6 sm:px-8 lg:px-12">
        <p lang={lang} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            {note} {t("Last updated")}: {LAST_UPDATED}.
          </span>
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/">{t("Share surplus food")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/donations">{t("Find food")}</Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
