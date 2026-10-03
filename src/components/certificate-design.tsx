import { Heart, Leaf, Users } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Certificate of Impact, drawn at A4 landscape size (1123 × 794 CSS px at 96 dpi). On screen it is scaled
// down to fit; when printed it fills the page.
const W = 1123;
const H = 794;

const GREEN = "#174f2e";
const GREEN_2 = "#2f7a3a";
const GOLD = "#c49a3c";
const CREAM = "#fbf8ef";

const serif: CSSProperties = { fontFamily: '"Cinzel", "Instrument Serif", Georgia, serif' };
const script: CSSProperties = { fontFamily: '"Great Vibes", "Instrument Serif", cursive' };

export type CertificateDesignProps = {
  recipient: string;
  kg: string;
  month: string;
  donations: string;
  people: string;
  issued: string;
  certificateNo: string;
  t: (text: string, vars?: Record<string, string | number>) => string;
  lang: string;
};

function LeafSprig({ flip = false, size = 34 }: { flip?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <path d="M4 22 C14 22 24 20 36 12" stroke={GREEN} strokeWidth="1.6" fill="none" />
      <path d="M14 21 C12 12 18 6 26 5 C26 13 21 19 14 21Z" fill={GREEN_2} />
      <path d="M22 18 C26 24 33 26 38 23 C34 17 28 15 22 18Z" fill={GREEN} />
    </svg>
  );
}

function CornerLeaves({ style, flip = false }: { style: CSSProperties; flip?: boolean }) {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 70 70"
      aria-hidden="true"
      style={{ position: "absolute", ...style, transform: flip ? "scaleX(-1)" : undefined }}
    >
      <path d="M8 8 C30 14 46 30 52 58" stroke={GREEN} strokeWidth="1.4" fill="none" />
      <path d="M20 14 C10 2 26 -2 34 6 C34 16 28 20 20 14Z" fill={GREEN_2} />
      <path d="M36 30 C30 16 46 12 54 22 C52 32 44 34 36 30Z" fill={GREEN} />
      <path d="M44 48 C40 36 56 34 62 44 C58 54 50 54 44 48Z" fill={GREEN_2} />
    </svg>
  );
}

/** Gold rosette with ribbons: "Zero Food Waste Champion". */
function Seal({ lines }: { lines: string[] }) {
  const points: string[] = [];
  const spikes = 36;
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? 100 : 92;
    const a = (Math.PI * i) / spikes;
    points.push(`${110 + r * Math.cos(a)},${110 + r * Math.sin(a)}`);
  }
  return (
    <svg width="220" height="300" viewBox="0 0 220 300" aria-hidden="true">
      <defs>
        <linearGradient id="seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d27a" />
          <stop offset="0.5" stopColor="#c99a35" />
          <stop offset="1" stopColor="#f0cd6e" />
        </linearGradient>
        <linearGradient id="seal-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f6a3a" />
          <stop offset="1" stopColor="#123f24" />
        </linearGradient>
      </defs>
      <path
        d="M62 170 L30 290 L62 270 L82 296 L106 190Z"
        fill="url(#seal-green)"
        stroke="url(#seal-gold)"
        strokeWidth="3"
      />
      <path
        d="M158 170 L190 290 L158 270 L138 296 L114 190Z"
        fill="url(#seal-green)"
        stroke="url(#seal-gold)"
        strokeWidth="3"
      />
      <polygon points={points.join(" ")} fill="url(#seal-gold)" />
      <circle cx="110" cy="110" r="80" fill="url(#seal-green)" stroke="#f3d27a" strokeWidth="4" />
      <circle
        cx="110"
        cy="110"
        r="71"
        fill="none"
        stroke="#e7c063"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
      <path d="M110 46 C103 54 103 62 110 68 C117 62 117 54 110 46Z" fill="#fff" />
      <path d="M110 68 L110 74" stroke="#fff" strokeWidth="1.5" />
      {lines.map((line, index) => (
        <text
          key={line}
          x="110"
          y={96 + index * 22}
          textAnchor="middle"
          fill="#fff"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight="700"
          fontSize={index === 0 ? 21 : 15}
          letterSpacing="0.5"
        >
          {line}
        </text>
      ))}
      <text x="110" y="166" textAnchor="middle" fill="#f3d27a" fontSize="15" letterSpacing="4">
        ★★★
      </text>
    </svg>
  );
}

function Stat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: GREEN,
        fontSize: 15,
        lineHeight: 1.25,
      }}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

/** Scales the fixed-size certificate to the available width on screen (printing uses full size). */
function useFitScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScale(Math.min(1, element.clientWidth / W));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function CertificateDesign({
  recipient,
  kg,
  month,
  donations,
  people,
  issued,
  certificateNo,
  t,
  lang,
}: CertificateDesignProps) {
  const { ref, scale } = useFitScale();
  const sealLines = t("ZERO|FOOD WASTE|CHAMPION").split("|");
  // Letter-spacing breaks Devanagari apart, so it is only used for English.
  const spaced = (px: number) => (lang === "hi" ? 0 : px);

  return (
    <div
      ref={ref}
      className="certificate-fit mx-auto w-full max-w-[1123px]"
      style={{ height: H * scale }}
    >
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body { background: #fff !important; }
          .certificate-fit { height: ${H}px !important; max-width: none !important; width: ${W}px !important; margin: 0 !important; }
          .certificate-sheet { transform: none !important; box-shadow: none !important; }
        }
      `}</style>
      <div
        lang={lang}
        className="certificate-sheet"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "relative",
          overflow: "hidden",
          background: CREAM,
          color: GREEN,
          fontFamily: "Inter, Arial, sans-serif",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        {/* Bottom waves */}
        <svg
          width={W}
          height="170"
          viewBox={`0 0 ${W} 170`}
          aria-hidden="true"
          style={{ position: "absolute", left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="wave-a" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6aa84f" />
              <stop offset="1" stopColor="#3f8a3c" />
            </linearGradient>
            <linearGradient id="wave-b" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1f6a3a" />
              <stop offset="1" stopColor="#174f2e" />
            </linearGradient>
          </defs>
          <path
            d={`M0 70 C200 40 380 120 620 110 C820 100 960 40 ${W} 20 L${W} 170 L0 170Z`}
            fill="url(#wave-a)"
            opacity="0.85"
          />
          <path
            d={`M0 110 C240 80 420 150 660 140 C860 132 1000 80 ${W} 60 L${W} 170 L0 170Z`}
            fill="url(#wave-b)"
          />
        </svg>

        {/* Gold frame */}
        <div
          style={{
            position: "absolute",
            inset: 16,
            border: `1.5px solid ${GOLD}`,
            pointerEvents: "none",
          }}
        />
        <CornerLeaves style={{ left: 22, top: 22 }} />
        <CornerLeaves style={{ right: 22, top: 22 }} flip />

        {/* Brand, top left */}
        <div
          style={{
            position: "absolute",
            left: 84,
            top: 60,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={64}
            height={64}
            style={{ width: 64, height: 64 }}
          />
          <div>
            <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.05 }}>
              Food<span style={{ color: "#4c9a2a" }}>Bridge</span>
            </p>
            <p style={{ fontSize: 12, marginTop: 4, color: GREEN_2 }}>
              {t("Good Food ♥ Greater Impact")}
            </p>
          </div>
        </div>

        {/* Script motto, top right */}
        <div
          style={{
            position: "absolute",
            right: 84,
            top: 70,
            transform: "rotate(-8deg)",
            textAlign: "center",
            ...script,
            fontSize: 26,
            lineHeight: 1.05,
            color: GREEN,
          }}
        >
          <p>Good Food</p>
          <p>Good People</p>
          <p>Greater Impact</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: GREEN }}>— ♥ —</p>
        </div>

        {/* Title */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <LeafSprig />
            <h1
              style={{
                ...serif,
                fontSize: 60,
                fontWeight: 700,
                letterSpacing: spaced(2),
                lineHeight: 1,
                color: GREEN,
              }}
            >
              {t("CERTIFICATE")}
            </h1>
            <LeafSprig flip />
          </div>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <span style={{ width: 90, height: 1.5, background: GOLD }} />
            <p style={{ fontSize: 24, fontWeight: 600, letterSpacing: spaced(8) }}>
              {t("OF IMPACT")}
            </p>
            <span style={{ width: 90, height: 1.5, background: GOLD }} />
          </div>
        </div>

        {/* Seal */}
        <div style={{ position: "absolute", left: 54, top: 190 }}>
          <Seal lines={sealLines} />
        </div>

        {/* Main text */}
        <div style={{ position: "absolute", left: 290, width: 545, top: 236, textAlign: "center" }}>
          <p style={{ fontSize: 19 }}>{t("This certificate is proudly presented to")}</p>
          <p
            style={{
              ...script,
              fontSize: recipient.length > 28 ? 42 : 56,
              lineHeight: 1.15,
              marginTop: 10,
              paddingBottom: 6,
              borderBottom: `1.5px solid ${GOLD}`,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {recipient}
          </p>
          <p style={{ fontSize: 23, marginTop: 22 }}>
            {t("for donating {kg} of food in {month}")
              .split(/(\{kg\}|\{month\})/)
              .map((part, index) =>
                part === "{kg}" ? (
                  <strong key={index}>{kg} kg</strong>
                ) : part === "{month}" ? (
                  <strong key={index}>{month}</strong>
                ) : (
                  <span key={index}>{part}</span>
                ),
              )}
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.6, marginTop: 12, color: "#24452f" }}>
            {t(
              "Your generous contribution of {count} donations fed {people} people, helped reduce food waste and brought smiles to many lives.",
              {
                count: donations,
                people,
              },
            )}
          </p>
        </div>

        {/* Three highlights */}
        <div
          style={{
            position: "absolute",
            left: 290,
            width: 545,
            top: 512,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Stat icon={<Leaf size={30} fill={GREEN} strokeWidth={1.2} />}>
            {t("Reduced Food Waste")}
          </Stat>
          <span style={{ width: 1, height: 44, background: GOLD }} />
          <Stat icon={<Users size={30} fill={GREEN} strokeWidth={1.2} />}>
            {t("Supported Communities")}
          </Stat>
          <span style={{ width: 1, height: 44, background: GOLD }} />
          <Stat icon={<Heart size={30} fill={GREEN} strokeWidth={1.2} />}>
            {t("Created Positive Change")}
          </Stat>
        </div>

        {/* Right column */}
        <div style={{ position: "absolute", right: 64, top: 236, width: 200, textAlign: "center" }}>
          <img
            src="/logo-mark.png"
            alt=""
            width={96}
            height={96}
            style={{ width: 96, height: 96, margin: "0 auto" }}
          />
          <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, marginTop: 12 }}>
            {t("Your Food Creates Hope")}
          </p>
          <p style={{ marginTop: 8, fontSize: 14 }}>— ♥ —</p>
        </div>

        {/* Footer row */}
        <div style={{ position: "absolute", left: 70, top: 590, fontSize: 15 }}>
          <p>
            {t("Date")}:{" "}
            <span style={{ borderBottom: `1px solid ${GREEN}`, paddingBottom: 2 }}>{issued}</span>
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: "#24452f" }}>
            {t("Certificate no.")}: <span style={{ fontFamily: "monospace" }}>{certificateNo}</span>
          </p>
          <p style={{ marginTop: 4, fontSize: 10, color: "#4b6b55" }}>
            {t("Certificate of appreciation · not a tax (80G) receipt")}
          </p>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 646, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <LeafSprig size={24} />
          </div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <span style={{ width: 50, height: 1, background: GOLD }} />
            <p style={{ fontSize: 12, letterSpacing: spaced(3) }}>
              {t("TOGETHER FOR A HUNGER FREE TOMORROW")}
            </p>
            <span style={{ width: 50, height: 1, background: GOLD }} />
          </div>
        </div>
        <div style={{ position: "absolute", right: 70, top: 580, textAlign: "center", width: 220 }}>
          <p style={{ ...script, fontSize: 40, lineHeight: 1 }}>FoodBridge</p>
          <p style={{ marginTop: 4, borderTop: `1px solid ${GREEN}`, paddingTop: 6, fontSize: 14 }}>
            {t("Team FoodBridge")}
          </p>
        </div>
      </div>
    </div>
  );
}
