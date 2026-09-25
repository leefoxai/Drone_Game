import { CHANNELS, STORAGE_KEY, defaultMapping, deviceKind, normalizeAxis, readGamepad, validMapping } from './input';
import type { Mapping } from './input';
const labels={throttle:'스로틀',roll:'롤',pitch:'피치',yaw:'요'};
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export class ControllerPanel {
  mapping=defaultMapping();
  private pad:Gamepad|null=null;
  private selectedId='';
  private signature='';
  private calibration:Mapping|null=null;
  private saved:Record<string,Mapping>=Object.create(null) as Record<string,Mapping>;
  constructor(private pause:(message:string)=>void) {
    try {const value=JSON.parse(localStorage.getItem(STORAGE_KEY)??'{}');if(value && typeof value==='object')for(const [id,m] of Object.entries(value))if(validMapping(m))this.saved[id]=m;}
    catch {el('input-feedback').textContent='저장 설정을 읽지 못해 기본 매핑을 사용합니다.';}
    this.drawMapping();
    el<HTMLSelectElement>('device').onchange=()=>{this.selectedId='';this.calibration=null;this.pause('장치 변경 · 스로틀을 확인하고 재개하세요.');this.poll();};
    el<HTMLDetailsElement>('input-settings').ontoggle=()=>{
      if(el<HTMLDetailsElement>('input-settings').open)this.pause('조종기 설정 중 · 설정 완료 후 재개하세요.');
    };
    el('calibrate-start').onclick=()=>{
      if(!this.pad){el('input-feedback').textContent='먼저 장치를 연결하고 선택하세요.';return;}
      this.calibration=structuredClone(this.mapping);
      for(const channel of CHANNELS){const value=this.pad.axes[this.mapping[channel].axis];if(value===undefined){this.calibration=null;el('input-feedback').textContent='없는 축 번호입니다. 매핑을 먼저 수정하세요.';return;}Object.assign(this.calibration[channel],{min:value,center:value,max:value});}
      this.pause('보정 중 · 모든 스틱을 끝까지 움직이세요.');el('input-feedback').textContent='각 스틱을 양쪽 끝까지 움직인 뒤 끝점 보정 완료를 누르세요.';
    };
    el('calibrate-end').onclick=()=>{
      if(!this.calibration){el('input-feedback').textContent='중립에서 보정을 먼저 시작하세요.';return;}
      const candidate=this.calibration;
      candidate.throttle.center=(candidate.throttle.min+candidate.throttle.max)/2;
      if(!validMapping(candidate)||CHANNELS.some(c=>candidate[c].max-candidate[c].min<0.4)) {
        el('input-feedback').textContent='축 범위가 부족하거나 중립이 끝점입니다. 모든 축을 움직이거나 중립에서 다시 시작하세요.';return;
      }
      this.mapping=structuredClone(candidate);this.calibration=null;this.drawMapping();el('input-feedback').textContent='보정 완료. 아래 설정 저장을 누르세요.';
    };
    el('save-input').onclick=()=>{
      if(!this.pad||!validMapping(this.mapping)){el('input-feedback').textContent='장치 연결과 올바른 매핑을 확인하세요.';return;}
      if(this.calibration){el('input-feedback').textContent='진행 중인 끝점 보정을 먼저 완료하세요.';return;}
      this.saved[this.pad.id]=structuredClone(this.mapping);
      try {localStorage.setItem(STORAGE_KEY,JSON.stringify(this.saved));el('input-feedback').textContent='이 장치의 매핑·반전·보정값을 저장했습니다.';}
      catch{el('input-feedback').textContent='저장 공간에 접근할 수 없습니다. 이번 세션에만 적용됩니다.';}
    };
  }
  private drawMapping() {
    const container=el('axis-settings');container.replaceChildren();
    for(const channel of CHANNELS) {
      const config=this.mapping[channel],row=document.createElement('div');row.className='axis-row';
      const name=document.createElement('span');name.textContent=labels[channel];row.append(name);
      const axis=document.createElement('input');axis.type='number';axis.min='0';axis.max='31';axis.value=String(config.axis);axis.setAttribute('aria-label',`${labels[channel]} 축 번호`);row.append(axis);
      const inversion=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=config.invert;check.setAttribute('aria-label',`${labels[channel]} 반전`);inversion.append(check,document.createTextNode('반전'));row.append(inversion);
      const dz=document.createElement('input');dz.type='number';dz.min='0';dz.max='0.4';dz.step='0.01';dz.value=String(config.deadzone);dz.setAttribute('aria-label',`${labels[channel]} 데드존`);dz.disabled=channel==='throttle';row.append(dz);
      const live=document.createElement('p');live.id=`axis-${channel}`;live.className='axis-live';row.append(live);
      axis.onchange=()=>{const value=Number(axis.value);if(Number.isInteger(value)&&value>=0&&value<32){this.mapping[channel]={...defaultMapping(this.pad?deviceKind(this.pad):'gamepad')[channel],axis:value,invert:check.checked,deadzone:config.deadzone};this.calibration=null;this.pause('축 변경 · 끝점 보정을 다시 확인하세요.');}else axis.value=String(this.mapping[channel].axis);};
      check.onchange=()=>{this.mapping[channel].invert=check.checked;this.calibration=null;this.pause('축 반전 적용 · 재개 전 방향을 확인하세요.');};
      dz.onchange=()=>{const value=Number(dz.value);if(Number.isFinite(value)&&value>=0&&value<=.4)this.mapping[channel].deadzone=value;else dz.value=String(this.mapping[channel].deadzone);};
      container.append(row);
    }
  }
  poll() {
    let pads:Gamepad[]=[];
    try{pads=Array.from(navigator.getGamepads?.()??[]).filter((p):p is Gamepad=>p!==null&&p.connected);}catch{/* Browser policy can disable gamepads. */}
    const selector=el<HTMLSelectElement>('device');
    const signature=pads.map(p=>`${p.index}:${p.id}`).join('|');
    if(signature!==this.signature){
      const previous=selector.value;selector.replaceChildren();
      if(!pads.length)selector.add(new Option('연결된 장치 없음',''));
      for(const pad of pads)selector.add(new Option(`${pad.index}: ${pad.id}`,String(pad.index)));
      if(pads.some(p=>String(p.index)===previous))selector.value=previous;
      this.signature=signature;
    }
    const next=pads.find(p=>String(p.index)===selector.value)??null;
    if(this.pad && (!next || next.index!==this.pad.index || next.id!==this.pad.id)){this.pause('조종기 연결이 끊겼거나 장치가 변경됐습니다. 현재 랩 무효 · 연결 후 다시 시작하세요.');this.calibration=null;}
    this.pad=next;
    if(next && this.selectedId!==next.id){
      this.selectedId=next.id;this.mapping=structuredClone(this.saved[next.id]??defaultMapping(deviceKind(next))); this.calibration=null;this.drawMapping();
    }
    if(this.calibration && next) for(const c of CHANNELS){const raw=next.axes[this.calibration[c].axis];if(raw!==undefined){this.calibration[c].min=Math.min(this.calibration[c].min,raw);this.calibration[c].max=Math.max(this.calibration[c].max,raw);}}
    return next ? readGamepad(next,this.mapping) : null;
  }
  updateDisplay() {
    el('device-message').textContent=this.pad?`${this.pad.axes.length}축 연결 · ${this.pad.mapping||'사용자 매핑'} · 0부터 시작하는 축 번호`:'장치를 연결한 뒤 버튼을 누르세요. localhost 또는 HTTPS 필요';
    el('raw-axes').textContent=this.pad?this.pad.axes.map((v,i)=>`${i}: ${v.toFixed(2)}`).join(' / '):'축 데이터 없음';
    for(const c of CHANNELS){const config=this.mapping[c],raw=this.pad?.axes[config.axis];el(`axis-${c}`).textContent=`출력 ${raw===undefined?'—':normalizeAxis(raw,config,c==='throttle').toFixed(2)} · 범위 ${config.min.toFixed(2)} / ${config.center.toFixed(2)} / ${config.max.toFixed(2)}`;}
  }
}
