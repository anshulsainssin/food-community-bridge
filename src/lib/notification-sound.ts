// A short two-note chime made with the Web Audio API (no sound file needed), plus a short vibration
// on phones. Browsers only allow sound after the person has interacted with the page, so the audio
// is unlocked on their first tap, click or key press.

let context: AudioContext | null = null;
let armed = false;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Call once a signed-in page is open: the first interaction unlocks audio for later notifications. */
export function armNotificationSound() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlock = () => {
    void audioContext()?.resume().catch(() => undefined);
  };
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(type, unlock, { once: true, passive: true });
  }
}

/** Plays the chime (if audio is unlocked) and vibrates briefly (where supported). */
export function playNotificationSound() {
  const ctx = audioContext();
  if (ctx && ctx.state === "running") {
    const start = ctx.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * 0.18;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    });
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(150);
}
