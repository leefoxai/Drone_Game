import type { FullLapRecording } from './recording';
import { decodeRecording, encodeRecording } from './recording-codec';

const DB_NAME='drone-recordings';
const DB_VERSION=1;
const STORE='laps';

export interface StoredLapSummary {
  recordingId:string;
  createdAtUtc:string;
  trackId:string;
  partitionKey:string;
  seconds:number|null;
  outcome:FullLapRecording['metadata']['outcome']['status'];
  trainingUse:FullLapRecording['metadata']['trainingUse'];
  testerMode:boolean;
  publicLeaderboardEligible:boolean;
  compressedBytes:number;
  uncompressedBytes:number;
}
interface StoredLapRow extends StoredLapSummary { blob:Blob }

function request<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function transactionDone(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open(DB_NAME,DB_VERSION);
    open.onupgradeneeded=()=>{
      const database=open.result;
      if(!database.objectStoreNames.contains(STORE)){
        const store=database.createObjectStore(STORE,{keyPath:'recordingId'});
        store.createIndex('trackId','trackId',{unique:false});
        store.createIndex('partitionKey','partitionKey',{unique:false});
        store.createIndex('createdAtUtc','createdAtUtc',{unique:false});
      }
    };
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
}

export async function saveRecording(recording:FullLapRecording):Promise<StoredLapSummary>{
  const encoded=await encodeRecording(recording);
  const row:StoredLapRow={
    recordingId:recording.metadata.recordingId,createdAtUtc:recording.metadata.createdAtUtc,trackId:recording.metadata.trackId,partitionKey:recording.metadata.partitionKey,
    seconds:recording.metadata.outcome.seconds,outcome:recording.metadata.outcome.status,trainingUse:recording.metadata.trainingUse,testerMode:recording.metadata.testerMode,
    publicLeaderboardEligible:recording.metadata.publicLeaderboardEligible,compressedBytes:encoded.compressedBytes,uncompressedBytes:encoded.uncompressedBytes,
    blob:new Blob([encoded.bytes],{type:'application/gzip'}),
  };
  const database=await db(),tx=database.transaction(STORE,'readwrite'),done=transactionDone(tx);tx.objectStore(STORE).put(row);await done;database.close();
  const {blob:_,...summary}=row;return summary;
}
export async function listRecordings():Promise<StoredLapSummary[]>{
  const database=await db(),tx=database.transaction(STORE,'readonly'),done=transactionDone(tx);const rows=await request(tx.objectStore(STORE).getAll()) as StoredLapRow[];await done;database.close();
  return rows.map(({blob:_,...summary})=>summary).sort((a,b)=>b.createdAtUtc.localeCompare(a.createdAtUtc));
}
export async function loadRecording(recordingId:string):Promise<FullLapRecording|null>{
  const database=await db(),tx=database.transaction(STORE,'readonly'),done=transactionDone(tx);const row=await request(tx.objectStore(STORE).get(recordingId)) as StoredLapRow|undefined;await done;database.close();return row?decodeRecording(row.blob):null;
}
export async function loadRecordingBlob(recordingId:string):Promise<Blob|null>{
  const database=await db(),tx=database.transaction(STORE,'readonly'),done=transactionDone(tx);const row=await request(tx.objectStore(STORE).get(recordingId)) as StoredLapRow|undefined;await done;database.close();return row?.blob??null;
}
export async function deleteRecording(recordingId:string):Promise<void>{
  const database=await db(),tx=database.transaction(STORE,'readwrite'),done=transactionDone(tx);tx.objectStore(STORE).delete(recordingId);await done;database.close();
}
export async function bestRecording(partitionKey:string):Promise<FullLapRecording|null>{
  const all=await listRecordings();const best=all.filter(v=>v.partitionKey===partitionKey&&v.outcome==='complete'&&v.seconds!==null).sort((a,b)=>(a.seconds??Infinity)-(b.seconds??Infinity))[0];
  return best?loadRecording(best.recordingId):null;
}
export async function clearRecordingsForTests():Promise<void>{
  const database=await db(),tx=database.transaction(STORE,'readwrite'),done=transactionDone(tx);tx.objectStore(STORE).clear();await done;database.close();
}
