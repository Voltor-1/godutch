# GoDutch Frontend

Web frontend for the GoDutch bill splitting service.

## Development

Install dependencies:
```
npm install
```

Start the dev server (proxies API calls to local Worker on port 8787):
```
npm run dev
```

## Environment variables

Copy `.env.example` to `.env.local` and set `VITE_API_BASE` to your Worker URL.

## Build
```
npm run build
```

Output goes to `../dist-frontend/`. Deploy to Cloudflare Pages.

## Architecture

- `src/main.ts` — hash-based router
- `src/api.ts` — typed API client for all 11 endpoints
- `src/store.ts` — in-memory state and localStorage helpers
- `src/polling.ts` — Page Visibility API aware polling manager
- `src/screens/home.ts` — session creation
- `src/screens/session.ts` — main shared session view
- `src/screens/finalized.ts` — locked read-only summary
- `src/components/joinModal.ts` — guest join flow
- `src/components/addItemModal.ts` — add bill item
