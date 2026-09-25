import type { Vec3 } from './index';
import { PHYSICS_HZ } from './index';
import { TRAINING_TRACK, gatePassed } from './track';
import type { Track } from './track';

interface Ranking { bestSeconds: number | null; laps: number }

export class Race {
  nextGate=0;
  startTick:number|null=null;
  valid=true;
  lastSeconds:number|null=null;
  private partition='default';
  private rankings=new Map<string, Ranking>();
  constructor(public track:Track=TRAINING_TRACK, partition='default'){this.partition=partition;}
  private ranking():Ranking {
    let value=this.rankings.get(this.partition);
    if(!value){value={bestSeconds:null,laps:0};this.rankings.set(this.partition,value);}
    return value;
  }
  get bestSeconds():number|null{return this.ranking().bestSeconds;}
  get laps():number{return this.ranking().laps;}
  get gateCount():number{return this.track.gates.length;}
  setContext(track:Track, partition:string){this.track=track;this.partition=partition;this.reset();}
  reset(){this.nextGate=0;this.startTick=null;this.valid=true;this.lastSeconds=null;}
  invalidate(){this.valid=false;}
  update(from:Vec3,to:Vec3,tick:number,active:boolean):boolean {
    if(this.startTick===null && active)this.startTick=tick-1;
    if(this.startTick===null||!gatePassed(from,to,this.track.gates[this.nextGate]!))return false;
    this.nextGate++;
    if(this.nextGate<this.track.gates.length)return false;
    this.lastSeconds=(tick-this.startTick)/PHYSICS_HZ;
    if(this.valid){
      const ranking=this.ranking();
      ranking.bestSeconds=Math.min(ranking.bestSeconds??Infinity,this.lastSeconds);ranking.laps++;
    }
    this.nextGate=0;this.startTick=tick;
    return true;
  }
  elapsed(tick:number):number {return this.startTick===null?0:(tick-this.startTick)/PHYSICS_HZ;}
}
