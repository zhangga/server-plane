// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import type { Environment } from '../types';

const env: Environment = {
  id: 'env_1',
  name: 'alice-dev',
  owner: 'alice',
  slot: 1,
  imageTag: 'master-latest',
  state: 'running',
  createdAt: '',
  updatedAt: '',
  ports: {
    tgate: 20101,
    gameserver: 20110,
    matcher: 20120,
    global: 20130,
    scenex: 20150,
    mongo: 20117,
    redis: 20179,
  },
  latestTask: null,
};

describe('ConfirmActionDialog', () => {
  it('requires the environment name before confirming destroy', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        open
        action="destroy"
        env={env}
        isPending={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    const button = screen.getByRole('button', { name: '确认销毁' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('输入环境名'), { target: { value: 'alice-dev' } });
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledWith('destroy');
  });

  it('shows the image update side effect before confirming update-images', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        open
        action="update-images"
        env={env}
        isPending={false}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/其他使用同一 tag 的环境/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认更新' }));

    expect(onConfirm).toHaveBeenCalledWith('update-images');
  });
});
