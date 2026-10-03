import { useEffect, useRef, useState } from "react";
import { say, listen, stopSpeaking, unlockAudio, canListen, hasMalayalamVoice } from "./speech.js";
import { loadLocal, saveLocal, cloudLoad, cloudSave, todayKey, addDays, EMPTY, computeStreak } from "./storage.js";
import { CURRICULUM, LEVELS, LEVEL_ML, askClaude, parseJSON, placementSystem, EVAL_SYSTEM, evalPrompt, lessonSystem, talkSystem, similar } from "./tutor.js";

const SRS_GAP = [0, 1, 3, 7, 14, 30];
const PLACEMENT_TURNS = 5;
const GOALS = [
  ["work", "ജോലിക്ക്", ["work", "job", "office", "career"]],
  ["travel", "യാത്രയ്ക്ക്", ["travel", "trip", "abroad", "visit"]],
  ["exam", "പരീക്ഷയ്ക്ക് (IELTS/OET)", ["exam", "ielts", "oet", "test"]],
  ["daily", "ദിവസേന സംസാരിക്കാൻ", ["daily", "conversation", "talk", "speak", "everyday"]],
];

/* ── UI pieces ───────────────────────────────────────────────── */
const MicIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>;
const WaveIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h1M8 8v8M12 5v14M16 8v8M20 11v2" /></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" /></svg>;

function Orb({ status, onTap }) {
  const label = {
    idle: "മൈക്കിൽ തൊട്ട് സംസാരിക്കൂ",
    speaking: "കേൾക്കൂ… (തൊട്ടാൽ നിർത്താം)",
    listening: "പറയൂ… Speak in English",
    thinking: "ആലോചിക്കുന്നു…",
  }[status];
  return (
    <div className="orbwrap">
      <button className={"orb " + status} onClick={onTap} aria-label={label}>
        {status === "speaking" ? <WaveIcon /> : status === "thinking" ? <DotsIcon /> : <MicIcon />}
      </button>
      <div className="orblabel">{label}</div>
    </div>
  );
}

function Bubble({ m }) {
  if (m.role === "user") return <div className="bubble me">{m.text}</div>;
  const d = m.data || {};
  return (
    <div className="bubble tutor">
      {(d.corrections || []).map((c, i) => (
        <div key={i} className="fix">
          <div className="en"><s>{c.original}</s> → <b>{c.corrected}</b></div>
          {c.whyMl && <div className="ml muted">{c.whyMl}</div>}
        </div>
      ))}
      {d.sayMl && <div className="ml">{d.sayMl}</div>}
      {d.sayEn && <div className="en green">{d.repeatAfterMe ? "🔁 " : ""}{d.sayEn}</div>}
      {(d.newWords || []).map((w, i) => (
        <div key={i} className="newword"><span className="en">{w.en}</span> — <span className="ml">{w.ml}</span></div>
      ))}
    </div>
  );
}

/* history → Anthropic messages (must start with user, alternate roles) */
function toApi(hist) {
  let msgs = hist.map((m) => (m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: JSON.stringify(m.data) }));
  msgs = msgs.slice(-14);
  if (!msgs.length || msgs[0].role === "assistant") msgs.unshift({ role: "user", content: "Start now." });
  return msgs;
}

/* ── root ────────────────────────────────────────────────────── */
export default function App() {
  const [state, setState] = useState(loadLocal);
  const [phase, setPhase] = useState(() => (loadLocal().profile && loadLocal().profile.level ? "home" : "welcome"));
  const [status, setStatus] = useState("idle");
  const [msgs, setMsgs] = useState([]);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState("");
  const [lessonIdx, setLessonIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [mlVoice, setMlVoice] = useState(true);
  const [pinInput, setPinInput] = useState("");

  const session = useRef(0); // bump to cancel whatever is running
  const histRef = useRef([]);
  const cfgRef = useRef(null);
  const resumeRef = useRef(null);
  const stateRef = useRef(state);
  const endRef = useRef(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, interim, status, pending]);
  useEffect(() => { const t = setTimeout(() => setMlVoice(hasMalayalamVoice()), 1000); return () => clearTimeout(t); }, []);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(t); } }, [notice]);

  function update(fn) {
    setState((prev) => {
      const next = fn(prev);
      saveLocal(next);
      if (next.pin) cloudSave(next.pin, next);
      return next;
    });
  }
  const bumpActivity = (s) => ({ ...s.activity, [todayKey()]: (s.activity[todayKey()] || 0) + 1 });
  function addWords(words) {
    if (!words || !words.length) return;
    update((s) => {
      const have = new Set(s.vocab.map((v) => v.en.toLowerCase()));
      const add = words.filter((w) => w && w.en && !have.has(w.en.toLowerCase())).map((w) => ({ en: w.en, ml: w.ml || "", box: 0, due: todayKey() }));
      return add.length ? { ...s, vocab: [...s.vocab, ...add] } : s;
    });
  }

  function push(m) { histRef.current = [...histRef.current, m]; setMsgs(histRef.current); }
  function resetTranscript() { histRef.current = []; setMsgs([]); }
  function cancel() { session.current += 1; stopSpeaking(); setStatus("idle"); setInterim(""); }

  async function speakTurn(d, id) {
    setStatus("speaking");
    if (d.sayMl) await say(d.sayMl, "ml");
    if (id !== session.current) return false;
    if (d.sayEn) await say(d.sayEn, "en");
    return id === session.current;
  }
  async function hear(id) {
    if (!canListen()) {
      setNotice("ഈ ബ്രൗസറിൽ വോയ്‌സ് ഇൻപുട്ട് ഇല്ല. Android-ൽ Chrome, iPhone-ൽ Safari ഉപയോഗിക്കൂ.");
      setStatus("idle");
      return null;
    }
    setStatus("listening");
    setInterim("");
    const t = await listen({ onInterim: setInterim });
    setInterim("");
    if (id !== session.current) return null;
    if (!t) setStatus("idle"); // silence: wait for a tap
    return t;
  }

  /* ── the conversation engine used by test, lessons and talk ── */
  async function drive(id, speakFirst) {
    const cfg = cfgRef.current;
    while (id === session.current) {
      const hist = histRef.current;
      const last = hist[hist.length - 1];
      if (!last || last.role === "user") {
        const turns = hist.filter((m) => m.role === "user").length;
        if (cfg.maxTurns && turns >= cfg.maxTurns) { await cfg.onDone(toApi(hist), id); return; }
        setStatus("thinking");
        let d;
        try { d = parseJSON(await askClaude(cfg.system(turns), toApi(hist))); }
        catch (e) {
          if (!last) { setNotice("സെർവറുമായി ബന്ധപ്പെടാനായില്ല: " + e.message); setStatus("idle"); resumeRef.current = () => drive(++session.current, true); return; }
          d = { sayMl: "ക്ഷമിക്കണം, ഒന്നുകൂടി പറയാമോ?", sayEn: "Could you say that again?" };
        }
        if (id !== session.current) return;
        push({ role: "assistant", data: d });
        const stop = cfg.onTurn ? await cfg.onTurn(d, id) : false;
        if (stop) { await speakTurn(d, id); if (id === session.current) setStatus("idle"); return; }
        speakFirst = true;
        continue;
      }
      if (speakFirst && !(await speakTurn(last.data, id))) return;
      speakFirst = true;
      const heard = await hear(id);
      if (!heard) return;
      push({ role: "user", text: heard });
    }
  }
  function startConversation(cfg) {
    cfgRef.current = cfg;
    resetTranscript();
    resumeRef.current = () => drive(++session.current, false);
    drive(++session.current, true);
  }

  function onOrbTap() {
    unlockAudio();
    if (status === "speaking") { stopSpeaking(); return; }
    if (status !== "idle") return;
    if (resumeRef.current) resumeRef.current();
  }

  /* ── onboarding by voice ─────────────────────────────────── */
  async function askName() {
    const id = ++session.current;
    setPending(null);
    const d = { sayMl: "നമസ്കാരം! ഞാൻ നിങ്ങളുടെ ഇംഗ്ലീഷ് ടീച്ചറാണ്. നിങ്ങളുടെ പേര് ഇംഗ്ലീഷിൽ പറയൂ.", sayEn: "What is your name?" };
    push({ role: "assistant", data: d });
    const run = async (speak) => {
      if (speak && !(await speakTurn(d, id))) return;
      const heard = await hear(id);
      if (!heard) return;
      push({ role: "user", text: heard });
      const m = heard.match(/(?:my name is|name is|i am|i'm|this is|call me)\s+([a-z]+)/i);
      const w = (m ? m[1] : heard.split(/\s+/).pop()).replace(/[^a-zA-Z]/g, "");
      const name = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      push({ role: "assistant", data: { sayMl: `${name}, അല്ലേ?` } });
      setStatus("idle");
      setPending({ type: "name", name });
      say(`${name}?`, "en");
    };
    resumeRef.current = () => run(false);
    run(true);
  }
  function startOnboarding() {
    unlockAudio();
    cancel();
    resetTranscript();
    setPhase("onboard");
    askName();
  }
  function askGoal(name) {
    const id = ++session.current;
    setPending(null);
    const d = { sayMl: `${name}, കണ്ടതിൽ സന്തോഷം! ഇംഗ്ലീഷ് പഠിക്കുന്നത് എന്തിനാണ്? ജോലിക്കോ, യാത്രയ്ക്കോ, പരീക്ഷയ്ക്കോ, അതോ ദിവസേന സംസാരിക്കാനോ?`, sayEn: "Why are you learning English? Work, travel, exams, or daily conversation?" };
    push({ role: "assistant", data: d });
    const run = async (speak) => {
      if (speak && !(await speakTurn(d, id))) return;
      const heard = await hear(id);
      if (!heard) { setPending({ type: "goal", name }); return; }
      push({ role: "user", text: heard });
      const low = heard.toLowerCase();
      const g = GOALS.find(([, , kws]) => kws.some((k) => low.includes(k)));
      setStatus("idle");
      if (g) finishOnboarding(name, g[0]);
      else setPending({ type: "goal", name });
    };
    resumeRef.current = () => run(false);
    run(true);
  }
  function finishOnboarding(name, goal) {
    setPending(null);
    update((s) => ({ ...s, profile: { name, goal, createdAt: todayKey() } }));
    startPlacement({ name, goal });
  }

  /* ── placement test ──────────────────────────────────────── */
  function startPlacement(profile) {
    setPhase("placement");
    startConversation({
      system: () => placementSystem(profile),
      maxTurns: PLACEMENT_TURNS,
      onDone: async (apiMsgs, id) => {
        setStatus("thinking");
        const transcript = apiMsgs.map((m) => {
          if (m.role === "user") return "STUDENT: " + m.content;
          try { return "TUTOR: " + (JSON.parse(m.content).sayEn || ""); } catch { return ""; }
        }).join("\n");
        let r;
        try {
          r = parseJSON(await askClaude(EVAL_SYSTEM, [{ role: "user", content: evalPrompt(transcript) }]));
          if (!LEVELS.includes(r.level)) r.level = "A1";
        } catch {
          r = { level: "A1", summaryMl: "നമുക്ക് അടിസ്ഥാനത്തിൽ നിന്ന് തുടങ്ങാം. ഓരോ ദിവസവും മെച്ചപ്പെടും.", strengths: [], weaknesses: [] };
        }
        if (id !== session.current) return;
        update((s) => ({ ...s, profile: { ...s.profile, ...r }, activity: bumpActivity(s) }));
        setResult(r);
        setPhase("result");
        resumeRef.current = null;
        await speakTurn({ sayMl: `നിങ്ങളുടെ ലെവൽ ${r.level}. ${r.summaryMl}`, sayEn: `Your level is ${r.level}. Let's start learning!` }, id);
        if (id === session.current) setStatus("idle");
      },
    });
  }

  /* ── structured lesson ───────────────────────────────────── */
  function startLesson(idx) {
    const profile = stateRef.current.profile;
    const topic = CURRICULUM[profile.level][idx];
    const key = `${profile.level}-${idx}`;
    setLessonIdx(idx);
    setPhase("lesson");
    startConversation({
      system: (turns) => lessonSystem(profile, topic, turns),
      onTurn: (d) => {
        addWords(d.newWords);
        if (d.lessonComplete) {
          update((s) => ({ ...s, completed: { ...s.completed, [key]: { date: todayKey() } }, activity: bumpActivity(s) }));
          setPending({ type: "lessonDone", idx });
          return true;
        }
        return false;
      },
    });
  }

  /* ── daily conversation ──────────────────────────────────── */
  function startTalk() {
    const profile = stateRef.current.profile;
    setPhase("talk");
    let counted = false;
    startConversation({
      system: () => talkSystem(profile),
      onTurn: (d) => {
        addWords(d.newWords);
        if (!counted && histRef.current.some((m) => m.role === "user")) { counted = true; update((s) => ({ ...s, activity: bumpActivity(s) })); }
        return false;
      },
    });
  }

  /* ── spoken vocabulary review ────────────────────────────── */
  function startVocab() {
    cancel();
    resetTranscript();
    setPhase("vocab");
    const id = ++session.current;
    const due = stateRef.current.vocab.filter((v) => v.due <= todayKey()).slice(0, 10);
    if (!due.length) {
      const d = { sayMl: "ഇന്ന് പരിശീലിക്കാൻ വാക്കുകളില്ല. പാഠങ്ങളും സംഭാഷണങ്ങളും പുതിയ വാക്കുകൾ ചേർക്കും.", sayEn: "No words to review today." };
      push({ role: "assistant", data: d });
      resumeRef.current = null;
      speakTurn(d, id).then(() => id === session.current && setStatus("idle"));
      return;
    }
    let i = 0, right = 0;
    const run = async (speak) => {
      while (id === session.current && i < due.length) {
        const card = due[i];
        const ask = { sayMl: `${card.ml}. ഇത് ഇംഗ്ലീഷിൽ എങ്ങനെ പറയും?`, sayEn: mlVoice ? "" : "Say this in English." };
        if (speak) { push({ role: "assistant", data: { sayMl: ask.sayMl } }); if (!(await speakTurn(ask, id))) return; }
        speak = true;
        const heard = await hear(id);
        if (!heard) return;
        push({ role: "user", text: heard });
        const ok = similar(heard, card.en) >= 0.6;
        if (ok) right += 1;
        update((s) => ({
          ...s,
          vocab: s.vocab.map((v) => {
            if (v.en !== card.en) return v;
            const box = ok ? Math.min(v.box + 1, SRS_GAP.length - 1) : 0;
            return { ...v, box, due: addDays(todayKey(), SRS_GAP[box] || 1) };
          }),
          activity: bumpActivity(s),
        }));
        const fb = ok ? { sayMl: "ശരി!", sayEn: card.en } : { sayMl: "ശരിയായ ഉത്തരം കേൾക്കൂ.", sayEn: card.en, corrections: [{ original: heard, corrected: card.en }] };
        push({ role: "assistant", data: fb });
        if (!(await speakTurn(fb, id))) return;
        i += 1;
      }
      if (id !== session.current) return;
      const d = { sayMl: `${due.length}-ൽ ${right} ശരി. നന്നായി!`, sayEn: "Review complete. Well done!" };
      push({ role: "assistant", data: d });
      resumeRef.current = null;
      await speakTurn(d, id);
      if (id === session.current) setStatus("idle");
    };
    resumeRef.current = () => run(false);
    run(true);
  }

  /* ── cross-device sync ───────────────────────────────────── */
  async function linkPin() {
    const pin = pinInput;
    const r = await cloudLoad(pin);
    if (!r.enabled) { setNotice("ക്ലൗഡ് സിങ്ക് ഈ സെർവറിൽ ഓണല്ല. README-യിലെ 'Optional' ഭാഗം കാണുക."); return; }
    if (r.state && r.state.profile) { update(() => ({ ...EMPTY, ...r.state, pin })); setNotice("പഴയ പുരോഗതി ലഭിച്ചു!"); }
    else { update((s) => ({ ...s, pin })); setNotice("സിങ്ക് ഓണായി. മറ്റ് ഉപകരണങ്ങളിൽ ഇതേ PIN നൽകൂ."); }
    setPinInput("");
  }

  const goHome = () => { cancel(); resumeRef.current = null; setPending(null); resetTranscript(); setPhase("home"); };
  const { profile } = state;
  const toast = notice && <div className="toast" role="status" onClick={() => setNotice("")}>{notice}</div>;

  /* ── screens ─────────────────────────────────────────────── */
  if (phase === "welcome" || (phase === "home" && !(profile && profile.level))) {
    return (
      <div className="app center">
        <div className="eyebrow">പഠനം · English by voice</div>
        <h1>നമസ്കാരം!<br />സംസാരിച്ച് ഇംഗ്ലീഷ് പഠിക്കാം.</h1>
        <p className="ml muted">ടൈപ്പ് ചെയ്യേണ്ട. ഞാൻ മലയാളത്തിൽ സംസാരിക്കും, നിങ്ങൾ ഇംഗ്ലീഷിൽ മറുപടി പറയും. മൈക്ക് അനുമതി ചോദിക്കുമ്പോൾ Allow അമർത്തൂ.</p>
        {!mlVoice && <p className="ml warn">ഈ ഫോണിൽ മലയാളം ശബ്ദമില്ല (iPhone-ൽ സാധാരണം). മലയാളം സ്ക്രീനിൽ കാണാം; ഇംഗ്ലീഷ് ശബ്ദത്തിൽ കേൾക്കാം.</p>}
        {!canListen() && <p className="ml warn">ഈ ബ്രൗസറിൽ വോയ്‌സ് ഇൻപുട്ട് ഇല്ല. Android-ൽ Chrome, iPhone-ൽ Safari ഉപയോഗിക്കൂ.</p>}
        <button className="btn big" onClick={startOnboarding}>🎙 തുടങ്ങാം</button>
        {toast}
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="app center">
        <div className="eyebrow">പരീക്ഷ പൂർത്തിയായി</div>
        <h1>നിങ്ങളുടെ ലെവൽ: <span className="green">{result.level}</span></h1>
        <p className="ml muted">{LEVEL_ML[result.level]}</p>
        <p className="ml">{result.summaryMl}</p>
        {(result.weaknesses || []).length > 0 && <p className="ml muted">ശ്രദ്ധിക്കേണ്ടത്: {result.weaknesses.join(", ")}</p>}
        <button className="btn big" onClick={goHome}>പഠനം തുടങ്ങാം</button>
      </div>
    );
  }

  if (phase === "home") {
    const units = CURRICULUM[profile.level];
    const doneAt = (L, i) => !!state.completed[`${L}-${i}`];
    const firstOpen = units.findIndex((_, i) => !doneAt(profile.level, i));
    const nextIdx = firstOpen === -1 ? 0 : firstOpen;
    const due = state.vocab.filter((v) => v.due <= todayKey()).length;
    const doneCount = units.filter((_, i) => doneAt(profile.level, i)).length;
    const canLevelUp = doneCount === units.length && profile.level !== "B2";
    return (
      <div className="app">
        <div className="pad">
          <div className="eyebrow">{profile.name} · {profile.level} {LEVEL_ML[profile.level]}</div>
          <h1>ഇന്ന് എന്ത് ചെയ്യാം?</h1>
          <div className="stats">
            <div className="stat"><b>{computeStreak(state.activity)}</b><span>ദിവസം തുടർച്ചയായി</span></div>
            <div className="stat"><b>{doneCount}/{units.length}</b><span>പാഠങ്ങൾ</span></div>
            <div className="stat"><b>{state.vocab.length}</b><span>വാക്കുകൾ</span></div>
          </div>
          {canLevelUp && (
            <button className="btn" onClick={() => update((s) => ({ ...s, profile: { ...s.profile, level: LEVELS[LEVELS.indexOf(s.profile.level) + 1] } }))}>
              🎉 അടുത്ത ലെവലിലേക്ക്: {LEVELS[LEVELS.indexOf(profile.level) + 1]}
            </button>
          )}
          <button className="card" onClick={() => startLesson(nextIdx)}>
            <small>{firstOpen === -1 ? "എല്ലാ പാഠങ്ങളും കഴിഞ്ഞു · ആവർത്തിക്കാം" : `ഇന്നത്തെ പാഠം · ${nextIdx + 1}/${units.length}`}</small>
            <div className="en big">{units[nextIdx]}</div>
            <small className="green">🎙 സംസാരിച്ച് പഠിക്കാം</small>
          </button>
          <button className="card gold" onClick={startTalk}>
            <small>ദിവസേനയുള്ള സംസാരം</small>
            <div className="ml big">ഇന്നത്തെ ദിവസത്തെക്കുറിച്ച് ഇംഗ്ലീഷിൽ പറയൂ</div>
          </button>
          <button className="card coral" onClick={startVocab}>
            <small>വാക്കുകൾ</small>
            <div className="ml big">{due ? `${due} വാക്കുകൾ ഇന്ന് ഓർത്തെടുക്കാം` : "ഇന്ന് പരിശീലിക്കാൻ വാക്കുകളില്ല"}</div>
          </button>
          <details className="more">
            <summary>എല്ലാ പാഠങ്ങൾ · പുരോഗതി · സിങ്ക്</summary>
            <div className="list">
              {units.map((u, i) => (
                <button key={i} className="row" onClick={() => startLesson(i)}>
                  <span className={"tick" + (doneAt(profile.level, i) ? " on" : "")} />
                  <span className="en">{i + 1}. {u}</span>
                </button>
              ))}
            </div>
            <div className="list">
              {LEVELS.map((L) => {
                const n = CURRICULUM[L].filter((_, i) => doneAt(L, i)).length;
                return (
                  <div key={L} className="row">
                    <span className="pill">{L}</span>
                    <span className="bar"><span style={{ width: `${(n / CURRICULUM[L].length) * 100}%` }} /></span>
                    <span className="muted">{n}/{CURRICULUM[L].length}</span>
                  </div>
                );
              })}
            </div>
            <div className="sync">
              <div className="ml">മറ്റ് ഫോണിലും കമ്പ്യൂട്ടറിലും ഇതേ പുരോഗതി കാണാൻ ഒരു PIN{state.pin ? ` (ഇപ്പോൾ: ${state.pin})` : ""}:</div>
              <div className="rowin">
                <input inputMode="numeric" maxLength={8} placeholder="4–8 അക്കങ്ങൾ" value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))} />
                <button className="btn small" disabled={pinInput.length < 4} onClick={linkPin}>ബന്ധിപ്പിക്കൂ</button>
              </div>
            </div>
            <button className="btn ghost" onClick={() => { update((s) => ({ ...s, profile: { ...s.profile, level: undefined } })); startPlacement(profile); }}>ലെവൽ പരീക്ഷ വീണ്ടും</button>
            <button className="btn ghost danger" onClick={() => { if (window.confirm("എല്ലാ പുരോഗതിയും മായ്ക്കണോ?")) { update(() => ({ ...EMPTY })); setPhase("welcome"); } }}>പുതുതായി തുടങ്ങുക</button>
          </details>
        </div>
        {toast}
      </div>
    );
  }

  /* session screens: onboard / placement / lesson / talk / vocab */
  const title = { onboard: "പരിചയപ്പെടാം", placement: "ലെവൽ പരീക്ഷ", lesson: profile && profile.level ? CURRICULUM[profile.level][lessonIdx] : "", talk: "സംസാരിക്കാം", vocab: "വാക്കുകൾ" }[phase];
  const answered = msgs.filter((m) => m.role === "user").length;
  return (
    <div className="app session">
      <header>
        {phase !== "onboard" && phase !== "placement" && <button className="back" onClick={goHome} aria-label="Back">‹</button>}
        <div>
          <div className="eyebrow">{phase === "lesson" ? `പാഠം ${lessonIdx + 1} · ${profile.level}` : phase === "placement" ? `ചോദ്യം ${Math.min(answered + 1, PLACEMENT_TURNS)}/${PLACEMENT_TURNS}` : "🎙"}</div>
          <h2 className={phase === "lesson" ? "en" : "ml"}>{title}</h2>
        </div>
        {phase === "placement" && <div className="progress"><span style={{ width: `${(answered / PLACEMENT_TURNS) * 100}%` }} /></div>}
      </header>
      <div className="transcript">
        {msgs.map((m, i) => <Bubble key={i} m={m} />)}
        {interim && <div className="bubble me dim">{interim}</div>}
        {pending && pending.type === "name" && (
          <div className="choices">
            <button className="btn" onClick={() => askGoal(pending.name)}>അതെ, {pending.name}</button>
            <button className="btn ghost" onClick={askName}>വീണ്ടും പറയാം</button>
          </div>
        )}
        {pending && pending.type === "goal" && (
          <div className="choices">
            {GOALS.map(([k, ml]) => <button key={k} className="btn ghost" onClick={() => { cancel(); finishOnboarding(pending.name, k); }}>{ml}</button>)}
          </div>
        )}
        {pending && pending.type === "lessonDone" && (
          <div className="choices">
            {pending.idx + 1 < CURRICULUM[profile.level].length && (
              <button className="btn" onClick={() => { setPending(null); startLesson(pending.idx + 1); }}>അടുത്ത പാഠം →</button>
            )}
            <button className="btn ghost" onClick={goHome}>ഹോമിലേക്ക്</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!(pending && pending.type === "lessonDone") && <Orb status={status} onTap={onOrbTap} />}
      {toast}
    </div>
  );
}
