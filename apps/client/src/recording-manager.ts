import type { FullLapRecording } from './recording';
import { deleteRecording, listRecordings, loadRecording, loadRecordingBlob } from './recording-store';
import type { StoredLapSummary } from './recording-store';

const formatTime=(seconds:number|null)=>seconds===null?'—':`${seconds.toFixed(3)} s`;
const formatBytes=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;

export class RecordingManager {
  constructor(private container:HTMLElement,private onReplay:(recording:FullLapRecording)=>void){}
  async refresh(){
    const rows=await listRecordings();this.container.replaceChildren();
    if(!rows.length){const empty=document.createElement('p');empty.className='help';empty.textContent='저장된 랩이 없습니다.';this.container.append(empty);return;}
    for(const summary of rows)this.container.append(this.row(summary));
  }
  private row(summary:StoredLapSummary){
    const row=document.createElement('div');row.className='recording-row';row.dataset.recordingId=summary.recordingId;
    const text=document.createElement('div');text.innerHTML=`<strong>${summary.trackId}</strong><small>${formatTime(summary.seconds)} · ${summary.trainingUse} · ${summary.outcome}<br>${new Date(summary.createdAtUtc).toLocaleString()} · ${formatBytes(summary.compressedBytes)}</small>`;row.append(text);
    const actions=document.createElement('div');actions.className='recording-actions';
    const replay=document.createElement('button');replay.textContent='재생';replay.onclick=async()=>{const recording=await loadRecording(summary.recordingId);if(recording)this.onReplay(recording);};
    const exportButton=document.createElement('button');exportButton.textContent='내보내기';exportButton.onclick=async()=>{const blob=await loadRecordingBlob(summary.recordingId);if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`lap_${summary.recordingId}.jsonl.gz`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
    const remove=document.createElement('button');remove.textContent='삭제';remove.onclick=async()=>{await deleteRecording(summary.recordingId);await this.refresh();};
    actions.append(replay,exportButton,remove);row.append(actions);return row;
  }
}
