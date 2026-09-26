export interface RenderCameraPose {
  positionWorldM:[number,number,number];
  orientationWorld:[number,number,number,number];
  verticalFovRad:number;
  aspectRatio:number;
  nearM:number;
  farM:number;
}

let current:RenderCameraPose|null=null;

export function setCurrentCameraPose(pose:RenderCameraPose):void {
  current={...pose,positionWorldM:[...pose.positionWorldM],orientationWorld:[...pose.orientationWorld]};
}

export function getCurrentCameraPose():RenderCameraPose|null {
  return current?{...current,positionWorldM:[...current.positionWorldM],orientationWorld:[...current.orientationWorld]}:null;
}
