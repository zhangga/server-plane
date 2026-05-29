import { useState } from 'react';
import { X } from 'lucide-react';
import type { CreateEnvironmentInput } from '../types';

interface CreateEnvironmentDialogProps {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEnvironmentInput) => void;
}

export function CreateEnvironmentDialog({ open, isPending, onClose, onSubmit }: CreateEnvironmentDialogProps) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="dialog"
        aria-label="创建环境"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name: name.trim(), owner: owner.trim() });
        }}
      >
        <div className="dialog-header">
          <h2>创建环境</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <label>
          环境名
          <input
            id="environment-name"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="alice-dev"
          />
        </label>
        <label>
          归属
          <input
            id="environment-owner"
            name="owner"
            autoComplete="username"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="alice"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={isPending || !name.trim() || !owner.trim()}>
            创建
          </button>
        </div>
      </form>
    </div>
  );
}
