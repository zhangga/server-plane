import type { EnvironmentState, TaskType } from '../store/environmentStore.js';
import { AppError } from './errors.js';

export type EnvironmentAction = 'start' | 'stop' | 'restart' | 'wipe' | 'update-images' | 'destroy';
export type LifecycleAction = Exclude<EnvironmentAction, 'destroy'>;

const ACTION_TO_TASK = {
  start: 'env.start',
  stop: 'env.stop',
  restart: 'env.restart',
  wipe: 'env.wipe',
  'update-images': 'env.update_images',
  destroy: 'env.destroy',
} as const satisfies Record<EnvironmentAction, TaskType>;

const ALLOWED_TASK_STATES: Partial<Record<TaskType, EnvironmentState[]>> = {
  'env.start': ['stopped', 'failed'],
  'env.stop': ['running'],
  'env.restart': ['running'],
  'env.wipe': ['running', 'stopped'],
  'env.update_images': ['running', 'stopped'],
  'env.destroy': ['creating', 'running', 'stopped', 'failed'],
};

export function taskTypeForAction(action: EnvironmentAction): TaskType {
  return ACTION_TO_TASK[action];
}

export function assertCanRunTask(type: TaskType, state: EnvironmentState): void {
  const allowedStates = ALLOWED_TASK_STATES[type];
  if (!allowedStates?.includes(state)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Cannot run ${type} for environment in state ${state}`);
  }
}
