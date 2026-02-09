import { clearAccessToken, getAccessToken } from '@/lib/auth/token-store';

function handleAuthRedirect(code?: string, status?: number): boolean {
  if (!code && status !== 401 && status !== 403) {
    return false;
  }
  const isAuthError = code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID';
  if (!isAuthError && status !== 401 && status !== 403) {
    return false;
  }
  clearAccessToken();
  if (typeof window !== 'undefined') {
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }
  return true;
}

export async function apiFetch<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('content-type', headers.get('content-type') ?? 'application/json');
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (handleAuthRedirect(json?.error?.code, response.status)) {
      throw new Error('');
    }
    const message = json?.error?.message ?? 'リクエストに失敗しました。';
    throw new Error(message);
  }

  return json as T;
}

export async function apiFetchForm<T>(url: string, formData: FormData): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (handleAuthRedirect(json?.error?.code, response.status)) {
      throw new Error('');
    }
    throw new Error(json?.error?.message ?? 'リクエストに失敗しました。');
  }

  return json as T;
}
