import { computeSlotConfig } from '../compose/slotConfig.js';

export interface EnvironmentPorts {
  tgate: number;
  gameserver: number;
  matcher: number;
  global: number;
  scenex: number;
  mongo: number;
  redis: number;
}

export function portsForSlot(slot: number): EnvironmentPorts {
  return computeSlotConfig(slot).hostPorts;
}
