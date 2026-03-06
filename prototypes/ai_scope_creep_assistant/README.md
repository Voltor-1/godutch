# AI Scope Creep Assistant (Prototype)

Local-first prototype to detect likely scope creep in pasted Slack threads and draft a change-order summary.

## Run

```bash
npm install
npm run dev
```

App runs on http://localhost:8787

## API
- `POST /api/analyze` -> classify messages against baseline scope
- `POST /api/draft` -> draft change-order markdown from accepted items

## Notes
- Heuristic-first classifier (no external API required)
- Storage is local JSON files for prototype speed
