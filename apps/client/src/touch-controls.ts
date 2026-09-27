import type { Input } from '../../../packages/physics/src/index';

export interface TouchAxes {
  leftX:number;
  leftY:number;
  rightX:number;
  rightY:number;
}

const clamp=(value:number)=>Math.max(-1,Math.min(1,value));
const negate=(value:number)=>value===0?0:-value;
function deadzone(value:number,zone=.045){
  const magnitude=Math.abs(value);
  if(magnitude<=zone)return 0;
  return Math.sign(value)*(magnitude-zone)/(1-zone);
}

/**
 * Dual-stick mapping for Easy mode.
 * left: vertical speed + yaw, right: forward/back + lateral velocity.
 */
export function touchInputFromAxes(value:TouchAxes):Input {
  const leftX=deadzone(clamp(value.leftX)),leftY=deadzone(clamp(value.leftY));
  const rightX=deadzone(clamp(value.rightX)),rightY=deadzone(clamp(value.rightY));
  return {
    throttle:Math.max(0,Math.min(1,.5+leftY*.5)),
    roll:negate(rightX),
    pitch:negate(rightY),
    yaw:negate(leftX),
  };
}

type Side='left'|'right';
interface StickState { pointerId:number|null; x:number; y:number }

export class TouchControls {
  private readonly states:Record<Side,StickState>={
    left:{pointerId:null,x:0,y:0},
    right:{pointerId:null,x:0,y:0},
  };
  private readonly sticks:Record<Side,HTMLElement>;
  private readonly thumbs:Record<Side,HTMLElement>;

  constructor(private readonly root:HTMLElement){
    this.sticks={left:root.querySelector<HTMLElement>('[data-stick="left"]')!,right:root.querySelector<HTMLElement>('[data-stick="right"]')!};
    this.thumbs={left:root.querySelector<HTMLElement>('[data-thumb="left"]')!,right:root.querySelector<HTMLElement>('[data-thumb="right"]')!};
    this.bind('left');this.bind('right');
  }

  setVisible(visible:boolean){this.root.hidden=!visible;if(!visible)this.reset();}
  get visible(){return !this.root.hidden;}
  get axes():TouchAxes{return {leftX:this.states.left.x,leftY:this.states.left.y,rightX:this.states.right.x,rightY:this.states.right.y};}
  get rawAxes(){const v=this.axes;return [v.leftX,v.leftY,v.rightX,v.rightY];}
  input(){return touchInputFromAxes(this.axes);}

  reset(){
    for(const side of ['left','right'] as const){const state=this.states[side];state.pointerId=null;state.x=0;state.y=0;this.paint(side);}
  }

  private bind(side:Side){
    const stick=this.sticks[side],state=this.states[side];
    const end=(event:PointerEvent)=>{
      if(state.pointerId!==event.pointerId)return;
      state.pointerId=null;state.x=0;state.y=0;this.paint(side);
      if(stick.hasPointerCapture(event.pointerId))stick.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };
    stick.addEventListener('pointerdown',event=>{
      if(state.pointerId!==null)return;
      state.pointerId=event.pointerId;stick.setPointerCapture(event.pointerId);this.update(side,event);event.preventDefault();
    });
    stick.addEventListener('pointermove',event=>{if(state.pointerId===event.pointerId){this.update(side,event);event.preventDefault();}});
    stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);stick.addEventListener('lostpointercapture',event=>{
      if(state.pointerId===event.pointerId){state.pointerId=null;state.x=0;state.y=0;this.paint(side);}
    });
    stick.addEventListener('contextmenu',event=>event.preventDefault());
  }

  private update(side:Side,event:PointerEvent){
    const rect=this.sticks[side].getBoundingClientRect();
    const radius=Math.max(1,Math.min(rect.width,rect.height)*.39);
    let x=(event.clientX-(rect.left+rect.width/2))/radius;
    let y=((rect.top+rect.height/2)-event.clientY)/radius;
    const magnitude=Math.hypot(x,y);if(magnitude>1){x/=magnitude;y/=magnitude;}
    this.states[side].x=clamp(x);this.states[side].y=clamp(y);this.paint(side);
  }

  private paint(side:Side){
    const state=this.states[side],stick=this.sticks[side];
    const radius=Math.max(1,Math.min(stick.clientWidth,stick.clientHeight)*.28);
    this.thumbs[side].style.setProperty('--touch-x',`${state.x*radius}px`);
    this.thumbs[side].style.setProperty('--touch-y',`${-state.y*radius}px`);
    stick.dataset.active=String(state.pointerId!==null);
  }
}
