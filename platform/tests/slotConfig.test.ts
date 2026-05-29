import { describe, expect, it } from 'vitest';
import { computeSlotConfig, SlotOutOfRangeError } from '../src/compose/slotConfig.js';

describe('computeSlotConfig', () => {
  it('produces correct network, IP, and port config for slot=1', () => {
    const cfg = computeSlotConfig(1);

    expect(cfg.slot).toBe(1);
    expect(cfg.subnet).toBe('172.19.0.0/16');
    expect(cfg.gateway).toBe('172.19.0.1');
    expect(cfg.ips.redis).toBe('172.19.0.111');
    expect(cfg.ips.mongo).toBe('172.19.0.112');
    expect(cfg.ips.etcd).toBe('172.19.0.113');
    expect(cfg.ips.etcdInit).toBe('172.19.0.114');
    expect(cfg.ips.tgate).toBe('172.19.0.201');
    expect(cfg.ips.gameserver).toBe('172.19.0.202');
    expect(cfg.ips.scenex).toBe('172.19.0.203');
    expect(cfg.ips.global).toBe('172.19.0.204');
    expect(cfg.ips.matcher).toBe('172.19.0.205');
    expect(cfg.hostPorts.tgate).toBe(20101);
    expect(cfg.hostPorts.gameserver).toBe(20110);
    expect(cfg.hostPorts.matcher).toBe(20120);
    expect(cfg.hostPorts.global).toBe(20130);
    expect(cfg.hostPorts.scenex).toBe(20150);
    expect(cfg.hostPorts.mongo).toBe(20117);
    expect(cfg.hostPorts.redis).toBe(20179);
  });

  it('produces correct network and port config for slot=15', () => {
    const cfg = computeSlotConfig(15);

    expect(cfg.subnet).toBe('172.33.0.0/16');
    expect(cfg.gateway).toBe('172.33.0.1');
    expect(cfg.ips.redis).toBe('172.33.0.111');
    expect(cfg.hostPorts.tgate).toBe(21501);
    expect(cfg.hostPorts.redis).toBe(21579);
  });

  it('throws SlotOutOfRangeError for slot=0 by default', () => {
    expect(() => computeSlotConfig(0)).toThrow(SlotOutOfRangeError);
  });

  it('supports slot=0 only when explicitly allowed', () => {
    const cfg = computeSlotConfig(0, { minSlot: 0 });

    expect(cfg.subnet).toBe('172.18.0.0/16');
    expect(cfg.hostPorts.tgate).toBe(20001);
  });

  it('throws SlotOutOfRangeError for slot=16', () => {
    expect(() => computeSlotConfig(16)).toThrow(SlotOutOfRangeError);
  });

  it('throws SlotOutOfRangeError for non-integer slot', () => {
    expect(() => computeSlotConfig(1.5)).toThrow(SlotOutOfRangeError);
  });
});
