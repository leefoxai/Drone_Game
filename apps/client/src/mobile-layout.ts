const touchCapable=navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
if(touchCapable){
  document.body.classList.add('touch-ui');
  const controls=document.getElementById('controls') as HTMLElement|null;
  const panel=document.getElementById('panel-toggle') as HTMLButtonElement|null;
  const touchSettings=document.getElementById('touch-settings') as HTMLButtonElement|null;
  const sync=()=>{
    if(!controls||!panel||!touchSettings)return;
    panel.textContent=controls.hidden?'설정 열기':'설정 접기';
    panel.setAttribute('aria-expanded',String(!controls.hidden));
    touchSettings.textContent=controls.hidden?'설정':'닫기';
  };
  if(controls&&!controls.hidden)controls.hidden=true;
  const toggle=()=>{if(!controls)return;controls.hidden=!controls.hidden;sync();};
  if(panel)panel.onclick=toggle;
  if(touchSettings)touchSettings.onclick=toggle;
  sync();
}
