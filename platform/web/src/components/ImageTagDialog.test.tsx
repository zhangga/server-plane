// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageTagDialog } from './ImageTagDialog';
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

describe('ImageTagDialog', () => {
  it('submits a trimmed replacement image tag for the selected environment', () => {
    const onSubmit = vi.fn();
    render(
      <ImageTagDialog
        open
        env={env}
        isPending={false}
        onClose={() => undefined}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText('镜像 tag');
    expect(input).toHaveValue('master-latest');

    fireEvent.change(input, { target: { value: ' feature-456 ' } });
    fireEvent.click(screen.getByRole('button', { name: '应用并更新' }));

    expect(onSubmit).toHaveBeenCalledWith('feature-456');
  });
});
