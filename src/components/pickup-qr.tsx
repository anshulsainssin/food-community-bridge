import { Link } from "@tanstack/react-router";
import qrcode from "qrcode-generator";
import { Camera, CircleHelp, ClipboardPaste, QrCode, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { parsePickupPayload, pickupLink } from "@/lib/pickup-link";

function formatCode(code: string) {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

function formatMoment(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** QR modules drawn as an SVG path, so no HTML string injection is needed. */
function QrSvg({ value }: { value: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { size: count + 8, path: d };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-56 bg-white" role="img" aria-label="Pickup QR code" shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}

/** Donor view: the one-time QR code the NGO/volunteer scans at pickup. */
export function PickupCodeCard({ donationId }: { donationId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase.rpc("get_pickup_code", { p_donation_id: donationId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : undefined;
      setCode(row?.code ?? null);
      setVerifiedAt(row?.verified_at ?? null);
      setError(rpcError ? rpcError.message : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [donationId]);

  return (
    <div className="mt-6 border border-border-strong bg-card p-5">
      <p className="label-caps flex items-center gap-2 text-muted-foreground">
        <QrCode className="size-4 text-accent" />
        Pickup QR code
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading pickup code…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-accent">{error}</p>
      ) : verifiedAt ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 shrink-0 text-accent" />
          Pickup verified {formatMoment(verifiedAt)}. This code can't be used again.
        </p>
      ) : code ? (
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <QrSvg value={pickupLink(donationId, code)} />
          <p className="font-mono text-lg tracking-widest">{formatCode(code)}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Show this to the NGO/volunteer who claimed your donation when they arrive. They scan it (or type the
            code) to confirm the pickup. Don't share it before they have the food.
          </p>
          <GuideLink />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Your pickup code appears here once the donation is claimed.</p>
      )}
    </div>
  );
}

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

/**
 * Accepts the QR link, the old QR payload, or just the code typed by hand.
 * Returns null when the QR code belongs to a different donation.
 */
function codeFromInput(input: string, donationId: string) {
  const text = input.trim();
  const payload = parsePickupPayload(text);
  if (payload) return payload.donationId.toLowerCase() === donationId.toLowerCase() ? payload.code : null;
  if (/^https?:\/\//i.test(text)) return "";
  return text;
}

function GuideLink() {
  return (
    <Link to="/qr-guide" className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4">
      <CircleHelp className="size-3.5 text-accent" />
      How does the pickup QR work?
    </Link>
  );
}

/** NGO/volunteer view: scan (or type) the donor's pickup code to confirm the handover. */
export function PickupVerifier({
  donationId,
  onVerified,
  initialInput,
}: {
  donationId: string;
  onVerified: () => void;
  /** A QR link the user opened (/pickup?id=…&code=…): filled in and verified straight away. */
  initialInput?: string | undefined;
}) {
  const [manual, setManual] = useState(initialInput ?? "");
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canScan = barcodeDetector() != null;

  const verify = useCallback(
    async (input: string) => {
      const code = codeFromInput(input, donationId);
      if (code == null) {
        setError("This QR code is for a different donation.");
        return;
      }
      if (!code) {
        setError("Paste the link from the QR code, or type the code shown under it.");
        return;
      }
      setError(null);
      setWorking(true);
      const { error: rpcError } = await supabase.rpc("verify_pickup_code", { p_donation_id: donationId, p_code: code });
      setWorking(false);
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setScanning(false);
      onVerified();
    },
    [donationId, onVerified],
  );

  useEffect(() => {
    const Detector = barcodeDetector();
    if (!scanning || !Detector) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ["qr_code"] });

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          const found = await detector.detect(video).catch(() => []);
          if (found[0]?.rawValue) {
            stopped = true;
            setScanning(false);
            void verify(found[0].rawValue);
            return;
          }
          timer = window.setTimeout(() => void tick(), 300);
        };
        void tick();
      })
      .catch(() => {
        setError("Camera access was blocked. Allow camera access or type the code instead.");
        setScanning(false);
      });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, verify]);

  // Opened from the QR link: verify once, without another tap.
  const autoVerified = useRef(false);
  useEffect(() => {
    if (!initialInput || autoVerified.current) return;
    autoVerified.current = true;
    void verify(initialInput);
  }, [initialInput, verify]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(manual);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("Nothing is copied yet. Copy the link from your scanner app first.");
        return;
      }
      setManual(text.trim());
      void verify(text);
    } catch {
      setError("Couldn't read the clipboard. Long-press the box below and choose Paste.");
    }
  }

  return (
    <div className="mt-3 border border-border-strong bg-card p-5">
      <p className="label-caps flex items-center gap-2 text-muted-foreground">
        <QrCode className="size-4 text-accent" />
        Verify pickup
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {canScan
          ? "Scan the QR code on the donor's screen. Or scan it with your phone's camera / Google Lens, copy the link it shows and paste it below. You can also type the code printed under the QR."
          : "Scan the QR code on the donor's screen with your phone's camera or Google Lens. Tap the link it shows, or copy it and paste it below. You can also type the code printed under the QR."}
      </p>
      {scanning && (
        <div className="mt-4">
          <video ref={videoRef} className="aspect-square w-full max-w-xs bg-black object-cover" muted playsInline />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {canScan &&
          (scanning ? (
            <Button type="button" variant="outline" onClick={() => setScanning(false)}>
              Stop camera
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setScanning(true)} disabled={working}>
              <Camera className="size-4" />
              Scan QR code
            </Button>
          ))}
        <Button type="button" variant="outline" onClick={() => void pasteFromClipboard()} disabled={working}>
          <ClipboardPaste className="size-4" />
          Paste link
        </Button>
      </div>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="Paste the QR link or type the code"
          aria-label="QR link or pickup code"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 border-b border-input bg-transparent font-mono text-sm outline-none focus:border-foreground"
        />
        <Button type="submit" disabled={working}>
          {working ? "Verifying…" : "Verify"}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      <div className="mt-4">
        <GuideLink />
      </div>
    </div>
  );
}
