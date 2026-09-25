import * as THREE from 'three';
import type { Track } from '../../../packages/physics/src/track';
import type { State } from '../../../packages/physics/src/index';

export function createWorld(canvas: HTMLCanvasElement, initialTrack:Track) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true});
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8caaa9');
  scene.fog = new THREE.Fog('#8caaa9',60,180);
  scene.add(new THREE.HemisphereLight('#d2eff5','#495a41',2.4));
  const sunlight=new THREE.DirectionalLight('#ffe5bd',2.6); sunlight.position.set(-20,40,10); scene.add(sunlight);
  const camera=new THREE.PerspectiveCamera(75,1,0.025,220);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:'#455d4f',roughness:1}));
  ground.rotation.x=-Math.PI/2;scene.add(ground);
  const grid=new THREE.GridHelper(200,100,'#8a9c75','#587464');grid.position.y=.01;scene.add(grid);
  function box(width:number,height:number,depth:number,color:string) {
    return new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color,roughness:.75}));
  }
  for(let i=0;i<30;i++) {
    const angle=i/30*Math.PI*2, distance=115+(i%4)*7;
    const hill=new THREE.Mesh(new THREE.ConeGeometry(16+(i%3)*7,18+(i%5)*8,5),new THREE.MeshStandardMaterial({color:i%2?'#64786e':'#51675d',flatShading:true}));
    hill.position.set(Math.cos(angle)*distance,7,Math.sin(angle)*distance);scene.add(hill);
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
      const group=new THREE.Group(); group.position.fromArray(gate.center);group.rotation.y=gate.yaw;
      const material=new THREE.MeshStandardMaterial({color:'#80e1d4',emissive:'#286858',emissiveIntensity:.2});gateMaterials.push(material);
      const w=gate.width,h=gate.height;
      const thickness=Math.min(.3,Math.max(.12,w*.12));
      for(const [x,y,bw,bh] of [[-w/2,0,thickness,h+thickness],[w/2,0,thickness,h+thickness],[0,h/2,w+thickness,thickness],[0,-h/2,w+thickness,thickness]]) {
        const post=new THREE.Mesh(new THREE.BoxGeometry(bw!,bh!,thickness),material);post.position.set(x!,y!,0);group.add(post);
      }
      const label=document.createElement('canvas');label.width=128;label.height=128;
      const ctx=label.getContext('2d')!;ctx.fillStyle='#172a32';ctx.beginPath();ctx.arc(64,64,52,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#b3e7cf';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#e5fff3';ctx.font='bold 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(gate.id),64,66);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(label)}));sprite.position.set(0,h/2+Math.max(.5,h*.22),0);sprite.scale.set(Math.min(1.5,w*.8),Math.min(1.5,w*.8),1);group.add(sprite);
      const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-gate.center[1]+.06,Math.max(1.2,w)),Math.max(1,w*.7),0xffd894,Math.min(.7,w*.3),Math.min(.6,w*.25));group.add(arrow);
      trackGroup.add(group);
    }
    const points=track.gates.map(g=>new THREE.Vector3(g.center[0],.04,g.center[2]));points.push(points[0]!.clone());
    const route=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:'#bac995',dashSize:.5,gapSize:.6,transparent:true,opacity:.5}));route.computeLineDistances();trackGroup.add(route);
  }
  setTrack(initialTrack);
  const drone=new THREE.Group();
  drone.add(box(.08,.055,.15,'#1b2530'));
  const battery=box(.06,.04,.11,'#ffac64');battery.position.y=.04;drone.add(battery);
  for(const angle of [-Math.PI/4,Math.PI/4]) {const arm=box(.3,.018,.023,'#25353e');arm.rotation.y=angle;drone.add(arm);}
  const props: THREE.Mesh[]=[];
  for(const x of [-.08,.08]) for(const z of [-.08,.08]) {
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(.019,.019,.03,12),new THREE.MeshStandardMaterial({color:'#889b9c'}));motor.position.set(x,.02,z);drone.add(motor);
    const prop=box(.127,.004,.013,z<0?'#77ece0':'#ffb372');prop.position.set(x,.039,z);drone.add(prop);props.push(prop);
    const disk=new THREE.Mesh(new THREE.CircleGeometry(.0635,24),new THREE.MeshBasicMaterial({color:z<0?'#77ece0':'#ffb372',transparent:true,opacity:.16,side:THREE.DoubleSide}));disk.rotation.x=-Math.PI/2;disk.position.set(x,.04,z);drone.add(disk);
  }
  const front=box(.025,.025,.02,'#6ce9dd');front.position.set(0,0,-.085);drone.add(front);scene.add(drone);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.23,24),new THREE.MeshBasicMaterial({color:'#152e27',transparent:true,opacity:.4}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const currentPosition=new THREE.Vector3(), currentQuaternion=new THREE.Quaternion(), oldQuaternion=new THREE.Quaternion();
  const tiltQuaternion=new THREE.Quaternion(), offset=new THREE.Vector3();
  let first=true;
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  }
  resize();window.addEventListener('resize',resize);
  return {
    render(previous:State,current:State,alpha:number,mode:string,tilt:number,fov:number,nextGate:number,elapsed:number) {
      currentPosition.fromArray(previous.position).lerp(new THREE.Vector3(...current.position),alpha);
      oldQuaternion.fromArray(previous.orientation);currentQuaternion.fromArray(current.orientation);oldQuaternion.slerp(currentQuaternion,alpha);
      drone.position.copy(currentPosition);drone.quaternion.copy(oldQuaternion);drone.visible=mode!=='fpv';
      props.forEach((prop,i)=>{prop.rotation.y+=elapsed*current.motors[i]!*300;});
      shadow.position.set(currentPosition.x,.025,currentPosition.z);shadow.scale.setScalar(1+currentPosition.y*.06);
      gateMaterials.forEach((m,i)=>{m.color.set(i===nextGate?'#ffc47b':'#7fe0d4');m.emissive.set(i===nextGate?'#b87327':'#286858');});
      if(mode==='fpv') {
        camera.position.copy(currentPosition).add(offset.set(0,.02,-.08).applyQuaternion(oldQuaternion));
        tiltQuaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),tilt*Math.PI/180);
        camera.quaternion.copy(oldQuaternion).multiply(tiltQuaternion);
      } else {
        const direction=new THREE.Vector3(0,0,-1).applyQuaternion(oldQuaternion);direction.y=0;
        if(direction.lengthSq()<.001) direction.set(0,0,-1); direction.normalize();
        const desired=currentPosition.clone().addScaledVector(direction,-3).add(new THREE.Vector3(0,1.3,0));
        if(first) camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-elapsed*8));
        camera.lookAt(currentPosition.clone().addScaledVector(direction,2));
      }
      first=false;camera.fov=fov;camera.updateProjectionMatrix();renderer.render(scene,camera);canvas.dataset.rendered='true';
    },
    setTrack(track:Track){setTrack(track);first=true;},
    resetCamera(){first=true;},
    dispose(){window.removeEventListener('resize',resize);disposeObject(scene);renderer.dispose();},
  };
}
