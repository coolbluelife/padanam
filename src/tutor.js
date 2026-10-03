// Curriculum, tutor prompts, API client.
export const CURRICULUM = {
  A1: ["Greetings and introducing yourself", "Numbers, days and telling the time", "Family and describing people", "Daily routine (present simple)", "Food and ordering at a restaurant", "Shopping and asking prices", "Asking for and giving directions", "Likes, dislikes and hobbies"],
  A2: ["Talking about yesterday (past simple)", "Making plans (going to / will)", "Describing places and your hometown", "At work: phone calls and short emails", "Health: visiting a doctor", "Travel: airport, bus and train", "Comparing things (comparatives)", "Giving simple opinions and reasons"],
  B1: ["Telling a story (past continuous)", "Life experiences (present perfect)", "Job interview questions", "Advice and conditionals (if / should)", "Complaints and solving problems politely", "Discussing news and current events", "Everyday phrasal verbs", "Formal and informal English"],
  B2: ["Agreeing, disagreeing and persuading", "Reported speech: what someone said", "Giving a presentation at work", "Idioms and shades of meaning", "Reading between the lines", "Speaking professionally on calls", "Passive voice and formal English", "Negotiating and reaching agreement"],
};
export const LEVELS = ["A1", "A2", "B1", "B2"];
export const LEVEL_ML = { A1: "തുടക്കക്കാരൻ", A2: "അടിസ്ഥാനം", B1: "ഇടത്തരം", B2: "ഉയർന്ന ഇടത്തരം" };

export async function askClaude(system, messages, max_tokens = 700) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "API error");
  return data.text;
}

export function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
}

const VOICE_RULES = `This is a VOICE-ONLY app. Everything you write is read aloud by text-to-speech, so:
- No lists, markdown, symbols, quotation marks or parentheses. Plain spoken sentences only.
- Keep it short: sayMl at most 2 sentences, sayEn at most 1 short sentence.
- sayMl is spoken by a Malayalam voice, sayEn by an English voice. Never mix scripts inside one field.
- Malayalam must be natural spoken Malayalam in Malayalam script.
- The student answers by speaking English and speech recognition may mishear words; be forgiving, and if unclear ask them to say it again.`;

const SHAPE = `Respond ONLY with JSON, no markdown:
{"sayMl":"Malayalam reaction or explanation","sayEn":"English question or phrase","repeatAfterMe":true|false,"corrections":[{"original":"what they said","corrected":"correct English","whyMl":"short Malayalam reason"}],"newWords":[{"en":"word or phrase","ml":"Malayalam meaning"}],"lessonComplete":false}`;

const who = (p) => `${p.name} is a native Malayalam speaker at CEFR ${p.level}, learning English for: ${p.goal}. Weak spots: ${(p.weaknesses || []).join(", ") || "unknown"}.`;

export function placementSystem(p) {
  return `You are a warm English tutor for a native Malayalam speaker named ${p.name}, running a short spoken placement test of exactly 5 questions.
${VOICE_RULES}
Ask ONE question per turn in sayEn. Start very easy (where they live, their work), then harder (daily routine, something from yesterday, an opinion with a reason). Adapt to the previous answer. Do not correct during the test. sayMl is only a brief friendly acknowledgement. corrections and newWords are empty arrays; repeatAfterMe is false.
${SHAPE}`;
}

export const EVAL_SYSTEM = "You are an expert CEFR assessor of spoken English. Respond ONLY with JSON, no markdown.";
export const evalPrompt = (t) => `Assess this Malayalam speaker's spoken English (from speech recognition, ignore transcription noise). Return {"level":"A1|A2|B1|B2","summaryMl":"2 short encouraging spoken-style sentences in Malayalam","strengths":["2 short items in Malayalam"],"weaknesses":["2 short items in Malayalam"]}\n\n${t}`;

export function lessonSystem(p, topic, turns) {
  return `You are ${p.name}'s English tutor. ${who(p)}
You are teaching a structured spoken lesson on: "${topic}". Student turns so far: ${turns}.
${VOICE_RULES}
Method, entirely through conversation:
1. First turn: in sayMl explain the key idea in one or two simple Malayalam sentences; in sayEn give the first key phrase with repeatAfterMe true.
2. Teach 4 to 5 key phrases, one per turn. After each repetition judge it from the transcript; if wrong, correct gently and ask again.
3. Then ask 3 to 4 questions (repeatAfterMe false) that make the student USE the phrases. Correct at most 2 mistakes per turn.
4. After about 9 to 11 student turns, set lessonComplete true with a warm Malayalam wrap-up and an English goodbye line.
Put each key phrase you teach in newWords (max 1 per turn).
${SHAPE}`;
}

export function talkSystem(p) {
  return `You are ${p.name}'s friendly English conversation partner. ${who(p)}
${VOICE_RULES}
Hold a real conversation about their day, work, family, Kerala, food and plans. sayMl reacts briefly in Malayalam and explains any correction. sayEn asks the next question at ${p.level} level. If they answered in Malayalam or got stuck, give the English version in sayEn with repeatAfterMe true. Correct at most 2 mistakes per turn, never harshly. Max 1 newWords item per turn. lessonComplete is always false.
${SHAPE}`;
}

export function similar(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 1;
  const wa = new Set(x.split(/\s+/)), wb = new Set(y.split(/\s+/));
  let hit = 0;
  wa.forEach((w) => wb.has(w) && hit++);
  return hit / Math.max(wa.size, wb.size);
}
