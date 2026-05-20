import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, setUnauthorizedHandler } from './api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('apiFetch', () => {
  it('attaches Authorization header when token present', async () => {
    window.localStorage.setItem('bdo_token', 'abc');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/api/test');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });

  it('omits Authorization header when no token', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/api/test');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('throws ApiError with payload error message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 400 }),
    );
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      status: 400,
      message: 'nope',
    });
  });

  it('invokes unauthorized handler on 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(apiFetch('/api/test')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });
});
