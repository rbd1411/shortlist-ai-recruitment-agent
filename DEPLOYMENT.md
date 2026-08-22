# Deploy ShortlistAI

ShortlistAI is a standard Node.js web service. The server reads the host-provided `PORT` environment variable and exposes a health endpoint at `/api/health`.

## Check the production build locally

```powershell
npm ci
npm test
npm start
```

Open [http://localhost:3210/api/health](http://localhost:3210/api/health). A successful JSON response confirms that the server is ready.

## Option 1: Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then run these commands from this directory:

```powershell
docker build -t shortlist-ai .
docker run --rm -p 3210:3210 shortlist-ai
```

To enable optional model enrichment, pass the key at runtime instead of copying it into the image:

```powershell
docker run --rm -p 3210:3210 -e OPENAI_API_KEY="your_key" -e OPENAI_MODEL="gpt-5.4-mini" shortlist-ai
```

## Option 2: Render or Railway

Create a web service from the GitHub repository and use:

| Setting | Value |
|---|---|
| Root directory | Leave blank (repository root) |
| Runtime | Node.js 22 or Docker |
| Install/build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check | `/api/health` |

Add these environment variables in the hosting dashboard:

| Variable | Required? | Value |
|---|---:|---|
| `OPENAI_API_KEY` | No | Secret API key for optional narrative enrichment |
| `OPENAI_MODEL` | No | A model available to the API project |
| `PORT` | Usually no | Let the hosting provider supply this value |

The app remains usable in deterministic demo mode without an OpenAI key.

## Production checklist

Before processing real resumes, add authentication, access control, encrypted storage, retention/deletion rules, audit logs, rate limiting, CSRF protection, malware scanning, monitoring, accessibility testing, and jurisdiction-specific employment/legal review. Uploaded files are held only in memory in this demo, so large uploads and horizontal scaling also need design work.
