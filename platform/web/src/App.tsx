import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Boxes,
  CircleAlert,
  FileText,
  Filter,
  Info,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  changeEnvironmentImageTag,
  createEnvironment,
  deleteEnvironment,
  fetchContainerLogs,
  fetchEnvironmentDetail,
  fetchEnvironments,
  postEnvironmentAction,
} from './api';
import { ContainerLogsDrawer } from './components/ContainerLogsDrawer';
import { EnvironmentDetailDrawer } from './components/EnvironmentDetailDrawer';
import { ConfirmActionDialog } from './components/ConfirmActionDialog';
import { CreateEnvironmentDialog } from './components/CreateEnvironmentDialog';
import { ImageTagDialog } from './components/ImageTagDialog';
import { TaskDrawer } from './components/TaskDrawer';
import { loadOwnerPreference, saveOwnerPreference } from './ownerPreference';
import { actionDisabledReason, filterEnvironments, hasInFlightTask } from './state';
import type {
  AcceptedTask,
  ContainerLogService,
  Environment,
  EnvironmentAction,
  EnvironmentFilter,
  EnvironmentState,
} from './types';

const FILTERS: Array<{ key: EnvironmentFilter; label: string }> = [
  { key: 'mine', label: '我的' },
  { key: 'all', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'stopped', label: '已停止' },
  { key: 'failed', label: '失败' },
  { key: 'destroyed', label: '已销毁' },
];

const STATE_FILTERS = new Set<EnvironmentFilter>(['running', 'stopped', 'failed', 'destroyed']);
const DEFAULT_LOG_SERVICE: ContainerLogService = 'tgateserver';
const DEFAULT_LOG_TAIL = 300;

export function App() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<EnvironmentFilter>('all');
  const [currentOwner, setCurrentOwner] = useState(loadOwnerPreference);
  const [ownerDraft, setOwnerDraft] = useState(currentOwner);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<AcceptedTask | null>(null);
  const [detailEnv, setDetailEnv] = useState<Environment | null>(null);
  const [logsEnv, setLogsEnv] = useState<Environment | null>(null);
  const [logsService, setLogsService] = useState<ContainerLogService>(DEFAULT_LOG_SERVICE);
  const [pendingTagEnv, setPendingTagEnv] = useState<Environment | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    env: Environment;
    action: Extract<EnvironmentAction, 'destroy' | 'update-images'>;
  } | null>(null);

  const environmentsQuery = useQuery({
    queryKey: ['environments', filter, filter === 'mine' ? currentOwner : 'all'],
    queryFn: () =>
      fetchEnvironments({
        owner: filter === 'mine' ? currentOwner : undefined,
        state: STATE_FILTERS.has(filter) ? (filter as EnvironmentState) : undefined,
      }),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: createEnvironment,
    onSuccess: (task) => {
      setCreateOpen(false);
      setActiveTask(task);
      void queryClient.invalidateQueries({ queryKey: ['environments'] });
    },
  });

  const containerLogsQuery = useQuery({
    queryKey: ['container-logs', logsEnv?.id, logsService, DEFAULT_LOG_TAIL],
    queryFn: () =>
      fetchContainerLogs(logsEnv!.id, {
        service: logsService,
        tail: DEFAULT_LOG_TAIL,
    }),
    enabled: Boolean(logsEnv),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const environmentDetailQuery = useQuery({
    queryKey: ['environment-detail', detailEnv?.id],
    queryFn: () => fetchEnvironmentDetail(detailEnv!.id),
    enabled: Boolean(detailEnv),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const changeTagMutation = useMutation({
    mutationFn: async ({ env, imageTag }: { env: Environment; imageTag: string }) =>
      changeEnvironmentImageTag(env.id, imageTag),
    onSuccess: (task) => {
      setPendingTagEnv(null);
      setActiveTask(task);
      void queryClient.invalidateQueries({ queryKey: ['environments'] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ env, action }: { env: Environment; action: EnvironmentAction }) => {
      if (action === 'destroy') {
        return deleteEnvironment(env.id);
      }
      return postEnvironmentAction(env.id, action);
    },
    onSuccess: (task) => {
      setActiveTask(task);
      void queryClient.invalidateQueries({ queryKey: ['environments'] });
    },
  });

  const environments = environmentsQuery.data ?? [];
  const visibleEnvironments = useMemo(
    () => filterEnvironments(environments, filter, currentOwner),
    [currentOwner, environments, filter],
  );
  const runningCount = environments.filter((env) => env.state === 'running').length;
  const busyCount = environments.filter(hasInFlightTask).length;

  const commitOwner = () => {
    const nextOwner = ownerDraft.trim() || currentOwner;
    setOwnerDraft(nextOwner);
    setCurrentOwner(nextOwner);
    saveOwnerPreference(nextOwner);
  };

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <Boxes size={24} />
        </div>
        <nav aria-label="环境筛选">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              className={filter === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setFilter(item.key)}
            >
              <Filter size={15} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PST SELF SERVICE</p>
            <h1>PST 环境平台</h1>
          </div>
          <div className="topbar-actions">
            <label className="owner-control">
              <UserRound size={14} />
              <span>归属</span>
              <input
                id="current-owner"
                name="currentOwner"
                value={ownerDraft}
                autoComplete="username"
                onChange={(event) => setOwnerDraft(event.target.value)}
                onBlur={commitOwner}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
            <Metric label="运行" value={runningCount} />
            <Metric label="任务" value={busyCount} />
            <button className="primary-button" onClick={() => setCreateOpen(true)}>
              <Plus size={17} />
              创建环境
            </button>
          </div>
        </header>

        <section className="list-toolbar">
          <div>
            <strong>{visibleEnvironments.length}</strong>
            <span> 套环境</span>
          </div>
          {environmentsQuery.isFetching ? <span className="sync-pill">同步中</span> : <span className="sync-pill">已同步</span>}
        </section>

        <section className="env-grid" aria-label="环境列表">
          {visibleEnvironments.map((env) => (
            <EnvironmentCard
              key={env.id}
              env={env}
              onAction={(action) => {
                if (action === 'destroy' || action === 'update-images') {
                  setPendingConfirmation({ env, action });
                  return;
                }
                actionMutation.mutate({ env, action });
              }}
              onChangeTag={(targetEnv) => setPendingTagEnv(targetEnv)}
              onOpenDetail={(targetEnv) => setDetailEnv(targetEnv)}
              onOpenLogs={(targetEnv) => {
                setLogsEnv(targetEnv);
                setLogsService(DEFAULT_LOG_SERVICE);
              }}
              onOpenTask={(taskId) => setActiveTask({ envId: env.id, taskId })}
            />
          ))}
          {!environmentsQuery.isLoading && visibleEnvironments.length === 0 ? (
            <div className="empty-state">
              <Server size={24} />
              <span>暂无环境</span>
            </div>
          ) : null}
        </section>
      </section>

      <CreateEnvironmentDialog
        open={createOpen}
        isPending={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <ConfirmActionDialog
        open={Boolean(pendingConfirmation)}
        env={pendingConfirmation?.env ?? null}
        action={pendingConfirmation?.action ?? null}
        isPending={actionMutation.isPending}
        onClose={() => setPendingConfirmation(null)}
        onConfirm={(action) => {
          if (!pendingConfirmation) {
            return;
          }
          actionMutation.mutate({ env: pendingConfirmation.env, action });
          setPendingConfirmation(null);
        }}
      />

      <ImageTagDialog
        open={Boolean(pendingTagEnv)}
        env={pendingTagEnv}
        isPending={changeTagMutation.isPending}
        onClose={() => setPendingTagEnv(null)}
        onSubmit={(imageTag) => {
          if (!pendingTagEnv) {
            return;
          }
          changeTagMutation.mutate({ env: pendingTagEnv, imageTag });
        }}
      />

      <EnvironmentDetailDrawer
        detail={environmentDetailQuery.data ?? null}
        envName={detailEnv?.name}
        isLoading={environmentDetailQuery.isFetching}
        error={environmentDetailQuery.error instanceof Error ? environmentDetailQuery.error : null}
        onClose={() => setDetailEnv(null)}
        onRefresh={() => void environmentDetailQuery.refetch()}
        onOpenServiceLogs={(service) => {
          if (!detailEnv) {
            return;
          }
          setLogsEnv(detailEnv);
          setLogsService(service);
        }}
      />

      <ContainerLogsDrawer
        env={logsEnv}
        service={logsService}
        tail={DEFAULT_LOG_TAIL}
        logs={containerLogsQuery.data?.logs ?? ''}
        isLoading={containerLogsQuery.isFetching}
        error={containerLogsQuery.error instanceof Error ? containerLogsQuery.error : null}
        onClose={() => setLogsEnv(null)}
        onRefresh={() => void containerLogsQuery.refetch()}
        onServiceChange={(service) => setLogsService(service)}
      />

      <TaskDrawer
        taskId={activeTask?.taskId ?? null}
        onClose={() => {
          setActiveTask(null);
          void queryClient.invalidateQueries({ queryKey: ['environments'] });
        }}
      />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EnvironmentCard({
  env,
  onAction,
  onChangeTag,
  onOpenDetail,
  onOpenLogs,
  onOpenTask,
}: {
  env: Environment;
  onAction: (action: EnvironmentAction) => void;
  onChangeTag: (env: Environment) => void;
  onOpenDetail: (env: Environment) => void;
  onOpenLogs: (env: Environment) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const actions: Array<{ key: EnvironmentAction; label: string; icon: ReactNode }> = [
    { key: 'start', label: '启动', icon: <Play size={15} /> },
    { key: 'stop', label: '停止', icon: <Square size={15} /> },
    { key: 'restart', label: '重启', icon: <RotateCcw size={15} /> },
    { key: 'wipe', label: '清档', icon: <Archive size={15} /> },
    { key: 'update-images', label: '更新镜像', icon: <RefreshCw size={15} /> },
    { key: 'destroy', label: '销毁', icon: <Trash2 size={15} /> },
  ];
  const tagDisabledReason = actionDisabledReason('update-images', env);
  const logsDisabledReason = env.state === 'destroyed' ? '当前状态不可用' : null;

  return (
    <article className="env-card">
      <div className="env-card-top">
        <div>
          <h2>{env.name}</h2>
          <p>
            <UserRound size={14} />
            {env.owner || '-'}
          </p>
        </div>
        <span className={`state state-${env.state}`}>{stateLabel(env.state)}</span>
      </div>

      <div className="env-meta">
        <span>slot {env.slot}</span>
        <span>{env.imageTag}</span>
        {env.latestTask ? (
          hasInFlightTask(env) ? (
            <span className="task-badge">进行中: {env.latestTask.type}</span>
          ) : (
            <button className="task-link" onClick={() => onOpenTask(env.latestTask!.id)}>
              {env.latestTask.type}
            </button>
          )
        ) : null}
      </div>

      <div className="port-grid">
        {Object.entries(env.ports).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {env.latestTask?.status === 'failed' ? (
        <div className="inline-alert">
          <CircleAlert size={15} />
          {env.latestTask.error ?? '任务失败'}
        </div>
      ) : null}

      <div className="action-row">
        <button
          className="icon-button"
          title="查看环境详情"
          onClick={() => onOpenDetail(env)}
        >
          <Info size={15} />
        </button>
        <button
          className="icon-button"
          disabled={Boolean(logsDisabledReason)}
          title={logsDisabledReason ?? '查看容器日志'}
          onClick={() => onOpenLogs(env)}
        >
          <FileText size={15} />
        </button>
        <button
          className="icon-button"
          disabled={Boolean(tagDisabledReason)}
          title={tagDisabledReason ?? '切换镜像 tag'}
          onClick={() => onChangeTag(env)}
        >
          <Tag size={15} />
        </button>
        {actions.map((action) => {
          const disabledReason = actionDisabledReason(action.key, env);
          return (
            <button
              key={action.key}
              className={action.key === 'destroy' ? 'icon-button danger' : 'icon-button'}
              disabled={Boolean(disabledReason)}
              title={disabledReason ?? action.label}
              onClick={() => onAction(action.key)}
            >
              {action.icon}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function stateLabel(state: Environment['state']): string {
  const labels: Record<Environment['state'], string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    failed: '失败',
    destroying: '销毁中',
    destroyed: '已销毁',
  };
  return labels[state];
}
