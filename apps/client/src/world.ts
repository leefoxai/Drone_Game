import * as THREE from 'three';
import { DRONE_COLLISION_RADIUS_M, GATE_FRAME_THICKNESS_M, gateSolidBoxes } from '../../../packages/physics/src/track';
import type { Track } from '../../../packages/physics/src/track';
import type { State } from '../../../packages/physics/src/index';

export const DRONE_VISUAL_RADIUS_M = DRONE_COLLISION_RADIUS_M;
export const CONE_HEIGHT_M = 0.5;
export const FLAG_HEIGHT_M = 2.0;

export interface HorizonLine { leftY: number; rightY: number }

export function createWorld(canvas: HTMLCanvasElement, initialTrack:Track) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8caaa9');
  scene.fog = new THREE.Fog('#8caaa9',60,180);
  scene.add(new THREE.HemisphereLight('#d2eff5','#495a41',1.8));
  const sunlight=new THREE.DirectionalLight('#ffe5bd',3.0);
  sunlight.position.set(-30,55,18);sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);
  sunlight.shadow.camera.left=-80;sunlight.shadow.camera.right=80;sunlight.shadow.camera.top=80;sunlight.shadow.camera.bottom=-80;
  sunlight.shadow.camera.near=1;sunlight.shadow.camera.far=150;sunlight.shadow.bias=-0.00015;
  scene.add(sunlight);
  const camera=new THREE.PerspectiveCamera(75,1,0.025,220);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#455d4f',roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(200,100,'#8a9c75','#587464');grid.position.y=.012;scene.add(grid);

  function box(width:number,height:number,depth:number,color:string) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color,roughness:.75}));
    mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  for(let i=0;i<30;i++) {
    const angle=i/30*Math.PI*2, distance=115+(i%4)*7;
    const hill=new THREE.Mesh(new THREE.ConeGeometry(16+(i%3)*7,18+(i%5)*8,5),new THREE.MeshStandardMaterial({color:i%2?'#64786e':'#51675d',flatShading:true}));
    hill.position.set(Math.cos(angle)*distance,7,Math.sin(angle)*distance);hill.castShadow=true;hill.receiveShadow=true;scene.add(hill);
  }

  const scaleGroup=new THREE.Group();scene.add(scaleGroup);
  for(const [x,z] of [[-6,-4],[6,-12],[-5,-19],[10,2]] as [number,number][]) {
    const cone=new THREE.Mesh(new THREE.ConeGeometry(.18,CONE_HEIGHT_M,18),new THREE.MeshStandardMaterial({color:'#ff8d42',roughness:.8}));
    cone.position.set(x,CONE_HEIGHT_M/2,z);cone.castShadow=true;cone.receiveShadow=true;cone.userData.scaleObject='cone';scaleGroup.add(cone);
  }
  for(const [x,z] of [[-8,-10],[8,-20]] as [number,number][]) {
    const flag=new THREE.Group();flag.position.set(x,0,z);flag.userData.scaleObject='flag';
    const pole=box(.035,FLAG_HEIGHT_M,.035,'#e7e7dc');pole.position.y=FLAG_HEIGHT_M/2;flag.add(pole);
    const cloth=box(.65,.32,.025,'#ffcf65');cloth.position.set(.325,FLAG_HEIGHT_M-.22,0);flag.add(cloth);scaleGroup.add(flag);
  }

  const trackGroup=new THREE.Group();scene.add(trackGroup);
  let gateMaterials:THREE.MeshStandardMaterial[]=[];
  function disposeObject(object:THREE.Object3D){object.traverse(child=>{
    if(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite){
      if('geometry' in child)child.geometry.dispose();
      const materials=Array.isArray(child.material)?child.material:[child.material];
      materials.forEach(material=>{if('map' in material && material.map instanceof THREE.Texture)material.map.dispose();material.dispose();});
    }
  });}
  function setTrack(track:Track){
    for(const child of [...trackGroup.children]){trackGroup.remove(child);disposeObject(child);}
    gateMaterials=[];
    for(const gate of track.gates) {
      const group=new THREE.Group();group.position.fromArray(gate.center);group.rotation.y=gate.yaw;group.userData.gateId=gate.id;
      const material=new THREE.MeshStandardMaterial({color:'#80e1d4',emissive:'#286858',emissiveIntensity:.2,roughness:.7});gateMaterials.push(material);
      for(const solid of gateSolidBoxes(gate)) {
        const post=new THREE.Mesh(new THREE.BoxGeometry(...solid.size),material);
        post.position.fromArray(solid.center);post.castShadow=true;post.receiveShadow=true;post.userData.gateSolid=solid.kind;group.add(post);
      }
      const marker=new THREE.Mesh(new THREE.PlaneGeometry(gate.width+GATE_FRAME_THICKNESS_M,.42),new THREE.MeshBasicMaterial({color:'#e9ce78',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
      marker.rotation.x=-Math.PI/2;marker.position.set(0,-gate.center[1]+.018,0);marker.userData.groundMarker=true;group.add(marker);
      const label=document.createElement('canvas');label.width=128;label.height=128;
      const ctx=label.getContext('2d')!;ctx.fillStyle='#172a32';ctx.beginPath();ctx.arc(64,64,52,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b3e7cf';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#e5fff3';ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(gate.id),64,66);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(label)}));sprite.position.set(0,gate.height/2+Math.max(.5,gate.height*.22),0);sprite.scale.set(Math.min(1.5,gate.width*.8),Math.min(1.5,gate.width*.8),1);group.add(sprite);
      trackGroup.add(group);
    }
    const points=track.gates.map(g=>new THREE.Vector3(g.center[0],.04,g.center[2]));points.push(points[0]!.clone());
    const route=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:'#bac995',dashSize:.5,gapSize:.6,transparent:true,opacity:.5}));route.computeLineDistances();trackGroup.add(route);
    canvas.dataset.gateFrameThickness=String(GATE_FRAME_THICKNESS_M);
    canvas.dataset.gateLegs=String(track.gates.length*2);
    canvas.dataset.groundMarkers=String(track.gates.length);
  }
  setTrack(initialTrack);

  const drone=new THREE.Group();drone.userData.visualRadius=DRONE_VISUAL_RADIUS_M;
  drone.add(box(.09,.055,.15,'#1b2530'));
  const battery=box(.065,.04,.11,'#ffac64');battery.position.y=.04;drone.add(battery);
  const motorOffset=.127;
  for(const angle of [-Math.PI/4,Math.PI/4]) {const arm=box(.36,.018,.022,'#25353e');arm.rotation.y=angle;drone.add(arm);}
  const props: THREE.Mesh[]=[];
  for(const x of [-motorOffset,motorOffset]) for(const z of [-motorOffset,motorOffset]) {
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(.019,.019,.03,12),new THREE.MeshStandardMaterial({color:'#889b9c'}));motor.position.set(x,.02,z);motor.castShadow=true;drone.add(motor);
    const prop=box(.08,.004,.012,z<0?'#77ece0':'#ffb372');prop.position.set(x,.039,z);drone.add(prop);props.push(prop);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(.04,24),new THREE.MeshStandardMaterial({color:z<0?'#77ece0':'#ffb372',transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}));disk.rotation.x=-Math.PI/2;disk.position.set(x,.04,z);disk.castShadow=true;drone.add(disk);
  }
  const front=box(.025,.025,.02,'#6ce9dd');front.position.set(0,0,-.085);drone.add(front);scene.add(drone);
  canvas.dataset.droneVisualRadius=String(DRONE_VISUAL_RADIUS_M);
  canvas.dataset.droneCollisionRadius=String(DRONE_COLLISION_RADIUS_M);
  canvas.dataset.realShadows='true';
  canvas.dataset.scaleCones='4';canvas.dataset.scaleFlags='2';

  const currentPosition=new THREE.Vector3(), currentQuaternion=new THREE.Quaternion(), oldQuaternion=new THREE.Quaternion();
  const tiltQuaternion=new THREE.Quaternion(), offset=new THREE.Vector3();
  let first=true;
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  }
  function horizonLine():HorizonLine|null {
    const inv=camera.quaternion.clone().invert();
    const normal=new THREE.Vector3(0,1,0).applyQuaternion(inv);
    if(Math.abs(normal.y)<1e-5)return null;
    const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
    const ndcY=(x:number)=>(normal.z-normal.x*x*tanH)/(normal.y*tanV);
    return {leftY:(1-ndcY(-1))*0.5,rightY:(1-ndcY(1))*0.5};
  }
  resize();window.addEventListener('resize',resize);
  return {
    render(previous:State,current:State,alpha:number,mode:'chase'|'fpv',tilt:number,fov:number,nextGate:number,elapsed:number) {
      currentPosition.fromArray(previous.position).lerp(new THREE.Vector3(...current.position),alpha);
      oldQuaternion.fromArray(previous.orientation);currentQuaternion.fromArray(current.orientation);oldQuaternion.slerp(currentQuaternion,alpha);
      drone.position.copy(currentPosition);drone.quaternion.copy(oldQuaternion);
      props.forEach((prop,i)=>{prop.rotation.y+=elapsed*current.motors[i]!*300;});
      gateMaterials.forEach((m,i)=>{m.color.set(i===nextGate?'#ffc47b':'#7fe0d4');m.emissive.set(i===nextGate?'#b87327':'#286858');});
      if(mode==='fpv') {
        camera.position.copy(currentPosition).add(offset.set(0,.035,-.17).applyQuaternion(oldQuaternion));
        tiltQuaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),tilt*Math.PI/180);
        camera.quaternion.copy(oldQuaternion).multiply(tiltQuaternion);
      } else {
        const direction=new THREE.Vector3(0,0,-1).applyQuaternion(oldQuaternion);direction.y=0;
        if(direction.lengthSq()<.001) direction.set(0,0,-1);direction.normalize();
        const desired=currentPosition.clone().addScaledVector(direction,-3.2).add(new THREE.Vector3(0,.38,0));
        if(first)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-elapsed*8));
        camera.lookAt(currentPosition.clone().addScaledVector(direction,2).add(new THREE.Vector3(0,.06,0)));
      }
      first=false;camera.fov=fov;camera.updateProjectionMatrix();renderer.render(scene,camera);canvas.dataset.rendered='true';canvas.dataset.cameraMode=mode;
      return horizonLine();
    },
    setTrack(track:Track){setTrack(track);first=true;},
    resetCamera(){first=true;},
    dispose(){window.removeEventListener('resize',resize);disposeObject(scene);renderer.dispose();},
  };
}
