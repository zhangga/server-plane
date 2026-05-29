import { FileText, RefreshCw, X } from 'lucide-react';
import type { ContainerLogService, EnvironmentDetail, EnvironmentServiceDetail } from '../types';

interface EnvironmentDetailDrawerProps {
  detail: EnvironmentDetail | null;
  envName?: string;
  isLoading: boolean;
  error: Error | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenServiceLogs: (service: ContainerLogService) => void;
}

export function EnvironmentDetailDrawer({
  detail,
  envName,
  isLoading,
  error,
  onClose,
  onRefresh,
  onOpenServiceLogs,
}: EnvironmentDetailDrawerProps) {
  if (!detail && !isLoading && !error) {
    return null;
  }

  const title = detail?.environment.name ?? envName ?? '环境详情';

  return (
    <aside className="detail-drawer" aria-label="环境详情">
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>环境详情</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-controls">
        <button className="primary-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      {error ? <div className="inline-alert">{error.message}</div> : null}
      {isLoading && !detail ? <div className="drawer-status">loading</div> : null}

      {detail ? (
        <div className="detail-content">
          <section className="detail-section" aria-label="运行信息">
            <InfoRow label="compose project" value={detail.composeProject} />
            <InfoRow label="runtime" value={detail.runtimePath} />
            <InfoRow label="compose file" value={detail.composeFile} />
            <InfoRow label="latest task" value={detail.environment.latestTask?.type ?? '-'} />
            <InfoRow label="task status" value={detail.environment.latestTask?.status ?? '-'} />
          </section>

          <section className="detail-section" aria-label="服务状态">
            <div className="service-status-list">
              {detail.services.map((service) => (
                <ServiceStatusRow
                  key={service.service}
                  service={service}
                  onOpenLogs={() => onOpenServiceLogs(service.service)}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ServiceStatusRow({
  service,
  onOpenLogs,
}: {
  service: EnvironmentServiceDetail;
  onOpenLogs: () => void;
}) {
  return (
    <div className={service.missing ? 'service-status-row missing' : 'service-status-row'}>
      <div>
        <strong>{service.service}</strong>
        <span>{service.containerName ?? 'missing'}</span>
      </div>
      <div>
        <span>{service.state}</span>
        <strong>{service.health ?? service.status}</strong>
      </div>
      <div>
        <span>host</span>
        <strong>{service.hostPort ?? '-'}</strong>
      </div>
      <button className="icon-button" type="button" onClick={onOpenLogs} title={`查看 ${service.service} 日志`}>
        <FileText size={15} />
      </button>
    </div>
  );
}
