import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

// This certificate is for local development only. To avoid a certificate
// warning use a certificate trusted by the browser/device instead.
const dir=resolve('.local-https'),key=resolve(dir,'key.pem'),cert=resolve(dir,'cert.pem');
mkdirSync(dir,{recursive:true,mode:0o700});
const ips=[...new Set(Object.values(networkInterfaces()).flat().filter(i=>i?.family==='IPv4'&&!i.internal).map(i=>i.address))];
const alternateNames=['DNS:localhost','IP:127.0.0.1',...ips.map(ip=>`IP:${ip}`)].join(',');
// Regenerate when the host's LAN addresses change.
let previous='';if(existsSync(cert))try{previous=execFileSync('openssl',['x509','-in',cert,'-noout','-ext','subjectAltName'],{encoding:'utf8',stdio:['ignore','pipe','ignore']})}catch{}
if(!existsSync(key)||!ips.every(ip=>previous.includes(`IP Address:${ip}`))||!previous.includes('DNS:localhost')){
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','365','-keyout',key,'-out',cert,'-subj','/CN=PeakMap local development','-addext',`subjectAltName=${alternateNames}`],{stdio:'ignore'});
}
console.log(`本机：https://localhost:4174/\n局域网：${ips.map(ip=>`https://${ip}:4174/`).join(' ')}\n使用自签名开发证书；浏览器会显示证书警告。`);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0','--port','4174','--strictPort'],{stdio:'inherit',env:{...process.env,PEAKMAP_HTTPS_CERT:cert,PEAKMAP_HTTPS_KEY:key}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>vite.kill(signal));
vite.on('exit',code=>process.exit(code??1));
