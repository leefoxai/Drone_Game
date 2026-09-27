import type { AssistTargets } from '../../../packages/physics/src/assist';

export interface BcLayer {
  activation:'relu'|'tanh'|'linear';
  weight:number[][];
  bias:number[];
}
export interface BcModelFile {
  format:'drone-bc-mlp-v1';
  input:{width:number;height:number;grayscale:true};
  output:{kind:'assist_targets';scales:[number,number,number,number]};
  layers:BcLayer[];
  training?:Record<string,unknown>;
}

function activate(value:number,kind:BcLayer['activation']):number{
  if(kind==='relu')return Math.max(0,value);
  if(kind==='tanh')return Math.tanh(value);
  return value;
}
function dense(input:number[],layer:BcLayer):number[]{
  if(layer.weight.length!==layer.bias.length)throw new Error('BC layer weight/bias shape mismatch');
  return layer.weight.map((row,i)=>{
    if(row.length!==input.length)throw new Error('BC layer input shape mismatch');
    let value=layer.bias[i]!;for(let j=0;j<input.length;j++)value+=row[j]!*input[j]!;
    return activate(value,layer.activation);
  });
}
function validate(model:BcModelFile){
  if(model.format!=='drone-bc-mlp-v1'||model.output.kind!=='assist_targets'||model.input.grayscale!==true)throw new Error('Unsupported BC model format');
  if(model.input.width!==64||model.input.height!==36)throw new Error('M3 BC model must use 64x36 grayscale input');
  if(!model.layers.length||model.layers.at(-1)!.bias.length!==4)throw new Error('M3 BC model must output 4 assist targets');
  if(model.output.scales.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Invalid BC output scale');
}

export class BcModel {
  private readonly scratch=document.createElement('canvas');
  private readonly ctx:CanvasRenderingContext2D;
  constructor(readonly file:BcModelFile){
    validate(file);this.scratch.width=file.input.width;this.scratch.height=file.input.height;
    const ctx=this.scratch.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('2D canvas unavailable');this.ctx=ctx;
  }
  predictCanvas(canvas:HTMLCanvasElement):AssistTargets{
    this.ctx.drawImage(canvas,0,0,this.scratch.width,this.scratch.height);
    const pixels=this.ctx.getImageData(0,0,this.scratch.width,this.scratch.height).data,input=new Array<number>(this.scratch.width*this.scratch.height);
    for(let i=0,p=0;i<pixels.length;i+=4,p++)input[p]=(0.299*pixels[i]!+0.587*pixels[i+1]!+0.114*pixels[i+2]!)/255;
    let value=input;for(const layer of this.file.layers)value=dense(value,layer);
    const scale=this.file.output.scales;
    return {horizontalVelocityWorldMps:[value[0]!*scale[0],value[1]!*scale[1]],verticalVelocityMps:value[2]!*scale[2],yawRateRadPerSec:value[3]!*scale[3]};
  }
}

export async function loadBcModel(file:File):Promise<BcModel>{
  const parsed=JSON.parse(await file.text()) as BcModelFile;return new BcModel(parsed);
}
