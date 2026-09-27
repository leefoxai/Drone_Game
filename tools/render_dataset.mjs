#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT=process.cwd();
const LOCAL_DATA=path.resolve(ROOT,'local_data');
const PORT=4173;
const URL=`http://127.0.0.1:${PORT}/render.html`;

function fail(message){console.error(`ERROR: ${message}`);process.exit(1);}
function insideLocalData(value){const resolved=path.resolve(value);return resolved===LOCAL_DATA||resolved.startsWith(LOCAL_DATA+path.sep);}
function csv(value){if(value===null||value===undefined)return '';const text=String(value);return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitServer(url,timeoutMs=20000){const started=Date.now();while(Date.now()-started<timeoutMs){try{const r=await fetch(url);if(r.ok)return;}catch{}await sleep(200);}throw new Error(`Vite server did not start: ${url}`);}

const args=process.argv.slice(2);if(!args[0])fail('usage: node tools/render_dataset.mjs local_data/.../lap.jsonl.gz [output_dir]');
const source=path.resolve(args[0]);if(!insideLocalData(source))fail('source recording must be under local_data/');if(!existsSync(source))fail(`recording not found: ${source}`);
const base=path.basename(source).replace(/\.jsonl\.gz$/,'').replace(/^lap_/, '');
const output=path.resolve(args[1]??path.join(LOCAL_DATA,'m3','renders',base));if(!insideLocalData(output))fail('output must be under local_data/');
if(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0)fail('ffmpeg is required to encode MP4. Install ffmpeg and retry.');

await mkdir(output,{recursive:true});const temp=path.join(output,'.frames');await rm(temp,{recursive:true,force:true});await mkdir(temp,{recursive:true});
let server=null,browser=null;
try{
  server=spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev','--','--host','127.0.0.1','--port',String(PORT)],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
  let serverErr='';server.stderr.on('data',chunk=>serverErr+=String(chunk));
  await waitServer(URL).catch(error=>{throw new Error(`${error.message}\n${serverErr}`)});
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:1});await page.goto(URL);
  const bytes=await readFile(source),base64=bytes.toString('base64');
  const loaded=await page.evaluate(async value=>window.m3Render.load(value),base64);
  if(loaded.trainingUse!=='flight_method')throw new Error(`M3 BC renderer requires flight_method, got ${loaded.trainingUse}`);
  if(!loaded.consent.granted||!loaded.consent.scope.includes('local_bc_training'))throw new Error('recording is not consented for local_bc_training');
  const labels=[];const imageHashes=[];
  for(let i=0;i<loaded.frameCount;i++){
    const label=await page.evaluate(async index=>window.m3Render.frame(index),i);labels.push(label);
    const target=path.join(temp,`frame_${String(i).padStart(6,'0')}.png`);const shot=await page.locator('#scene').screenshot({path:target,type:'png'});imageHashes.push(createHash('sha256').update(shot).digest('hex'));
    if(i%120===0||i===loaded.frameCount-1)process.stdout.write(`\rrender ${i+1}/${loaded.frameCount}`);
  }
  process.stdout.write('\n');
  const header=['frame_index','frame_time_s','physics_tick','state_index','next_gate_index','assist_target_vx','assist_target_vz','assist_target_vertical','assist_target_yaw_rate'];
  const csvRows=[header.join(',')];for(const v of labels)csvRows.push([v.frameIndex,v.frameTimeS.toFixed(9),v.simulationTick,v.stateIndex,v.nextGateIndex,v.assistTargetVx,v.assistTargetVz,v.assistTargetVertical,v.assistTargetYawRate].map(csv).join(','));
  const labelsPath=path.join(output,'frame_labels.csv');await writeFile(labelsPath,csvRows.join('\n')+'\n','utf8');
  const planHash=createHash('sha256').update(JSON.stringify(labels)).digest('hex');const frameHash=createHash('sha256').update(imageHashes.join('\n')).digest('hex');
  const manifest={recordingId:loaded.recordingId,schemaVersion:loaded.schemaVersion,trackId:loaded.trackId,partitionKey:loaded.partitionKey,trainingUse:loaded.trainingUse,consent:loaded.consent,source:path.relative(ROOT,source).replaceAll('\\','/'),render:{cameraMode:'fpv',width:640,height:360,fps:30,verticalFovDeg:75,fpvTiltDeg:15,hud:false},seconds:loaded.seconds,frameCount:loaded.frameCount,planSha256:planHash,framesSha256:frameHash,labels:'frame_labels.csv',video:'flight.mp4'};
  await writeFile(path.join(output,'render_manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  const mp4=path.join(output,'flight.mp4');const ff=spawnSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',path.join(temp,'frame_%06d.png'),'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',mp4],{stdio:'inherit'});if(ff.status!==0)throw new Error('ffmpeg encode failed');
  console.log(JSON.stringify({output:path.relative(ROOT,output).replaceAll('\\','/'),frameCount:loaded.frameCount,planSha256:planHash,framesSha256:frameHash},null,2));
}finally{
  if(browser)await browser.close().catch(()=>{});if(server&&!server.killed){server.kill();if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{stdio:'ignore'});}await rm(temp,{recursive:true,force:true});
}
