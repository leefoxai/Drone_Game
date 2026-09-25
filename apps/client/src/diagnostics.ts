import type { Track } from '../../../packages/physics/src/track';
import type { Input, State } from '../../../packages/physics/src/index';
const RAD_TO_DEG=180/Math.PI;
export class Diagnostics {
  samples: {target:number[];actual:number[];throttle:number;thrust:number}[]=[];
  constructor(private rateCanvas:HTMLCanvasElement,private thrustCanvas:HTMLCanvasElement,private map:HTMLCanvasElement){}
  sample(s:State,input:Input,maxThrust:number) {
    this.samples.push({target:s.targetOmega.map(v=>v*RAD_TO_DEG),actual:s.omega.map(v=>v*RAD_TO_DEG),throttle:input.throttle*100,thrust:s.thrustN/maxThrust*100});
    if(this.samples.length>180)this.samples.shift();
  }
  reset(){this.samples=[];}
  draw(axis:number,s:State,nextGate:number,track:Track) {
    const graph=(canvas:HTMLCanvasElement,series:number[][],min:number,max:number)=>{
      const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
      ctx.font='11px monospace';ctx.fillStyle='#8faab8';ctx.fillText(String(Math.round(max)),2,11);ctx.fillText(String(Math.round(min)),2,h-2);
      ctx.strokeStyle='#3a505a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(25,h*max/(max-min));ctx.lineTo(w,h*max/(max-min));ctx.stroke();
      series.forEach((values,i)=>{ctx.strokeStyle=i?'#ffa96b':'#6adad0';ctx.lineWidth=2;ctx.beginPath();values.forEach((v,j)=>{const x=28+j*(w-30)/179,y=h-4-(v-min)/(max-min)*(h-8);if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});
    };
    const maximum=Math.max(360,...this.samples.flatMap(v=>[Math.abs(v.actual[axis]!),Math.abs(v.target[axis]!) ]));
    graph(this.rateCanvas,[this.samples.map(v=>v.target[axis]!),this.samples.map(v=>v.actual[axis]!)],-maximum,maximum);
    graph(this.thrustCanvas,[this.samples.map(v=>v.throttle),this.samples.map(v=>v.thrust)],0,100);
    const ctx=this.map.getContext('2d')!;ctx.clearRect(0,0,220,160);ctx.font='10px sans-serif';ctx.fillStyle='#b3c9ce';ctx.fillText(`${track.label} / 위에서 보기`,12,16);
    const xs=track.gates.map(g=>g.center[0]),zs=track.gates.map(g=>g.center[2]);
    const minX=Math.min(...xs,-2),maxX=Math.max(...xs,2),minZ=Math.min(...zs,-2),maxZ=Math.max(...zs,2);
    const scale=Math.min(160/Math.max(1,maxX-minX),105/Math.max(1,maxZ-minZ));
    const xy=(x:number,z:number):[number,number]=>[30+(x-minX)*scale,135-(z-minZ)*scale];
    ctx.strokeStyle='#729183';ctx.setLineDash([3,4]);ctx.beginPath();track.gates.forEach((g,i)=>{const [x,y]=xy(g.center[0],g.center[2]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    track.gates.forEach((g,i)=>{const [x,y]=xy(g.center[0],g.center[2]);ctx.fillStyle=i===nextGate?'#ffc47b':'#69c9bd';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),x+7,y-4);});
    const [x,y]=xy(s.position[0],s.position[2]);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
  }
}
