import type { Environment, EnvironmentAction, EnvironmentFilter } from './types';

const ACTION_STATES: Record<EnvironmentAction, Environment['state'][]> = {
  start: ['stopped', 'failed'],
  stop: ['running'],
  restart: ['running'],
  wipe: ['running', 'stopped'],
  'update-images': ['running', 'stopped'],
  destroy: ['creating', 'running', 'stopped', 'failed'],
};

export function hasInFlightTask(env: Environment): boolean {
  return env.latestTask?.status === 'queued' || env.latestTask?.status === 'running';
}

export function actionDisabledReason(action: EnvironmentAction, env: Environment): string | null {
  if (hasInFlightTask(env)) {
    return '任务进行中';
  }

  if (!ACTION_STATES[action].includes(env.state)) {
    return '当前状态不可用';
  }

  return null;
}

export function filterEnvironments(
  environments: Environment[],
  filter: EnvironmentFilter,
  currentOwner: string,
): Environment[] {
  if (filter === 'mine') {
    return environments.filter((env) => env.owner === currentOwner);
  }
  if (filter === 'all') {
    return environments;
  }
  return environments.filter((env) => env.state === filter);
}
