import { loadTrainingConsent, setTrainingConsent } from './consent';

const checkbox=document.getElementById('training-consent') as HTMLInputElement|null;
const status=document.getElementById('training-consent-status');

function render(){
  if(!checkbox)return;
  const state=loadTrainingConsent();
  checkbox.checked=state.granted;
  if(status)status.textContent=state.granted
    ? '동의됨 · 지금부터 시작하는 새 랩부터 local_bc_training 대상이 될 수 있습니다.'
    : '미동의 · 기록은 로컬에 보존되지만 학습 export 대상에서는 제외됩니다.';
}

if(checkbox){
  render();
  checkbox.addEventListener('change',()=>{
    setTrainingConsent(checkbox.checked);
    render();
  });
}
