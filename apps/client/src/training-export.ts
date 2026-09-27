import { classifyTrainingUse } from '../../../packages/physics/src/telemetry';
import type { TrainingUse } from '../../../packages/physics/src/telemetry';
import type { FullLapRecording } from './recording';

export interface TrainingEligibility { eligible:boolean; reason:string|null }

/** Strict, non-mutating recording-level export gate used before derived datasets are created. */
export function trainingEligibility(recording:FullLapRecording,use:TrainingUse):TrainingEligibility {
  if(recording.metadata.outcome.status!=='complete')return {eligible:false,reason:'outcome_not_complete'};
  if(!recording.metadata.consent.granted||!recording.metadata.consent.scope.includes('local_bc_training'))return {eligible:false,reason:'consent_missing'};
  const classified=classifyTrainingUse(recording.metadata,recording.inputs);
  if(recording.metadata.trainingUse!==classified)return {eligible:false,reason:'training_use_mislabeled'};
  if(classified!==use)return {eligible:false,reason:`training_use_${classified}`};
  return {eligible:true,reason:null};
}

export function selectTrainingRecordings(records:readonly FullLapRecording[],use:TrainingUse):FullLapRecording[]{
  return records.filter(recording=>trainingEligibility(recording,use).eligible);
}
