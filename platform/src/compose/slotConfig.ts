import { PORT_BASE, PORT_STRIDE, SLOT_MAX, SLOT_MIN, SUBNET_OCTET2_BASE } from '../config.js';

export class SlotOutOfRangeError extends Error {
  constructor(slot: number, minSlot: number, maxSlot: number) {
    super(`Slot ${slot} is out of valid range [${minSlot}, ${maxSlot}]`);
    this.name = 'SlotOutOfRangeError';
  }
}

export interface SlotConfigOptions {
  minSlot?: number;
}

export interface SlotConfig {
  slot: number;
  subnet: string;
  gateway: string;
  ips: {
    redis: string;
    mongo: string;
    etcd: string;
    etcdInit: string;
    tgate: string;
    gameserver: string;
    scenex: string;
    global: string;
    matcher: string;
  };
  hostPorts: {
    tgate: number;
    gameserver: number;
    matcher: number;
    global: number;
    scenex: number;
    mongo: number;
    redis: number;
  };
}

export function computeSlotConfig(slot: number, opts: SlotConfigOptions = {}): SlotConfig {
  const minSlot = opts.minSlot ?? SLOT_MIN;

  if (!Number.isInteger(slot) || slot < minSlot || slot > SLOT_MAX) {
    throw new SlotOutOfRangeError(slot, minSlot, SLOT_MAX);
  }

  const octet2 = SUBNET_OCTET2_BASE + slot;
  const portBase = PORT_BASE + slot * PORT_STRIDE;
  const ip = (lastOctet: number) => `172.${octet2}.0.${lastOctet}`;

  return {
    slot,
    subnet: `172.${octet2}.0.0/16`,
    gateway: ip(1),
    ips: {
      redis: ip(111),
      mongo: ip(112),
      etcd: ip(113),
      etcdInit: ip(114),
      tgate: ip(201),
      gameserver: ip(202),
      scenex: ip(203),
      global: ip(204),
      matcher: ip(205),
    },
    hostPorts: {
      tgate: portBase + 1,
      gameserver: portBase + 10,
      matcher: portBase + 20,
      global: portBase + 30,
      scenex: portBase + 50,
      mongo: portBase + 17,
      redis: portBase + 79,
    },
  };
}
