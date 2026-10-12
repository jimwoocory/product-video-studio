import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.UX_R0_PORT||3195);
const allowed=new Map([
  ["/","index.html"],["/index.html","index.html"],
  ["/app.js","app.js"],["/styles.css","styles.css"]
]);
const mime={
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8"
};
const server=http.createServer(async(req,res)=>{
  const path=(req.url||"/").split("?")[0];
  const file=allowed.get(path);
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Security-Policy","default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
  if(!file){res.writeHead(404);res.end("Not found");return;}
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405,{"Allow":"GET, HEAD"});res.end("Read-only preview");return;}
  try{
    const ext=file.slice(file.lastIndexOf("."));
    const contents=await readFile(join(root,file));
    res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream","Content-Length":contents.length});
    res.end(req.method==="HEAD"?undefined:contents);
  }catch(e){res.writeHead(500);res.end("Preview file unavailable");}
});
server.listen(port,"127.0.0.1",()=>{
  console.log("PVS UX-R0 原型预览（仅本机静态页面）：http://127.0.0.1:"+port+"/");
});
