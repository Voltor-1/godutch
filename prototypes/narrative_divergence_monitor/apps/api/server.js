const http = require('http');
const fs = require('fs');
const path = require('path');

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}

function sign(v){ return v>0?1:v<0?-1:0; }
function scoreDivergence(market=[], narrative=[]) {
  const n = Math.min(market.length, narrative.length);
  const points = [];
  for (let i=0;i<n;i++) {
    const m = Number(market[i].value || 0);
    const t = Number(narrative[i].value || 0);
    const divergence = Math.abs(m - t);
    points.push({
      t: market[i].t || narrative[i].t || `t${i+1}`,
      market: m,
      narrative: t,
      divergence,
      alert: sign(m) !== sign(t) && divergence >= 0.4
    });
  }
  return points;
}

const server = http.createServer(async (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.end();

  if (req.method==='GET' && (req.url==='/' || req.url==='/index.html')) {
    const file = path.join(__dirname,'..','web','index.html');
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(fs.readFileSync(file,'utf8'));
  }

  if (req.method==='GET' && req.url==='/api/sample') {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','sample','demo.json'),'utf8'));
    const points = scoreDivergence(data.market, data.narrative);
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({points},null,2));
  }

  if (req.method==='POST' && req.url==='/api/analyze') {
    try {
      const body = await parseJson(req);
      const points = scoreDivergence(body.market||[], body.narrative||[]);
      res.writeHead(200, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({points},null,2));
    } catch(e) {
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'bad request', detail:e.message}));
    }
  }

  if (req.method==='GET' && req.url==='/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true}));
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not found'}));
});

const port = process.env.PORT || 8790;
server.listen(port, ()=>console.log(`narrative monitor on http://localhost:${port}`));
