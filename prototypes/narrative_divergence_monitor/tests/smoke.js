const http=require('http');
const {spawn}=require('child_process');
const s=spawn('node',['apps/api/server.js'],{stdio:'ignore'});
setTimeout(()=>{http.get('http://localhost:8790/health',(r)=>{if(r.statusCode!==200)process.exit(1);s.kill();console.log('smoke ok');});},400);
