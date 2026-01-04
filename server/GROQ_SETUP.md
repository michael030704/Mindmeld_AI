Groq API setup

1) Create a project and get an API key at: https://console.groq.com/

2) Add these env vars to `server/.env` (do NOT paste keys into chat):

GROQ_API_KEY=your_groq_api_key_here
GROQ_API_URL=https://api.groq.com/v1/generate  # replace with the exact endpoint shown in Groq console
AI_PROVIDER=groq

3) Restart the server:

```bash
cd server
npm run dev
```

4) The server proxy will forward requests from `/api/ai` to your Groq endpoint and return the provider response (or a local fallback on upstream errors).

Notes:
- The server sends the request body as JSON: `{ prompt, messages, model, maxTokens }`.
- If your Groq endpoint expects a different payload shape, update `server/index.js` accordingly.
- Keep keys secret and rotate immediately if exposed.
