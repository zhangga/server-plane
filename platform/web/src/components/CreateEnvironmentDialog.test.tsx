// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog';

describe('CreateEnvironmentDialog', () => {
  it('submits name, owner, and image tag', () => {
    const onSubmit = vi.fn();
    render(<CreateEnvironmentDialog open onClose={() => undefined} onSubmit={onSubmit} isPending={false} />);

    expect(screen.getByLabelText('镜像 tag')).toHaveValue('master-latest');
    fireEvent.change(screen.getByLabelText('环境名'), { target: { value: 'alice-dev' } });
    fireEvent.change(screen.getByLabelText('归属'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('镜像 tag'), { target: { value: 'feature-123' } });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'alice-dev', owner: 'alice', imageTag: 'feature-123' });
  });
});
