import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { renderEnvironment } from '../compose/render.js';
import { COMPOSE_PROJECT_PREFIX, PST_IMAGES } from '../config.js';
import type { ComposeRunner } from '../docker/compose.js';
import type { ImagePuller } from '../docker/ttgops.js';
import type { EnvironmentRecord, EnvironmentStore, TaskRecord } from '../store/environmentStore.js';
import { AppError } from '../domain/errors.js';

export interface TaskProcessorDeps {
  store: EnvironmentStore;
  dockerRunner: ComposeRunner;
  imagePuller: ImagePuller;
  runtimeRoot: string;
  templateRoot: string;
}

export class TaskProcessor {
  constructor(private readonly deps: TaskProcessorDeps) {}

  async processTask(taskId: string): Promise<void> {
    const task = this.deps.store.findTaskById(taskId);
    if (!task) {
      throw new AppError('ENV_NOT_FOUND', `Task not found: ${taskId}`);
    }
    const env = this.deps.store.findById(task.envId);
    if (!env) {
      throw new AppError('ENV_NOT_FOUND', 'Environment not found');
    }

    const startedAt = new Date().toISOString();
    this.deps.store.updateTaskStatus(task.id, 'running', startedAt);

    try {
      await this.runTask(task, env);
      this.log(task.id, `task ${task.type} succeeded`);
      this.deps.store.updateTaskStatus(task.id, 'succeeded', new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(task.id, `task ${task.type} failed: ${message}`);
      this.deps.store.updateTaskStatus(task.id, 'failed', new Date().toISOString(), { error: message });
      if (task.type !== 'env.destroy') {
        this.deps.store.updateState(env.id, 'failed', new Date().toISOString());
      }
      throw err;
    }
  }

  private async runTask(task: TaskRecord, env: EnvironmentRecord): Promise<void> {
    switch (task.type) {
      case 'env.create':
        await this.create(env, task.id);
        return;
      case 'env.start':
        await this.start(env, task.id);
        return;
      case 'env.stop':
        await this.runCompose(env, task.id, ['stop'], 'stop environment');
        this.deps.store.updateState(env.id, 'stopped', new Date().toISOString());
        return;
      case 'env.restart':
        await this.runCompose(env, task.id, ['restart'], 'restart environment');
        this.deps.store.updateState(env.id, 'running', new Date().toISOString());
        return;
      case 'env.destroy':
        if (await this.composeExists(env)) {
          await this.runCompose(env, task.id, ['down', '-v', '--remove-orphans'], 'destroy environment');
        } else {
          this.log(task.id, `skip docker down for ${env.name}: compose file does not exist`);
        }
        await rm(this.envDir(env), { recursive: true, force: true });
        this.deps.store.updateState(env.id, 'destroyed', new Date().toISOString());
        return;
      case 'env.wipe':
        await this.runCompose(env, task.id, ['down', '-v'], 'wipe environment volumes');
        await this.runCompose(env, task.id, ['up', '-d'], 'restart wiped environment');
        this.deps.store.updateState(env.id, 'running', new Date().toISOString());
        return;
      case 'env.update_images':
        await this.updateImages(env, task.id);
        return;
    }
  }

  private async create(env: EnvironmentRecord, taskId: string): Promise<void> {
    this.log(taskId, `create environment ${env.name}`);
    const result = await renderEnvironment({
      name: env.name,
      slot: env.slot,
      imageTag: env.imageTag,
      runtimeRoot: this.deps.runtimeRoot,
      templateRoot: this.deps.templateRoot,
    });
    await this.deps.dockerRunner({
      projectName: this.projectName(env),
      composeFile: result.composeFile,
      cwd: result.envDir,
      args: ['up', '-d'],
    });
    this.deps.store.updateState(env.id, 'running', new Date().toISOString());
  }

  private async start(env: EnvironmentRecord, taskId: string): Promise<void> {
    this.log(taskId, `start environment ${env.name}`);
    await this.ensureRuntime(env);
    await this.runCompose(env, taskId, ['up', '-d'], 'start environment');
    this.deps.store.updateState(env.id, 'running', new Date().toISOString());
  }

  private async updateImages(env: EnvironmentRecord, taskId: string): Promise<void> {
    for (const image of PST_IMAGES) {
      const imageWithTag = `${image}:${env.imageTag}`;
      this.log(taskId, `pull image ${imageWithTag}`);
      await this.deps.imagePuller(imageWithTag);
    }
    await this.runCompose(env, taskId, ['up', '-d'], 'restart with updated images');
    this.deps.store.updateState(env.id, 'running', new Date().toISOString());
  }

  private async ensureRuntime(env: EnvironmentRecord): Promise<void> {
    if (!(await this.composeExists(env))) {
      await rm(this.envDir(env), { recursive: true, force: true });
      await renderEnvironment({
        name: env.name,
        slot: env.slot,
        imageTag: env.imageTag,
        runtimeRoot: this.deps.runtimeRoot,
        templateRoot: this.deps.templateRoot,
      });
    }
  }

  private async composeExists(env: EnvironmentRecord): Promise<boolean> {
    try {
      await access(this.composeFile(env));
      return true;
    } catch {
      return false;
    }
  }

  private async runCompose(env: EnvironmentRecord, taskId: string, args: string[], label: string): Promise<void> {
    this.log(taskId, `${label} ${env.name}`);
    await this.deps.dockerRunner({
      projectName: this.projectName(env),
      composeFile: this.composeFile(env),
      cwd: this.envDir(env),
      args,
    });
  }

  private log(taskId: string, message: string): void {
    this.deps.store.appendTaskLog(taskId, message, new Date().toISOString());
  }

  private projectName(env: EnvironmentRecord): string {
    return `${COMPOSE_PROJECT_PREFIX}${env.name}`;
  }

  private envDir(env: EnvironmentRecord): string {
    return join(this.deps.runtimeRoot, env.name);
  }

  private composeFile(env: EnvironmentRecord): string {
    return join(this.envDir(env), 'docker-compose.yml');
  }
}
