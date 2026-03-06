const http = require('http');
const fs = require('fs');
const path = require('path');

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
  });
}

function scoreMessage(text, baseline) {
  const t = (text || '').toLowerCase();
  const base = (baseline || '').toLowerCase();
  const requestSignals = ['add', 'also', 'can you', 'include', 'build', 'new', 'extra', 'another'];
  const scopeTokens = base.split(/\W+/).filter(Boolean);
  const hasRequest = requestSignals.some(s => t.includes(s));
  const overlap = scopeTokens.filter(tok => tok.length > 3 && t.includes(tok)).length;

  if (hasRequest && overlap <= 1) return { label: 'likely_out_of_scope', confidence: 0.78, rationale: 'New request language with low scope overlap.' };
  if (hasRequest && overlap > 1) return { label: 'unclear', confidence: 0.56, rationale: 'Request language present but overlaps existing scope.' };
  return { label: 'in_scope', confidence: 0.72, rationale: 'No strong new-request signal detected.' };
}

function draftChangeOrder(project, items) {
  const additions = items.map((it, i) => `${i+1}. ${it.text}`).join('\n');
  return `# Change Order Draft\n\n## Project\n${project || 'Unnamed Project'}\n\n## Requested Additions\n${additions || 'None'}\n\n## Assumptions\n- Final effort estimate pending technical review\n- Priority and dependencies to be confirmed\n\n## Timeline Impact\n- Placeholder: +X days\n\n## Cost Placeholder\n- Placeholder: €X,XXX\n\n## Client-Facing Summary\nThanks for the additional requests. We reviewed the items and identified the above additions as outside the current baseline scope. Please confirm approval so we can issue an updated timeline and cost addendum.`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  if (req.method === 'POST' && req.url === '/api/analyze') {
    try {
      const { baselineScope, messages = [] } = await parseJson(req);
      const assessments = messages.map((m, idx) => ({ id: idx + 1, text: m, ...scoreMessage(m, baselineScope) }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ assessments }, null, 2));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bad request', detail: e.message }));
    }
  }

  if (req.method === 'POST' && req.url === '/api/draft') {
    try {
      const { projectName, acceptedItems = [] } = await parseJson(req);
      const markdown = draftChangeOrder(projectName, acceptedItems);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ markdown }, null, 2));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bad request', detail: e.message }));
    }
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const file = path.join(__dirname, '..', 'web', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(file, 'utf8'));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const port = process.env.PORT || 8787;
server.listen(port, () => console.log(`api listening on http://localhost:${port}`));
