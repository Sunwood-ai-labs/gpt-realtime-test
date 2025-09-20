# Voice Agent - Realtime demo

A tiny Node.js + Express demo that serves a WebRTC-based realtime "voice agent" client (`index.html`). It issues ephemeral tokens via `/token` and tells the OpenAI Realtime model to call a Hugging Face-hosted MCP tool for current Japan Standard Time.

## What this repo contains

- `index.html` – client-only demo that asks for an API key and creates a WebRTC session with the realtime model.
- `frontend.html` – server-backed demo that fetches `/token` before creating the WebRTC session.
- `server.js` – Express server that serves static files and proxies the ephemeral token creation request.
- `package.json` – minimal manifest (`npm start`, dependencies: `express`, `dotenv`).

## Requirements

- Node.js (18+ recommended)
- npm
- An OpenAI API key with access to the Realtime API

## Quick start

1. Install dependencies

    ```cmd
    npm install
    ```

2. Provide configuration via environment variables

    Create a `.env` file (the server uses `dotenv`) with at least:

    ```
    OPENAI_API_KEY=sk-REPLACE_WITH_YOUR_KEY
    MCP_SERVER_URL=https://makiai-get-time-mcp.hf.space/gradio_api/mcp/
    MCP_SERVER_LABEL=hf-get-time
    MCP_REQUIRE_APPROVAL=never
    ```

    `MCP_SERVER_URL` points the realtime session at the Hugging Face MCP endpoint `MakiAi/get-time-mcp`, which exposes the `get_time_mcp_get_jp_time` tool.

3. Start the server

    ```cmd
    npm start
    ```

    Browse to http://localhost:3000 or go directly to http://localhost:3000/frontend.html to begin a realtime session.

## How it works

- The browser demo requests `/token` from this server.
- `server.js` forwards a POST to `https://api.openai.com/v1/realtime/client_secrets` using `OPENAI_API_KEY` and returns the ephemeral token JSON.
- The session payload advertises the Hugging Face MCP tool using `MCP_SERVER_URL`. When the model decides it needs the current JST, it calls `get_time_mcp_get_jp_time` remotely.

## Verifying the MCP configuration (optional)

Use `curl.exe` (PowerShell) to confirm that the Hugging Face endpoint responds with the Streamable HTTP handshake:

```powershell
$body = @{ jsonrpc = "2.0"; id = 1; method = "initialize"; params = @{ protocolVersion = "2025-03-26"; clientInfo = @{ name = "curl"; version = "0.1" }; capabilities = @{} } } | ConvertTo-Json -Compress

curl.exe -i `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  -X POST $env:MCP_SERVER_URL `
  --data $body
```

A `200 OK` with `Content-Type: text/event-stream` and a `mcp-session-id` header indicates the remote MCP server is reachable.

## Troubleshooting

- `/token` fails or returns 401/403 – verify `OPENAI_API_KEY` has Realtime access and is present in the environment.
- Realtime session connects but tool calls do nothing – confirm `MCP_SERVER_URL` is a public URL reachable from OpenAI (e.g., test with the `curl.exe` command above).
- Need to call additional tools – host them on an MCP-compatible service and update the environment variables accordingly before restarting the server.

## Security notes

- Never commit real API keys; keep `.env` out of source control.
- Host `server.js` behind HTTPS if you deploy it externally.
- Ephemeral tokens should only flow to clients you trust.
