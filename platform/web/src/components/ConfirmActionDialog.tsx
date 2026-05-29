import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Environment, EnvironmentAction } from '../types';

type ConfirmableAction = Extract<EnvironmentAction, 'destroy' | 'update-images'>;

interface ConfirmActionDialogProps {
  open: boolean;
  action: ConfirmableAction | null;
  env: Environment | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (action: ConfirmableAction) => void;
}

export function ConfirmActionDialog({
  open,
  action,
  env,
  isPending,
  onClose,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [typedName, setTypedName] = useState('');

  useEffect(() => {
    setTypedName('');
  }, [open, env?.id, action]);

  if (!open || !action || !env) {
    return null;
  }

  const isDestroy = action === 'destroy';
  const canConfirm = !isPending && (!isDestroy || typedName === env.name);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="dialog" aria-label={isDestroy ? '销毁环境确认' : '更新镜像确认'}>
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{env.name}</p>
            <h2>{isDestroy ? '销毁环境' : '更新镜像'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        {isDestroy ? (
          <>
            <div className="warning-panel danger-copy">
              <AlertTriangle size={16} />
              <span>销毁会停止容器、删除 named volume，并移除 runtime 目录。</span>
            </div>
            <label>
              输入环境名
              <input
                name="confirmName"
                autoComplete="off"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder={env.name}
              />
            </label>
          </>
        ) : (
          <div className="warning-panel">
            <AlertTriangle size={16} />
            <span>
              这会拉取 5 个服务的最新 {env.imageTag} 镜像并重启本环境。其他使用同一 tag
              的环境下次启动时也会用到新镜像。
            </span>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={isDestroy ? 'primary-button danger-button' : 'primary-button'}
            disabled={!canConfirm}
            onClick={() => onConfirm(action)}
          >
            {isDestroy ? '确认销毁' : '确认更新'}
          </button>
        </div>
      </section>
    </div>
  );
}
