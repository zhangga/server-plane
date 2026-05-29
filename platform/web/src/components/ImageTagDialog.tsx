import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Environment } from '../types';

interface ImageTagDialogProps {
  open: boolean;
  env: Environment | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (imageTag: string) => void;
}

export function ImageTagDialog({ open, env, isPending, onClose, onSubmit }: ImageTagDialogProps) {
  const [imageTag, setImageTag] = useState('');

  useEffect(() => {
    setImageTag(env?.imageTag ?? '');
  }, [open, env?.id, env?.imageTag]);

  if (!open || !env) {
    return null;
  }

  const trimmedTag = imageTag.trim();
  const canSubmit = !isPending && trimmedTag.length > 0 && trimmedTag !== env.imageTag;

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="dialog"
        aria-label="切换镜像 tag"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit(trimmedTag);
          }
        }}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{env.name}</p>
            <h2>切换镜像 tag</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <label>
          镜像 tag
          <input
            name="imageTag"
            autoComplete="off"
            value={imageTag}
            onChange={(event) => setImageTag(event.target.value)}
            placeholder={env.imageTag}
          />
        </label>

        <div className="warning-panel">
          <AlertTriangle size={16} />
          <span>这会拉取新 tag 的 5 个服务镜像，并重启本环境。</span>
        </div>

        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={!canSubmit}>
            应用并更新
          </button>
        </div>
      </form>
    </div>
  );
}
