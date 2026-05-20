import { apiFetch } from './api';
import type { AuthUser, LoginResponse } from '@/types';

const TOKEN_KEY = 'bdo_token';
const USER_KEY = 'bdo_user';

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = window.localStorage.getItem(USER_KEY) ?? window.sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<AuthUser> {
  const res = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe }),
  });
  const store = rememberMe ? window.localStorage : window.sessionStorage;
  const other = rememberMe ? window.sessionStorage : window.localStorage;
  other.removeItem(TOKEN_KEY);
  other.removeItem(USER_KEY);
  store.setItem(TOKEN_KEY, res.token);
  store.setItem(USER_KEY, JSON.stringify(res.user));
  return res.user;
}

export function logout(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}
