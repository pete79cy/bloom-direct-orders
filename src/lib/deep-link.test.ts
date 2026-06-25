import { describe, it, expect } from 'vitest';
import { readDeepLinkParam } from './deep-link';

describe('readDeepLinkParam', () => {
  it('decodes a normal URL-encoded value', () => {
    const params = new URLSearchParams('name=Foo%20Gardens&email=foo%40bar.gr');
    expect(readDeepLinkParam(params, 'name')).toBe('Foo Gardens');
    expect(readDeepLinkParam(params, 'email')).toBe('foo@bar.gr');
  });

  it('fixes literal %20 left by iOS Shortcuts name templates', () => {
    const params = new URLSearchParams();
    params.set('name', 'Παναγιώτης%20');
    expect(readDeepLinkParam(params, 'name')).toBe('Παναγιώτης');
  });

  it('turns plus signs into spaces', () => {
    const params = new URLSearchParams('name=Foo+Bar');
    expect(readDeepLinkParam(params, 'name')).toBe('Foo Bar');
  });

  it('returns empty string for missing keys', () => {
    expect(readDeepLinkParam(new URLSearchParams(), 'phone')).toBe('');
  });
});
