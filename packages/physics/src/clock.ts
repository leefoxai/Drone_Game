import { DT } from './index';
/** No discarded ticks: callers must explicitly pause/reset after a long frame. */
export class FixedClock {
  remainder = 0;
  advance(seconds: number, tick: () => void): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid elapsed time');
    this.remainder += seconds;
    while (this.remainder + 1e-12 >= DT) { tick(); this.remainder -= DT; }
    this.remainder = Math.max(0, this.remainder);
  }
  get alpha(): number { return this.remainder / DT; }
  reset(): void { this.remainder = 0; }
}
