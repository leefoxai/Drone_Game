import { decodeRecording } from './recording-codec';
import { resimulateRecording } from './recording';

declare global {
  interface Window {
    m3Resim?: {
      run(base64:string):Promise<{recordingId:string;schemaVersion:string;checkpoints:number;maxPositionErrorM:number;maxVelocityErrorMps:number;maxOrientationError:number;maxAngularVelocityErrorRadS:number}>;
      storageEstimate():Promise<StorageEstimate>;
    };
  }
}

function fromBase64(value:string):Uint8Array{
  const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}

window.m3Resim={
  async run(base64:string){
    const recording=await decodeRecording(fromBase64(base64));
    const result=resimulateRecording(recording);
    return {recordingId:recording.metadata.recordingId,schemaVersion:recording.metadata.schemaVersion,checkpoints:recording.recordedCheckpoints?.length??recording.states.length,maxPositionErrorM:result.maxPositionErrorM,maxVelocityErrorMps:result.maxVelocityErrorMps,maxOrientationError:result.maxOrientationError,maxAngularVelocityErrorRadS:result.maxAngularVelocityErrorRadS};
  },
  async storageEstimate(){return navigator.storage.estimate();},
};
