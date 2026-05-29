import { randomUUID } from 'node:crypto';
import { computeSlotConfig } from '../compose/slotConfig.js';
import { DEFAULT_IMAGE_TAG, SLOT_MAX, SLOT_MIN } from '../config.js';
import type { TaskQueue } from '../queue/taskQueue.js';
import type { EnvironmentRecord, EnvironmentState, EnvironmentStore, TaskRecord, TaskType } from '../store/environmentStore.js';
import { AppError } from './errors.js';
import { portsForSlot } from './ports.js';

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const ACTION_TO_TASK = {
  start: 'env.start',
  stop: 'env.stop',
  restart: 'env.restart',
  wipe: 'env.wipe',
  'update-images': 'env.update_images',
} as const satisfies Record<string, TaskType>;

const ALLOWED_ACTION_STATES: Record<(typeof ACTION_TO_TASK)[keyof typeof ACTION_TO_TASK], EnvironmentState[]> = {
  'env.start': ['stopped', 'failed'],
  'env.stop': ['running'],
  'env.restart': ['running'],
  'env.wipe': ['running', 'stopped'],
  'env.update_images': ['running', 'stopped'],
};

const DESTROYABLE_STATES = new Set<EnvironmentState>(['creating', 'running', 'stopped', 'failed']);

export interface EnvironmentResponse {
  id: string;
  name: string;
  owner: string;
  slot: number;
  imageTag: string;
  state: EnvironmentState;
  createdAt: string;
  updatedAt: string;
  ports: ReturnType<typeof portsForSlot>;
  latestTask: TaskSummary | null;
}

export interface TaskSummary {
  id: string;
  type: TaskType;
  status: TaskRecord['status'];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface AcceptedTaskResponse {
  envId: string;
  taskId: string;
}

export interface EnvironmentServiceDeps {
  store: EnvironmentStore;
  taskQueue: TaskQueue;
}

export interface CreateEnvironmentInput {
  name: string;
  owner: string;
}

export class EnvironmentService {
  constructor(private readonly deps: EnvironmentServiceDeps) {}

  list(state?: EnvironmentState): EnvironmentResponse[] {
    return this.deps.store.list({ state }).map((env) => toResponse(env, this.deps.store.latestTaskForEnv(env.id)));
  }

  get(id: string): EnvironmentResponse {
    const env = this.requireEnv(id);
    return toResponse(env, this.deps.store.latestTaskForEnv(env.id));
  }

  async create(input: CreateEnvironmentInput): Promise<AcceptedTaskResponse> {
    const name = normalizeName(input.name);
    const owner = String(input.owner ?? '').trim();

    if (!NAME_PATTERN.test(name)) {
      throw new AppError(
        'INVALID_NAME',
        'Environment name must be 3-40 chars of kebab-case lowercase letters and numbers',
      );
    }

    if (this.deps.store.findActiveByName(name)) {
      throw new AppError('ENV_NAME_TAKEN', 'Environment name is already in use');
    }

    const slot = allocateSlot(this.deps.store.occupiedSlots());
    const now = new Date().toISOString();
    const env = this.deps.store.create({
      id: `env_${randomUUID()}`,
      name,
      owner,
      slot,
      imageTag: DEFAULT_IMAGE_TAG,
      state: 'creating',
      now,
    });
    const task = this.deps.store.createTask({
      id: `task_${randomUUID()}`,
      envId: env.id,
      type: 'env.create',
      now,
    });
    await this.deps.taskQueue.enqueue(task.id);

    return { envId: env.id, taskId: task.id };
  }

  async enqueueAction(envId: string, action: keyof typeof ACTION_TO_TASK): Promise<AcceptedTaskResponse> {
    const env = this.requireEnv(envId);
    ensureNoInFlightTask(this.deps.store, env.id);

    const type = ACTION_TO_TASK[action];
    const allowedStates = ALLOWED_ACTION_STATES[type];
    if (!allowedStates.includes(env.state)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot run ${type} for environment in state ${env.state}`);
    }

    if (type === 'env.start') {
      this.deps.store.updateState(env.id, 'creating', new Date().toISOString());
    }

    return this.enqueueTask(env.id, type);
  }

  async destroy(envId: string): Promise<AcceptedTaskResponse> {
    const env = this.requireEnv(envId);
    ensureNoInFlightTask(this.deps.store, env.id);

    if (!DESTROYABLE_STATES.has(env.state)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot destroy environment in state ${env.state}`);
    }
    this.deps.store.updateState(env.id, 'destroying', new Date().toISOString());

    return this.enqueueTask(env.id, 'env.destroy');
  }

  private requireEnv(id: string): EnvironmentRecord {
    const env = this.deps.store.findById(id);
    if (!env) {
      throw new AppError('ENV_NOT_FOUND', 'Environment not found');
    }
    return env;
  }

  private async enqueueTask(envId: string, type: TaskType): Promise<AcceptedTaskResponse> {
    const now = new Date().toISOString();
    const task = this.deps.store.createTask({
      id: `task_${randomUUID()}`,
      envId,
      type,
      now,
    });
    await this.deps.taskQueue.enqueue(task.id);
    return { envId, taskId: task.id };
  }
}

export function allocateSlot(occupiedSlots: number[]): number {
  const occupied = new Set(occupiedSlots);
  for (let slot = SLOT_MIN; slot <= SLOT_MAX; slot += 1) {
    if (!occupied.has(slot)) {
      computeSlotConfig(slot);
      return slot;
    }
  }
  throw new AppError('NO_SLOT_AVAILABLE', 'No environment slots are available');
}

function ensureNoInFlightTask(store: EnvironmentStore, envId: string): void {
  if (store.findInFlightTaskForEnv(envId)) {
    throw new AppError('TASK_RUNNING', 'Environment already has a task in progress');
  }
}

function normalizeName(name: unknown): string {
  return String(name ?? '').trim();
}

function toResponse(env: EnvironmentRecord, latestTask?: TaskRecord): EnvironmentResponse {
  return {
    id: env.id,
    name: env.name,
    owner: env.owner,
    slot: env.slot,
    imageTag: env.imageTag,
    state: env.state,
    createdAt: env.createdAt,
    updatedAt: env.updatedAt,
    ports: portsForSlot(env.slot),
    latestTask: latestTask ? toTaskSummary(latestTask) : null,
  };
}

function toTaskSummary(task: TaskRecord): TaskSummary {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    error: task.error,
  };
}
