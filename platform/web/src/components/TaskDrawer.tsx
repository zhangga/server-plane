import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface TaskDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'succeeded' | 'failed'>('idle');

  useEffect(() => {
    if (!taskId) {
      setLines([]);
      setStatus('idle');
      return;
    }

    setLines([]);
    setStatus('running');
    const source = new EventSource(`/api/tasks/${taskId}/logs`);

    source.addEventListener('log', (event) => {
      setLines((current) => [...current, event.data]);
    });
    source.addEventListener('done', (event) => {
      const data = JSON.parse(event.data) as { status: 'succeeded' | 'failed' };
      setStatus(data.status);
      source.close();
    });
    source.onerror = () => {
      setStatus('failed');
      source.close();
    };

    return () => source.close();
  }, [taskId]);

  if (!taskId) {
    return null;
  }

  return (
    <aside className="task-drawer" aria-label="任务日志">
      <div className="drawer-header">
        <div>
          <p className="eyebrow">{taskId}</p>
          <h2>任务日志</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className={`drawer-status status-${status}`}>{status}</div>
      <pre className="log-view">{lines.length ? lines.join('\n') : 'waiting for logs...'}</pre>
    </aside>
  );
}
