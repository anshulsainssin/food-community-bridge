let audioCtx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Call once on the first user gesture so autoplay-blocked browsers allow later sounds to play. */
export function primeNotificationAudio() {
  if (unlocked) return;
  const ctx = getContext();
  if (!ctx) return;
  ctx
    .resume()
    .then(() => {
      unlocked = true;
    })
    .catch(() => {});
}

/** Plays a short two-tone chime for a new donation or notification. No-ops quietly if audio isn't available or allowed yet. */
export function playNotificationSound() {
  const ctx = getContext();
  if (!ctx) return;

  const chime = () => {
    const now = ctx.currentTime;
    [660, 880].forEach((freq, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      const start = now + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(chime).catch(() => {});
  } else {
    chime();
  }
}
