import { describe, it, expect, beforeEach } from 'vitest';
import { readInitialTheme } from '../theme/ThemeContext';

describe('theme', () => {
  beforeEach(() => localStorage.clear());
  it('defaults to light when unset', () => {
    expect(readInitialTheme()).toBe('light');
  });
  it('reads persisted value', () => {
    localStorage.setItem('PV_THEME', 'dark');
    expect(readInitialTheme()).toBe('dark');
  });
  it('ignores invalid value', () => {
    localStorage.setItem('PV_THEME', 'purple');
    expect(readInitialTheme()).toBe('light');
  });
});
