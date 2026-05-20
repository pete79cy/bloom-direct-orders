import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login, logout, getToken, getUser, isLoggedIn } from './auth';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const okResponse = () =>
  new Response(
    JSON.stringify({
      token: 't1',
      user: { id: 'u1', email: 'a@b.c', name: 'A' },
    }),
    { status: 200 },
  );

describe('auth', () => {
  it('login stores token in localStorage when rememberMe is true', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await login('a@b.c', 'pw', true);
    expect(window.localStorage.getItem('bdo_token')).toBe('t1');
    expect(window.sessionStorage.getItem('bdo_token')).toBeNull();
  });

  it('login stores token in sessionStorage when rememberMe is false', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await login('a@b.c', 'pw', false);
    expect(window.sessionStorage.getItem('bdo_token')).toBe('t1');
    expect(window.localStorage.getItem('bdo_token')).toBeNull();
  });

  it('logout clears both storages', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await login('a@b.c', 'pw', true);
    logout();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });
});
