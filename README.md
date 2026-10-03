# പഠനം — English by voice, for Malayalam speakers

A voice-first English tutor. The tutor speaks Malayalam; the learner answers in English by speaking. No typing.

- **Voice onboarding** – asks your name and goal out loud.
- **Spoken level test** – 5 adaptive questions, then a CEFR level (A1–B2) with strengths and weak spots.
- **32 structured lessons** (8 per level), taught as conversation: explain in Malayalam → repeat-after-me phrases → use them in your own sentences.
- **Daily conversation** – free talk about your day with gentle corrections shown on screen.
- **Spoken vocabulary review** – the tutor says a Malayalam meaning, you say the English; spaced repetition.
- Streaks, progress per level, level-up, and optional sync across devices.

Speech recognition and voices come from the phone's browser. Claude does the teaching through a small server
function, so your API key never reaches the browser.

## Deploy (about 10 minutes, free hosting)

1. **Create a GitHub repository** (e.g. `padanam`). On the repo page choose *Add file → Upload files*, drag in the
   *contents* of this folder (not the zip itself), and commit.
2. **Go to https://vercel.com/new**, sign in with GitHub, and import the repository. Vercel detects Vite; leave the
   settings as they are.
3. Before clicking Deploy, open **Environment Variables** and add
   `ANTHROPIC_API_KEY` = your key. Then **Deploy**.
4. Open the `https://….vercel.app` link on your phone. Allow the microphone. Tap **🎙 തുടങ്ങാം**.
5. Add it to the home screen: iPhone Safari → Share → *Add to Home Screen*; Android Chrome → ⋮ → *Add to Home screen*.

Every future push to GitHub redeploys automatically.

## Optional: same progress on every phone and computer

Progress is saved on each device by default. To sync:

1. In your Vercel project open **Storage → Create → Upstash (Redis)**, free plan, and connect it to the project.
2. **Redeploy** (Deployments → ⋯ → Redeploy).
3. In the app: home screen → *എല്ലാ പാഠങ്ങൾ · പുരോഗതി · സിങ്ക്* → enter a 4–8 digit PIN → ബന്ധിപ്പിക്കൂ.
4. On another device, enter the same PIN to continue where you left off.

The PIN is a convenience, not a password — pick one that isn't obvious.

## How to use it

- The big round button shows what's happening: green = tap to speak, gold = tutor speaking (tap to skip),
  red = listening, grey = thinking.
- The conversation flows hands-free. If you stay silent, it pauses; tap the button to answer.
- Corrections appear in red, new words in yellow, and are added to your word review automatically.

## Voices on each phone

- **Android (Chrome):** Malayalam and English voices are built in. If Malayalam isn't spoken, install it:
  Settings → *Text-to-speech* → Google engine → *Install voice data* → Malayalam.
- **iPhone (Safari):** iOS has no Malayalam voice. The app detects this — Malayalam appears on screen and English
  is spoken aloud.
- Speech recognition needs internet and works best in Chrome on Android and Safari on iPhone.

## Costs

Each tutor reply is one Claude API call (Sonnet). A 10-minute session is typically a few US cents.
Change the model with an optional `MODEL` environment variable in Vercel.

## Run locally

```
npm install
npm i -g vercel
vercel dev        # runs the app plus /api functions; put ANTHROPIC_API_KEY in a .env file
```

## Files

- `src/App.jsx` — screens and the voice conversation engine
- `src/speech.js` — speech recognition and text-to-speech
- `src/tutor.js` — curriculum and tutor prompts
- `src/storage.js` — on-device save and optional sync
- `api/chat.js` — server proxy to Claude (holds the key)
- `api/state.js` — optional progress sync
