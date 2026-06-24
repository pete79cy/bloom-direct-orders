import { describe, it, expect } from 'vitest';
import { normalizeCyprusPhone } from './phone';

describe('normalizeCyprusPhone', () => {
  it('prepends +357 to a bare 8-digit mobile (starts 9)', () => {
    expect(normalizeCyprusPhone('99123456')).toBe('+35799123456');
  });

  it('prepends +357 to a bare 8-digit landline (starts 2)', () => {
    expect(normalizeCyprusPhone('22123456')).toBe('+35722123456');
  });

  it('keeps an already +357 number, stripping spaces', () => {
    expect(normalizeCyprusPhone('+357 99 123456')).toBe('+35799123456');
  });

  it('converts a 00357 prefix to +357', () => {
    expect(normalizeCyprusPhone('0035799123456')).toBe('+35799123456');
  });

  it('handles a 357-prefixed number without +', () => {
    expect(normalizeCyprusPhone('35799123456')).toBe('+35799123456');
  });

  it('returns empty string for null/empty/garbage', () => {
    expect(normalizeCyprusPhone(null)).toBe('');
    expect(normalizeCyprusPhone('')).toBe('');
    expect(normalizeCyprusPhone('   ')).toBe('');
  });

  it('falls back to +<digits> for an unrecognised foreign number', () => {
    expect(normalizeCyprusPhone('00491701234567')).toBe('+491701234567');
  });
});
