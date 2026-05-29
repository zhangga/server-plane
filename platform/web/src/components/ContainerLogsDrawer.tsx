import { RefreshCw, X } from 'lucide-react';
import type { ContainerLogService, Environment } from '../types';

export const CONTAINER_LOG_SERVICES: ContainerLogService[] = [
  'tgateserver',
  'gameserver',
  'scenexserver',
  'globalserver',
  'matcherserver',
  'redis',
  'mongodb',
  'etcd',
  'etcd-init',
];

interface ContainerLogsDrawerProps {
  env: Environment | null;
  service: ContainerLogService;
  tail: number;
  logs: string;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onRefresh: () => void;
  onServiceChange: (service: ContainerLogService) => void;
}

export function ContainerLogsDrawer({
  env,
  service,
  tail,
  logs,
  isLoading,
  error,
  onClose,
  onRefresh,
  onServiceChange,
}: ContainerLogsDrawerProps) {
  if (!env) {
    return null;
  }

  return (
    <aside className="task-drawer" aria-label="容器日志">
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{env.name}</p>
          <h2>容器日志</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-controls">
        <label>
          服务
          <select
            value={service}
            onChange={(event) => onServiceChange(event.target.value as ContainerLogService)}
          >
            {CONTAINER_LOG_SERVICES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      <div className={error ? 'drawer-status status-failed' : 'drawer-status'}>
        {error ? 'failed' : isLoading ? 'loading' : `tail ${tail}`}
      </div>

      {error ? (
        <div className="inline-alert">{error.message}</div>
      ) : (
        <pre className="log-view">{isLoading ? 'loading logs...' : logs || '暂无日志'}</pre>
      )}
    </aside>
  );
}
