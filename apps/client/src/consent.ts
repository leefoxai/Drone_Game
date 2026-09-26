export const TRAINING_CONSENT_POLICY_VERSION='m3-local-training-v1';
export const TRAINING_CONSENT_SCOPE='local_bc_training';
const STORAGE_KEY='drone.training-consent.v1';

export interface TrainingConsentState {
  granted:boolean;
  grantedAtUtc:string|null;
}

export interface TrainingConsentSnapshot {
  granted:boolean;
  scope:string[];
  policyVersion:string|null;
  grantedAtUtc:string|null;
}

const off=():TrainingConsentState=>({granted:false,grantedAtUtc:null});

export function loadTrainingConsent(storage:Storage=localStorage):TrainingConsentState {
  try{
    const raw=storage.getItem(STORAGE_KEY);if(!raw)return off();
    const parsed=JSON.parse(raw) as Partial<TrainingConsentState>;
    if(parsed.granted===true&&typeof parsed.grantedAtUtc==='string'&&parsed.grantedAtUtc.length>0)return {granted:true,grantedAtUtc:parsed.grantedAtUtc};
  }catch{}
  return off();
}

export function setTrainingConsent(granted:boolean,storage:Storage=localStorage,now=()=>new Date().toISOString()):TrainingConsentState {
  const current=loadTrainingConsent(storage);
  const next:TrainingConsentState=granted?{granted:true,grantedAtUtc:current.granted&&current.grantedAtUtc?current.grantedAtUtc:now()}:off();
  storage.setItem(STORAGE_KEY,JSON.stringify(next));
  return next;
}

export function trainingConsentSnapshot(state:TrainingConsentState):TrainingConsentSnapshot {
  return state.granted
    ? {granted:true,scope:[TRAINING_CONSENT_SCOPE],policyVersion:TRAINING_CONSENT_POLICY_VERSION,grantedAtUtc:state.grantedAtUtc}
    : {granted:false,scope:[],policyVersion:null,grantedAtUtc:null};
}

export function clearTrainingConsentForTests(storage:Storage=localStorage){storage.removeItem(STORAGE_KEY);}
