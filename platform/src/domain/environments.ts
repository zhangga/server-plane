import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { computeSlotConfig } from '../compose/slotConfig.js';
import { renderEnvironment } from '../compose/render.js';
import { COMPOSE_PROJECT_PREFIX, DEFAULT_IMAGE_TAG, SLOT_MAX, SLOT_MIN } from '../config.js';
import type { ComposeRunner } from '../docker/compose.js';
import { AppError } from './errors.js';
import { portsForSlot } from './ports.js';
import type { EnvironmentRecord, EnvironmentState, EnvironmentStore } from '../store/environmentStore.js';

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
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
}

export interface EnvironmentServiceDeps {
  store: EnvironmentStore;
  dockerRunner: ComposeRunner;
  runtimeRoot: string;
  templateRoot: string;
}

export interface CreateEnvironmentInput {
  name: string;
  owner: string;
}

export class EnvironmentService {
  constructor(private readonly deps: EnvironmentServiceDeps) {}

  list(state?: EnvironmentState): EnvironmentResponse[] {
    return this.deps.store.list({ state }).map(toResponse);
  }

  get(id: string): EnvironmentResponse {
    const env = this.deps.store.findById(id);
    if (!env) {
      throw new AppError('ENV_NOT_FOUND', 'Environment not found');
    }
    return toResponse(env);
  }

  async create(input: CreateEnvironmentInput): Promise<EnvironmentResponse> {
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
    const created = this.deps.store.create({
      id: `env_${randomUUID()}`,
      name,
      owner,
      slot,
      imageTag: DEFAULT_IMAGE_TAG,
      state: 'creating',
      now,
    });

    try {
      const result = await renderEnvironment({
        name,
        slot,
        imageTag: created.imageTag,
        runtimeRoot: this.deps.runtimeRoot,
        templateRoot: this.deps.templateRoot,
      });
      await this.deps.dockerRunner({
        projectName: `${COMPOSE_PROJECT_PREFIX}${name}`,
        composeFile: result.composeFile,
        cwd: result.envDir,
        args: ['up', '-d'],
      });
      const running = this.deps.store.updateState(created.id, 'running', new Date().toISOString());
      if (!running) {
        throw new AppError('ENV_NOT_FOUND', 'Environment not found');
      }
      return toResponse(running);
    } catch (err) {
      this.deps.store.updateState(created.id, 'failed', new Date().toISOString());
      throw err;
    }
  }

  async destroy(id: string): Promise<{ id: string; state: 'destroyed' }> {
    const env = this.deps.store.findById(id);
    if (!env) {
      throw new AppError('ENV_NOT_FOUND', 'Environment not found');
    }
    if (!DESTROYABLE_STATES.has(env.state)) {
      throw new AppError('INVALID_STATE_TRANSITION', `Cannot destroy environment in state ${env.state}`);
    }

    const destroying = this.deps.store.updateState(id, 'destroying', new Date().toISOString());
    if (!destroying) {
      throw new AppError('ENV_NOT_FOUND', 'Environment not found');
    }

    const envDir = join(this.deps.runtimeRoot, env.name);
    const composeFile = join(envDir, 'docker-compose.yml');

    await this.deps.dockerRunner({
      projectName: `${COMPOSE_PROJECT_PREFIX}${env.name}`,
      composeFile,
      cwd: envDir,
      args: ['down', '-v', '--remove-orphans'],
    });
    await rm(envDir, { recursive: true, force: true });
    this.deps.store.updateState(id, 'destroyed', new Date().toISOString());

    return { id, state: 'destroyed' };
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

function normalizeName(name: unknown): string {
  return String(name ?? '').trim();
}

function toResponse(env: EnvironmentRecord): EnvironmentResponse {
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
  };
}
