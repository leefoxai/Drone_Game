import { defaultMapping, readGamepad } from './input';
import type { Input } from '../../../packages/physics/src/index';
export class ControllerPanel {
  constructor(private pause:(reason:string)=>void) { void this.pause; }
  poll():Input|null { const pad=navigator.getGamepads?.()[0]; return pad?readGamepad(pad,defaultMapping()):null; }
  updateDisplay():void {}
}
