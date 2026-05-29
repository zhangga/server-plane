import { randomUUID } from 'node:crypto';
import { computeSlotConfig } from '../compose/slotConfig.js';
import { DEFAULT_IMAGE_TAG, SLOT_MAX, SLOT_MIN } from '../config.js';
import type { TaskQueue } from '../queue/taskQueue.js';
import type { EnvironmentRecord, EnvironmentState, EnvironmentStore, TaskRecord, TaskType } from '../store/environmentStore.js';
import { AppError } from './errors.js';
import { portsForSlot } from './ports.js';
import { assertCanRunTask, taskTypeForAction } from './stateMachine.js';
import type { LifecycleAction } from './stateMachine.js';

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const IMAGE_TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

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
  imageTag?: string;
}

export interface ListEnvironmentInput {
  state?: EnvironmentState;
  owner?: string;
}

export class EnvironmentService {
  constructor(private readonly deps: EnvironmentServiceDeps) {}

  list(input: ListEnvironmentInput = {}): EnvironmentResponse[] {
    return this.deps.store
      .list({
        state: input.state,
        owner: input.owner?.trim() || undefined,
      })
      .map((env) => toResponse(env, this.deps.store.latestTaskForEnv(env.id)));
  }

  get(id: string): EnvironmentResponse {
    const env = this.requireEnv(id);
    return toResponse(env, this.deps.store.latestTaskForEnv(env.id));
  }

  async create(input: CreateEnvironmentInput): Promise<AcceptedTaskResponse> {
    const name = normalizeName(input.name);
    const owner = String(input.owner ?? '').trim();
    const imageTag = normalizeImageTag(input.imageTag);

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
      imageTag,
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

  async enqueueAction(envId: string, action: LifecycleAction): Promise<AcceptedTaskResponse> {
    const env = this.requireEnv(envId);
    ensureNoInFlightTask(this.deps.store, env.id);

    const type = taskTypeForAction(action);
    assertCanRunTask(type, env.state);

    if (type === 'env.start') {
      this.deps.store.updateState(env.id, 'creating', new Date().toISOString());
    }

    return this.enqueueTask(env.id, type);
  }

  async changeImageTag(envId: string, imageTagInput: unknown): Promise<AcceptedTaskResponse> {
    const env = this.requireEnv(envId);
    ensureNoInFlightTask(this.deps.store, env.id);
    assertCanRunTask('env.update_images', env.state);

    const imageTag = normalizeImageTag(imageTagInput);
    this.deps.store.updateImageTag(env.id, imageTag, new Date().toISOString());

    return this.enqueueTask(env.id, 'env.update_images');
  }

  async destroy(envId: string): Promise<AcceptedTaskResponse> {
    const env = this.requireEnv(envId);
    ensureNoInFlightTask(this.deps.store, env.id);

    assertCanRunTask('env.destroy', env.state);
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

function normalizeImageTag(imageTag: unknown): string {
  const normalized = String(imageTag ?? '').trim() || DEFAULT_IMAGE_TAG;
  if (!IMAGE_TAG_PATTERN.test(normalized)) {
    throw new AppError(
      'INVALID_IMAGE_TAG',
      'Image tag must be 1-128 chars and contain only letters, numbers, underscore, dot, or dash',
    );
  }
  return normalized;
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
