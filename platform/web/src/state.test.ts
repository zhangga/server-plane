import { describe, expect, it } from 'vitest';
import { actionDisabledReason, filterEnvironments } from './state';
import type { Environment } from './types';

const baseEnv: Environment = {
  id: 'env_1',
  name: 'alice-dev',
  owner: 'alice',
  slot: 1,
  imageTag: 'master-latest',
  state: 'running',
  createdAt: '2026-05-29T00:00:00.000Z',
  updatedAt: '2026-05-29T00:00:00.000Z',
  ports: {
    tgate: 20101,
    gameserver: 20110,
    matcher: 20120,
    global: 20130,
    scenex: 20150,
    mongo: 20117,
    redis: 20179,
  },
  latestTask: null,
};

describe('web state helpers', () => {
  it('disables actions while a task is queued or running', () => {
    expect(
      actionDisabledReason('stop', {
        ...baseEnv,
        latestTask: {
          id: 'task_1',
          type: 'env.stop',
          status: 'queued',
          createdAt: '',
          startedAt: null,
          finishedAt: null,
          error: null,
        },
      }),
    ).toBe('任务进行中');
  });

  it('enables only state-compatible actions', () => {
    expect(actionDisabledReason('stop', baseEnv)).toBeNull();
    expect(actionDisabledReason('start', baseEnv)).toBe('当前状态不可用');
    expect(actionDisabledReason('start', { ...baseEnv, state: 'stopped' })).toBeNull();
    expect(actionDisabledReason('destroy', { ...baseEnv, state: 'destroyed' })).toBe('当前状态不可用');
  });

  it('filters environments by owner and state', () => {
    const bobEnv = { ...baseEnv, id: 'env_2', name: 'bob-dev', owner: 'bob', state: 'stopped' as const };

    expect(filterEnvironments([baseEnv, bobEnv], 'mine', 'alice')).toEqual([baseEnv]);
    expect(filterEnvironments([baseEnv, bobEnv], 'stopped', 'alice')).toEqual([bobEnv]);
    expect(filterEnvironments([baseEnv, bobEnv], 'all', 'alice')).toEqual([baseEnv, bobEnv]);
  });
});
