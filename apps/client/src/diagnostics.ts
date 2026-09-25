import type { Input, State } from '../../../packages/physics/src/index';
export class Diagnostics {
  constructor(private rateCanvas:HTMLCanvasElement,private thrustCanvas:HTMLCanvasElement,private map:HTMLCanvasElement){}
  sample(_s:State,_input:Input,_maxThrust:number):void{}
  reset():void{}
  draw(_axis:number,_s:State,_nextGate:number):void{for(const canvas of [this.rateCanvas,this.thrustCanvas,this.map])canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);}
}
