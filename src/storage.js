const KEY = "padanam:v2";
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayKey = () => fmt(new Date());
export const addDays = (key, n) => { const d = new Date(key + "T00:00:00"); d.setDate(d.getDate() + n); return fmt(d); };

export const EMPTY = { profile: null, completed: {}, vocab: [], activity: {}, pin: "" };

export function loadLocal() {
  try { const v = localStorage.getItem(KEY); return v ? { ...EMPTY, ...JSON.parse(v) } : { ...EMPTY }; }
  catch (_) { return { ...EMPTY }; }
}
export function saveLocal(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }

let saveTimer = null;
export async function cloudLoad(pin) {
  try { const r = await fetch(`/api/state?pin=${encodeURIComponent(pin)}`); return await r.json(); }
  catch (_) { return { enabled: false }; }
}
export function cloudSave(pin, state) {
  clearTimeout(saveTimer); // debounce: one write per burst of changes
  saveTimer = setTimeout(() => {
    fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, state }) }).catch(() => {});
  }, 1500);
}

export function computeStreak(activity) {
  let n = 0, k = todayKey();
  if (!activity[k]) k = addDays(k, -1);
  while (activity[k]) { n += 1; k = addDays(k, -1); }
  return n;
}
