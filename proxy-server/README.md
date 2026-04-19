# AI Doc Agent Proxy Server (Render)

This server keeps `OPENAI_API_KEY` on backend and exposes a safe proxy endpoint for the extension.

## Endpoints

- `GET /health`
- `POST /api/parse-dictation`

### POST body

```json
{
  "transcript": "Жалобы ...",
  "workflowStep": "collecting_dictation",
  "patient": {
    "fullName": "Иванов Артем",
    "diagnosis": "ДЦП, G80.1",
    "age": "8"
  }
}
```

### Auth

If `CLIENT_SHARED_TOKEN` is set, extension must send header:

`x-client-token: <token>`

## Local run

```bash
cd ai-doc-agent/proxy-server
npm install
# copy .env.example -> .env and fill values
npm start
```

## Render deploy

1. Push repo to GitHub.
2. In Render create a new Web Service.
3. Root directory: `ai-doc-agent/proxy-server`.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Set environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
   - `CLIENT_SHARED_TOKEN` (recommended)
   - `ALLOWED_ORIGINS` (optional comma-separated)

After deploy copy URL like:
`https://ai-doc-agent-proxy.onrender.com`

Paste it in extension popup field `Render proxy URL`.
