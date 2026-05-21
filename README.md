# SillyTavern RAG + World State Bridge

Connects SillyTavern to a NestJS backend that exposes:

- `POST /sillytavern/rag/retrieve`
- `GET /sillytavern/world-state/:sessionId`
- `POST /sillytavern/turn/complete`

## Install

In SillyTavern:

1. Open **Extensions**.
2. Click **Install Extension**.
3. Paste your repository URL.

## What it does

- On `Ctrl+Enter` or `Cmd+Enter`, it fetches RAG context and world state, then prepends a block into the input box.
- It tries to send completed turns to your backend using `/sillytavern/turn/complete`.
- Adds a `/ragctx` slash command (when slash command APIs are available in your ST build).
- Includes a debug panel with last request/response and latency.

## Settings

In extension settings panel:

- **Backend URL**: e.g. `http://localhost:3000/api/v1`
- **Top K**: number of chunks to retrieve
- **Session Prefix**: prefix for generated `sessionId`
- **World ID**: backend world profile id for bootstrap
- **World ID (Current Chat)**: per-chat override; if set, this chat uses its own world
- **Auto turn complete**: send completed turn payloads automatically
- **Auto bootstrap session**: initialize session with selected world before retrieval
- **Debug logs**: console diagnostics

## Debug panel

The extension renders **RAG Bridge Debug** in extension settings. When `Debug logs` is enabled, it shows:

- Last endpoint called
- HTTP status and latency
- Last request JSON
- Last response JSON

## Session ID strategy

Default generated value:

`<sessionPrefix><chat_id>`

Example:

`st-chat-12345`

## Backend payload for turn complete

```json
{
  "sessionId": "st-chat-12345",
  "sceneId": "scene-1716232023000",
  "userMessage": "Can we trust them?",
  "assistantMessage": "They agreed to a temporary truce."
}
```

## Notes

- If your SillyTavern build uses different events, adapt the listeners in `index.js`.
- This extension is intentionally small and easy to customize.
