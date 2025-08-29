# Voice Agent — Realtime demo

A tiny Node.js + Express demo that serves a WebRTC-based realtime "voice agent" client (`index.html`) and exposes a protected `/token` endpoint (`server.js`) which requests ephemeral credentials from the OpenAI Realtime API.

## What this repo contains

- `index.html` — a browser demo that creates a WebRTC RTCPeerConnection and plays remote audio from the realtime model.
- `server.js` — an Express server that serves static files and implements `/token`, which forwards a session creation POST to OpenAI's realtime client_secrets endpoint.
- `package.json` — a minimal manifest (script: `npm start`, dependencies: `express`, `dotenv`).

## Requirements

- Node.js (recommended: 18+)
- npm
- An OpenAI API key with access to the Realtime API

## Quick start

1. Install dependencies

```cmd
npm install
```

2. Provide your OpenAI API key

This project reads `OPENAI_API_KEY` (or `API_KEY`) from the environment. The easiest approach is to create a `.env` file in the project root (the server uses `dotenv`):

```
# .env
OPENAI_API_KEY=sk-REPLACE_WITH_YOUR_KEY
```

Alternatively, for a single cmd.exe session you can set it temporarily with:

```cmd
set OPENAI_API_KEY=sk-REPLACE_WITH_YOUR_KEY
```

3. Start the server

```cmd
npm start
```

By default the server listens on http://localhost:3000. Open that URL in a chrome-based browser or Firefox to use the demo.

## How it works (high level)

- The browser (client) requests `/token` from this server.
- `server.js` forwards a POST to `https://api.openai.com/v1/realtime/client_secrets` using the server-side API key and returns the ephemeral token JSON to the client.
- The client uses that ephemeral token to POST an SDP offer to `https://api.openai.com/v1/realtime/calls?model=gpt-realtime` and receives an SDP answer to establish the WebRTC session.

## Important notes

- The server expects a valid OpenAI API key in `OPENAI_API_KEY` or `API_KEY`. If not set, `/token` will fail and a warning is logged when the server starts.
- Do not commit your real API key to source control. Use `.env` (and add it to `.gitignore`) or set the environment securely in your deployment environment.
- The example `sessionConfig` in `server.js` requests a realtime session for `gpt-realtime` and uses the `cedar` voice — edit it if you need different model/voice settings.

## Troubleshooting

- Server won't start: ensure dependencies installed and Node version is supported. Look for errors in the terminal where you ran `npm start`.
- `/token` returns 401/403: verify the API key has Realtime API access and is valid.
- Browser errors getting microphone: ensure you allow microphone access and serve the page over `http://localhost:3000` (browsers require secure contexts for some getUserMedia features; localhost is allowed).
- If the demo can't establish audio: open developer console and check the log panel in the page (`Log`) and the browser console for SDP / ICE errors.

## Security and deployment

- This server proxies requests to OpenAI using your secret key — keep it private. In production, host `server.js` behind HTTPS and restrict access as needed.
- Ephemeral tokens are short-lived; the client should never receive your long-lived server API key.

## Next steps / suggestions

- Add CORS and authentication if you plan to expose the `/token` endpoint publicly.
- Add a small integration test that calls `/token` with a mocked fetch to assert the server forwards session configuration correctly.
- Replace or enhance the client UI to show connection diagnostics and allow model/voice selection.

---

If you want, I can also:
- add a simple `.env.example` file, or
- update `.gitignore` to ensure `.env` is ignored, or
- include a minimal test that validates `/token` behavior using a mocked environment.

