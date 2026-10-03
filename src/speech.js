// Speech in/out using the browser's built-in engines. No keys needed.
const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const canListen = () => !!SR;

let voicesCache = [];
function loadVoices() {
  if (!synth) return [];
  const v = synth.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

function pickVoice(prefix, prefer = []) {
  const match = loadVoices().filter((v) => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith(prefix));
  if (!match.length) return null;
  for (const n of prefer) { const hit = match.find((v) => v.name.toLowerCase().includes(n)); if (hit) return hit; }
  return match[0];
}
export const hasMalayalamVoice = () => !!pickVoice("ml");

/** Speak one utterance; resolves when finished. */
export function say(text, lang) {
  return new Promise((resolve) => {
    if (!synth || !text || !text.trim()) return resolve();
    const isMl = lang === "ml";
    const voice = isMl ? pickVoice("ml") : pickVoice("en-in", ["google", "rishi", "veena"]) || pickVoice("en-gb") || pickVoice("en");
    if (isMl && !voice) return resolve(); // no Malayalam voice: text stays on screen
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = isMl ? "ml-IN" : "en-IN";
    u.rate = isMl ? 0.95 : 0.85;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, Math.min(30000, 1500 + text.length * 90)); // some browsers drop onend
    synth.speak(u);
  });
}
export function stopSpeaking() { try { synth && synth.cancel(); } catch (_) {} }

/** Listen once for English speech. Resolves with transcript ("" on silence). */
export function listen({ onInterim, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    if (!SR) return resolve("");
    const r = new SR();
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let final = "", last = "", settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { r.stop(); } catch (_) {}
      resolve((final || last).trim()); // iOS sometimes never marks results final
    };
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " "; else interim += t;
      }
      last = (final + interim).trim();
      onInterim && onInterim(last);
    };
    r.onerror = finish;
    r.onend = finish;
    setTimeout(finish, timeoutMs);
    try { r.start(); } catch (_) { finish(); }
  });
}

/** iOS needs a user gesture before speech works; call on the first tap. */
export function unlockAudio() {
  if (!synth) return;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch (_) {}
}
