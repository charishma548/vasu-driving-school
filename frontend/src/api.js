import { API_URL } from './config';

const TOKEN_KEY = 'vasu_token';

// The login token is kept in the browser so staff stay logged in.
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing can block storage; the app still works for this visit.
  }
}

// All frontend -> backend requests are kept in one place.
// If the backend URL changes, update VITE_API_URL in .env.
export async function api(path, options = {}) {
  const token = getToken();
  let response;

  try {
    response = await fetch(API_URL + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(
      'Cannot reach the server. Check your internet connection and try again.'
    );
  }

  const body = await response.json().catch(() => ({}));

  if (response.status === 401 && path !== '/login') {
    // The login expired or the password was changed: show the login screen.
    setToken('');
    window.dispatchEvent(new Event('vasu:logout'));
  }

  if (!response.ok) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }

  return body;
}
