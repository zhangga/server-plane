// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EnvironmentDetailDrawer } from './EnvironmentDetailDrawer';
import type { EnvironmentDetail } from '../types';

const detail: EnvironmentDetail = {
  composeProject: 'pst-alice-dev',
  runtimePath: '/data00/pst-platform/runtime/alice-dev',
  composeFile: '/data00/pst-platform/runtime/alice-dev/docker-compose.yml',
  environment: {
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
    latestTask: {
      id: 'task_1',
      type: 'env.create',
      status: 'succeeded',
      createdAt: '',
      startedAt: '',
      finishedAt: '',
      error: null,
    },
  },
  services: [
    {
      service: 'tgateserver',
      containerName: 'pst-alice-dev-tgateserver-1',
      image: 'harbor-sh.dailygn.com/pst/tgateserver:master-latest',
      state: 'running',
      status: 'Up 2 minutes',
      health: 'healthy',
      exitCode: null,
      hostPort: 20101,
      publishedPorts: [{ publishedPort: 20101, targetPort: 12001, protocol: 'tcp' }],
      missing: false,
    },
    {
      service: 'gameserver',
      containerName: null,
      image: null,
      state: 'missing',
      status: 'missing',
      health: null,
      exitCode: null,
      hostPort: 20110,
      publishedPorts: [],
      missing: true,
    },
  ],
};

describe('EnvironmentDetailDrawer', () => {
  it('shows compose metadata, service health, and opens service logs', () => {
    const onOpenServiceLogs = vi.fn();
    render(
      <EnvironmentDetailDrawer
        detail={detail}
        isLoading={false}
        error={null}
        onClose={() => undefined}
        onRefresh={() => undefined}
        onOpenServiceLogs={onOpenServiceLogs}
      />,
    );

    expect(screen.getByRole('complementary', { name: '环境详情' })).toBeInTheDocument();
    expect(screen.getByText('pst-alice-dev')).toBeInTheDocument();
    expect(screen.getByText('/data00/pst-platform/runtime/alice-dev')).toBeInTheDocument();
    expect(screen.getByText('tgateserver')).toBeInTheDocument();
    expect(screen.getByText('healthy')).toBeInTheDocument();
    expect(screen.getByText('gameserver')).toBeInTheDocument();
    expect(screen.getAllByText('missing').length).toBeGreaterThan(0);
    expect(screen.getByText('env.create')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 tgateserver 日志' }));

    expect(onOpenServiceLogs).toHaveBeenCalledWith('tgateserver');
  });
});
