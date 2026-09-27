#!/usr/bin/env node
import { chromium, firefox, webkit } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT=process.cwd(),LOCAL_DATA=path.resolve(ROOT,'local_data'),PORT=4174,URL=`http://127.0.0.1:${PORT}/resim.html`;
function insideLocalData(value){const p=path.resolve(value);return p===LOCAL_DATA||p.startsWith(LOCAL_DATA+path.sep);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function waitServer(){const start=Date.now();while(Date.now()-start<20000){try{const r=await fetch(URL);if(r.ok)return;}catch{}await sleep(200);}throw new Error('Vite server did not start');}
const source=path.resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('usage: node tools/browser_resim.mjs local_data/.../lap.jsonl.gz [output.json]');if(!insideLocalData(source)||!existsSync(source))throw new Error('recording must exist under local_data/');
const output=path.resolve(process.argv[3]??path.join(LOCAL_DATA,'m3','benchmarks',`browser_resim_${path.basename(source).replace('.jsonl.gz','')}.json`));if(!insideLocalData(output))throw new Error('output must be under local_data/');
const base64=(await readFile(source)).toString('base64');const server=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev','--','--host','127.0.0.1','--port',String(PORT)],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
try{
  await waitServer();const results={source:path.relative(ROOT,source).replaceAll('\\','/'),browsers:{}};
  for(const [name,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
    let browser=null;
    try{browser=await type.launch({headless:true});const page=await browser.newPage();await page.goto(URL);const metric=await page.evaluate(async value=>window.m3Resim.run(value),base64);const storage=await page.evaluate(async()=>window.m3Resim.storageEstimate());results.browsers[name]={status:'ok',...metric,storage};}
    catch(error){results.browsers[name]={status:'unavailable_or_failed',error:error instanceof Error?error.message:String(error)};}
    finally{if(browser)await browser.close().catch(()=>{});}
  }
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{server.kill();if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{stdio:'ignore'});}
