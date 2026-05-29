// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { loadOwnerPreference, saveOwnerPreference } from './ownerPreference';

describe('owner preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to qa when no owner is stored', () => {
    expect(loadOwnerPreference()).toBe('qa');
  });

  it('trims and persists owner names', () => {
    saveOwnerPreference(' alice ');

    expect(loadOwnerPreference()).toBe('alice');
  });
});
