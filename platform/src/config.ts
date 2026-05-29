export const SLOT_MIN = 1;
export const SLOT_MAX = 15;

export const PORT_BASE = 20000;
export const PORT_STRIDE = 100;

export const SUBNET_OCTET2_BASE = 18;

export const COMPOSE_PROJECT_PREFIX = 'pst-';

export const DEFAULT_IMAGE_TAG = 'master-latest';

export const REDIS_PASSWORD = 'rFG4QoKXLtAZ';
export const MONGO_USERNAME = 'root';
export const MONGO_PASSWORD = 'rFG4QoKXLtAZ';
export const ETCD_PASSWORD = 'rFG4QoKXLtAZ';

export const PST_IMAGES = [
  'harbor-sh.dailygn.com/pst/tgateserver',
  'harbor-sh.dailygn.com/pst/gameserver',
  'harbor-sh.dailygn.com/pst/scenexserver',
  'harbor-sh.dailygn.com/pst/globalserver',
  'harbor-sh.dailygn.com/pst/matcherserver',
] as const;
