import { describe, expect, it } from 'vitest';
import { assertCanRunTask, taskTypeForAction } from '../src/domain/stateMachine.js';
import { AppError } from '../src/domain/errors.js';

describe('state machine', () => {
  it('maps UI actions to task types', () => {
    expect(taskTypeForAction('start')).toBe('env.start');
    expect(taskTypeForAction('update-images')).toBe('env.update_images');
    expect(taskTypeForAction('destroy')).toBe('env.destroy');
  });

  it('allows only state-compatible lifecycle tasks', () => {
    expect(() => assertCanRunTask('env.stop', 'running')).not.toThrow();
    expect(() => assertCanRunTask('env.start', 'stopped')).not.toThrow();
    expect(() => assertCanRunTask('env.start', 'failed')).not.toThrow();
    expect(() => assertCanRunTask('env.wipe', 'stopped')).not.toThrow();
    expect(() => assertCanRunTask('env.destroy', 'failed')).not.toThrow();

    expect(() => assertCanRunTask('env.start', 'running')).toThrow(AppError);
    expect(() => assertCanRunTask('env.destroy', 'destroyed')).toThrow(AppError);
  });
});
