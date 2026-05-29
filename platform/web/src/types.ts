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
export type ContainerLogService =
  | 'tgateserver'
  | 'gameserver'
  | 'scenexserver'
  | 'globalserver'
  | 'matcherserver'
  | 'redis'
  | 'mongodb'
  | 'etcd'
  | 'etcd-init';

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
  imageTag: string;
}

export interface ContainerLogsResponse {
  envId: string;
  service: ContainerLogService;
  tail: number;
  logs: string;
}

export interface PublishedPort {
  publishedPort: number | null;
  targetPort: number | null;
  protocol: string | null;
}

export interface EnvironmentServiceDetail {
  service: ContainerLogService;
  containerName: string | null;
  image: string | null;
  state: string;
  status: string;
  health: string | null;
  exitCode: number | null;
  hostPort: number | null;
  publishedPorts: PublishedPort[];
  missing: boolean;
}

export interface EnvironmentDetail {
  environment: Environment;
  composeProject: string;
  runtimePath: string;
  composeFile: string;
  services: EnvironmentServiceDetail[];
}
