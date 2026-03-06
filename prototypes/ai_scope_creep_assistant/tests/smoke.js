const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');

const server = spawn('node', ['apps/api/server.js'], { stdio: 'ignore' });

setTimeout(() => {
  const req = http.request({ hostname: 'localhost', port: 8787, path: '/health', method: 'GET' }, (res) => {
    assert.strictEqual(res.statusCode, 200);
    server.kill();
    console.log('smoke ok');
  });
  req.on('error', (e) => { server.kill(); throw e; });
  req.end();
}, 400);
