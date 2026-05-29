export type EnvironmentState = 'creating' | 'running' | 'stopped' | 'failed' | 'destroying' | 'destroyed';
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type TaskType =
  | 'env.create'
  | 'env.start'
  | 'env.stop'
  | 'env.restart'
  | 'env.destroy'
  | 'env.wipe'
  | 'env.update_images';

export type EnvironmentAction = 'start' | 'stop' | 'restart' | 'wipe' | 'update-images' | 'destroy';
export type EnvironmentFilter = 'mine' | 'all' | 'running' | 'stopped' | 'failed' | 'destroyed';

export interface TaskSummary {
  id: string;
  type: TaskType;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface EnvironmentPorts {
  tgate: number;
  gameserver: number;
  matcher: number;
  global: number;
  scenex: number;
  mongo: number;
  redis: number;
}

export interface Environment {
  id: string;
  name: string;
  owner: string;
  slot: number;
  imageTag: string;
  state: EnvironmentState;
  createdAt: string;
  updatedAt: string;
  ports: EnvironmentPorts;
  latestTask: TaskSummary | null;
}

export interface AcceptedTask {
  envId: string;
  taskId: string;
}

export interface CreateEnvironmentInput {
  name: string;
  owner: string;
}
