// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContainerLogsDrawer } from './ContainerLogsDrawer';
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

describe('ContainerLogsDrawer', () => {
  it('shows logs, switches service, and refreshes', () => {
    const onServiceChange = vi.fn();
    const onRefresh = vi.fn();
    render(
      <ContainerLogsDrawer
        env={env}
        service="tgateserver"
        tail={300}
        logs="tgateserver line 1"
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={onRefresh}
        onServiceChange={onServiceChange}
      />,
    );

    expect(screen.getByRole('complementary', { name: '容器日志' })).toBeInTheDocument();
    expect(screen.getByText('tgateserver line 1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('服务'), { target: { value: 'gameserver' } });
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    expect(onServiceChange).toHaveBeenCalledWith('gameserver');
    expect(onRefresh).toHaveBeenCalled();
  });
});
