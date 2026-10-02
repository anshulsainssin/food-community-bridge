// Reads QR codes from the camera or from an uploaded image (e.g. a screenshot of the donor's QR).
// Uses the browser's built-in BarcodeDetector where there is one (Chrome on Android), otherwise jsQR,
// which runs everywhere (iPhone Safari, desktop browsers). jsQR is only downloaded when first needed.

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
type JsQr = (typeof import("jsqr"))["default"];

let nativeDetector: Promise<BarcodeDetectorLike | null> | null = null;
let jsQrModule: Promise<JsQr> | null = null;

function getNativeDetector() {
  nativeDetector ??= (async () => {
    if (typeof window === "undefined") return null;
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    if (!Detector) return null;
    try {
      const formats = (await Detector.getSupportedFormats?.()) ?? ["qr_code"];
      return formats.includes("qr_code") ? new Detector({ formats: ["qr_code"] }) : null;
    } catch {
      return null;
    }
  })();
  return nativeDetector;
}

function getJsQr() {
  jsQrModule ??= import("jsqr").then((module) => module.default);
  return jsQrModule;
}

/** Whether this browser can open the camera at all (needs HTTPS). */
export function canUseCamera() {
  return (
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

async function detectNative(source: CanvasImageSource) {
  const detector = await getNativeDetector();
  if (!detector) return null;
  try {
    const found = await detector.detect(source);
    return found.find((item) => item.rawValue)?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** Draws `source` scaled so its longer side is at most `maxSide`, then runs jsQR on the pixels. */
async function detectJsQr(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  canvas: HTMLCanvasElement,
  thorough: boolean,
) {
  if (!width || !height) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  const jsQR = await getJsQr();
  const result = jsQR(pixels.data, w, h, {
    inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
  });
  return result?.data || null;
}

/** One live camera frame → QR text, or null when there's no readable QR in view yet. */
export async function decodeQrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (video.readyState < 2 || !video.videoWidth) return null;
  return (
    (await detectNative(video)) ??
    (await detectJsQr(video, video.videoWidth, video.videoHeight, 720, canvas, false))
  );
}

async function loadImage(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall back to an <img> below (older Safari, unusual formats).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * An uploaded / pasted image (screenshot or photo) → QR text, or null when no QR code could be read.
 * Throws when the file isn't an image the browser can open.
 */
export async function decodeQrFromImage(file: Blob) {
  const image = await loadImage(file);
  try {
    const native = await detectNative(image.source);
    if (native) return native;
    const canvas = document.createElement("canvas");
    // Screenshots are large and the QR is often a small part of them: try a few sizes.
    for (const maxSide of [1280, 2400, 800]) {
      const text = await detectJsQr(image.source, image.width, image.height, maxSide, canvas, true);
      if (text) return text;
    }
    return null;
  } finally {
    image.release();
  }
}
