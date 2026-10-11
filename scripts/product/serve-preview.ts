/** Isolated production preview: no real Gemini request or credentials. */
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=resolve('dist'),types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.bin':'application/octet-stream'};
createServer((req,res)=>{
 if(req.url==='/api/gemini-status'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({configured:false}));return;}
 if(req.url?.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Optional cloud service unavailable in isolated preview'}));return;}
 let path:string;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url??'/', 'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
 if(!path.startsWith(root+'/')&&path!==root){res.writeHead(403);res.end();return;}
 if(!existsSync(path)||statSync(path).isDirectory())path=resolve(root,'index.html');
 res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(path));
}).listen(4173,'127.0.0.1',()=>console.log('Isolated production preview: http://127.0.0.1:4173'));
