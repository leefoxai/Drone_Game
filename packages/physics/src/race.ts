import type { Vec3 } from './index';
import { PHYSICS_HZ } from './index';
import { GATES, gatePassed } from './track';
export class Race {
  nextGate=0; startTick:number|null=null; valid=true; bestSeconds:number|null=null; lastSeconds:number|null=null; laps=0;
  reset(){this.nextGate=0;this.startTick=null;this.valid=true;}
  invalidate(){this.valid=false;}
  update(from:Vec3,to:Vec3,tick:number,active:boolean):boolean {
    if(this.startTick===null && active)this.startTick=tick-1;
    if(this.startTick===null||!gatePassed(from,to,GATES[this.nextGate]!))return false;
    this.nextGate++;
    if(this.nextGate<GATES.length)return false;
    this.lastSeconds=(tick-this.startTick)/PHYSICS_HZ;
    if(this.valid){this.bestSeconds=Math.min(this.bestSeconds??Infinity,this.lastSeconds);this.laps++;}
    this.nextGate=0;this.startTick=tick;return true;
  }
  elapsed(tick:number):number {return this.startTick===null?0:(tick-this.startTick)/PHYSICS_HZ;}
}
