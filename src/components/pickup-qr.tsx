import { Link } from "@tanstack/react-router";
import qrcode from "qrcode-generator";
import { Camera, CircleHelp, ClipboardPaste, Copy, Download, ImageUp, QrCode, Share2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { parsePickupPayload, pickupLink } from "@/lib/pickup-link";
import { canUseCamera, decodeQrFromImage, decodeQrFromVideo } from "@/lib/qr-decode";

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

/** The pickup QR as a PNG (white margin, code printed underneath), for sharing or saving. */
function qrPngBlob(value: string, caption: string): Promise<Blob | null> {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const scale = 10;
  const margin = 4 * scale;
  const size = count * scale + margin * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + 60;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) context.fillRect(margin + col * scale, margin + row * scale, scale, scale);
    }
  }
  context.font = "bold 28px monospace";
  context.textAlign = "center";
  context.fillText(caption, size / 2, size + 30);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/**
 * Donor: send the pickup QR to the NGO / volunteer (WhatsApp or any app via the phone's share sheet), or
 * save it / copy its link. The receiver uploads the image (or opens the link) to confirm the pickup.
 */
function ShareQr({ donationId, code }: { donationId: string; code: string }) {
  const t = useT();
  const [status, setStatus] = useState<string | null>(null);
  const link = pickupLink(donationId, code);
  const fileName = `pickup-qr-${donationId.slice(0, 8)}.png`;
  const message = t("Pickup QR for the food you claimed on FoodBridge. Open this link (or upload this QR on your Pickup page) to confirm the pickup:");

  async function share() {
    setStatus(null);
    const blob = await qrPngBlob(link, formatCode(code));
    const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    try {
      if (file && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: t("Pickup QR code"), text: `${message} ${link}` });
        return;
      }
      if (typeof nav.share === "function") {
        await nav.share({ title: t("Pickup QR code"), text: message, url: link });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    // No share sheet (most desktop browsers): save the image instead.
    await download();
  }

  async function download() {
    const blob = await qrPngBlob(link, formatCode(code));
    if (!blob) {
      setStatus(t("Couldn't create the QR image."));
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(t("QR image saved. Send it to the NGO / volunteer — they upload it on their Pickup page."));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus(t("Link copied. Send it to the NGO / volunteer — opening it confirms the pickup."));
    } catch {
      setStatus(link);
    }
  }

  return (
    <div className="w-full border-t border-border pt-3">
      <p className="text-xs leading-5 text-muted-foreground">
        {t("NGO / volunteer not with you? Send them this QR. They upload it (or open the link) on their Pickup page to confirm the pickup.")}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => void share()}>
          <Share2 className="size-4" />
          {t("Share QR")}
        </Button>
        <Button type="button" variant="outline" onClick={() => void download()}>
          <Download className="size-4" />
          {t("Save QR image")}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          <Copy className="size-4" />
          {t("Copy link")}
        </Button>
      </div>
      {status && <p className="mt-2 break-all text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

/** Donor view: the one-time QR code the NGO/volunteer scans at pickup. */
export function PickupCodeCard({ donationId }: { donationId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

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
        {t("Pickup QR code")}
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("Loading pickup code…")}</p>
      ) : error ? (
        <p className="mt-4 text-sm text-accent">{error}</p>
      ) : verifiedAt ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 shrink-0 text-accent" />
          {t("Pickup verified {time}. This code can't be used again.", { time: formatMoment(verifiedAt) })}
        </p>
      ) : code ? (
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <QrSvg value={pickupLink(donationId, code)} />
          <p className="font-mono text-lg tracking-widest">{formatCode(code)}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("Show this to the NGO/volunteer who claimed your donation when they arrive. They open the Pickup page in their own account and tap \"Scan QR code\" (or upload a screenshot of it, or type the code) to confirm the pickup. Share it only at the time of handover — scanning it records that the food was handed over.")}
          </p>
          <ShareQr donationId={donationId} code={code} />
          <GuideLink />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t("Your pickup code appears here once the donation is claimed.")}</p>
      )}
    </div>
  );
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
  const t = useT();
  return (
    <Link to="/qr-guide" className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4">
      <CircleHelp className="size-3.5 text-accent" />
      {t("How does the pickup QR work?")}
    </Link>
  );
}

function imageFrom(items: DataTransferItemList | FileList | null | undefined) {
  if (!items) return null;
  const list: (DataTransferItem | File)[] = Array.from(items as ArrayLike<DataTransferItem | File>);
  for (const item of list) {
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (file && file.type.startsWith("image/")) return file;
  }
  return null;
}

/**
 * NGO/volunteer view: confirm the handover with the donor's pickup QR — scan it with the camera, upload a
 * screenshot / photo of it, paste its link, or type the code. A readable QR is verified straight away.
 */
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
  const t = useT();
  const [manual, setManual] = useState(initialInput ?? "");
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  useEffect(() => setCameraAvailable(canUseCamera()), []);
  const busy = working || reading;

  // Free the screenshot thumbnail's object URL when it changes or the verifier closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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

  // A QR read by the camera or from an image must be a FoodBridge pickup QR.
  const verifyScanned = useCallback(
    (text: string) => {
      setManual(text);
      if (!parsePickupPayload(text)) {
        setError("A QR code was found, but it isn't a FoodBridge pickup QR. Scan the QR on the donor's Pickup page.");
        return;
      }
      void verify(text);
    },
    [verify],
  );

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");

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
          const text = await decodeQrFromVideo(video, canvas).catch(() => null);
          if (stopped) return;
          if (text) {
            stopped = true;
            setScanning(false);
            verifyScanned(text);
            return;
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      })
      .catch(() => {
        setError("Camera access was blocked. Allow camera access, or upload a screenshot of the QR instead.");
        setScanning(false);
      });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, verifyScanned]);

  // Opened from the QR link: verify once, without another tap.
  const autoVerified = useRef(false);
  useEffect(() => {
    if (!initialInput || autoVerified.current) return;
    autoVerified.current = true;
    void verify(initialInput);
  }, [initialInput, verify]);

  async function readImage(file: File | Blob) {
    setError(null);
    setScanning(false);
    setPreview(URL.createObjectURL(file));
    setReading(true);
    let text: string | null = null;
    try {
      text = await decodeQrFromImage(file);
    } catch {
      setReading(false);
      setError("Couldn't open this file. Upload a screenshot or photo (PNG or JPG).");
      return;
    }
    setReading(false);
    if (!text) {
      setError("No QR code found in this image. Upload a clear screenshot where the whole QR code is visible.");
      return;
    }
    verifyScanned(text);
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = imageFrom(event.target.files);
    event.target.value = "";
    if (file) void readImage(file);
    else if (event.target.files?.length) setError("That file isn't an image. Upload a screenshot or photo of the QR code.");
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = imageFrom(event.dataTransfer.files);
    if (file) void readImage(file);
    else setError("Drop a screenshot or photo of the QR code.");
  }

  // Ctrl+V / long-press paste of a copied screenshot anywhere in the verifier.
  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const file = imageFrom(event.clipboardData.items);
    if (!file) return;
    event.preventDefault();
    void readImage(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(manual);
  }

  async function pasteFromClipboard() {
    // A copied screenshot (where the browser allows reading images), else the copied link / code.
    try {
      if (typeof navigator.clipboard.read === "function") {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((value) => value.startsWith("image/"));
          if (type) {
            void readImage(await item.getType(type));
            return;
          }
        }
      }
    } catch {
      // Image clipboard access refused or unsupported; try text below.
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("Nothing is copied yet. Copy the link from your scanner app first, or upload a screenshot.");
        return;
      }
      setManual(text.trim());
      void verify(text);
    } catch {
      setError("Couldn't read the clipboard. Long-press the box below and choose Paste.");
    }
  }

  return (
    <div className="mt-3 border border-border-strong bg-card p-5" onPaste={onPaste}>
      <p className="label-caps flex items-center gap-2 text-muted-foreground">
        <QrCode className="size-4 text-accent" />
        {t("Scan the donor's QR to confirm pickup")}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t("The QR is on the donor's Pickup page. At the pickup, scan it from the donor's screen. If the donor sent you the QR (WhatsApp etc.), upload that image below — it is read and verified automatically. You can also open or paste the QR link, or type the code printed under the QR.")}
      </p>

      {scanning && (
        <div className="mt-4">
          <div className="relative w-full max-w-xs">
            <video ref={videoRef} className="aspect-square w-full bg-black object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-[15%] border-2 border-white/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("Point the camera at the QR code and hold it steady.")}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {cameraAvailable &&
          (scanning ? (
            <Button type="button" variant="outline" onClick={() => setScanning(false)}>
              {t("Stop camera")}
            </Button>
          ) : (
            <Button type="button" onClick={() => setScanning(true)} disabled={busy}>
              <Camera className="size-4" />
              {t("Scan QR code")}
            </Button>
          ))}
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImageUp className="size-4" />
          {t("Upload QR screenshot")}
        </Button>
        <Button type="button" variant="outline" onClick={() => void pasteFromClipboard()} disabled={busy}>
          <ClipboardPaste className="size-4" />
          {t("Paste link")}
        </Button>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex cursor-pointer items-center gap-4 border border-dashed p-4 text-xs leading-5 transition-colors ${
          dragging ? "border-foreground bg-muted" : "border-border-strong text-muted-foreground hover:bg-muted/50"
        }`}
      >
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onFileChosen} disabled={busy} />
        {preview ? (
          <img src={preview} alt="Uploaded QR screenshot" className="size-16 shrink-0 border border-border object-contain" />
        ) : (
          <ImageUp className="size-6 shrink-0 text-accent" />
        )}
        <span className="min-w-0">
          {t(
            reading
              ? "Reading the QR code…"
              : working
                ? "Verifying…"
                : "Tap to choose the QR image the donor sent you (or a screenshot / photo of it), or drop / paste it here.",
          )}
        </span>
      </label>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder={t("Paste the QR link or type the code")}
          aria-label="QR link or pickup code"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 border-b border-input bg-transparent font-mono text-sm outline-none focus:border-foreground"
        />
        <Button type="submit" disabled={busy}>
          {working ? t("Verifying…") : t("Verify")}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      <div className="mt-4">
        <GuideLink />
      </div>
    </div>
  );
}
