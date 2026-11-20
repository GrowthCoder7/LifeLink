const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const SESSION_KEY = 'lifelink.session';

export class ApiError extends Error {
  constructor(status, body) {
    super(body.error || `Request failed (${status})`);
    this.status = status;
    this.field = body.field;
  }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.assign('/login');
}

// fetch wrapper for the gateway: JSON in/out, attaches the JWT, logs out on 401.
export async function api(path, { method = 'GET', body } = {}) {
  const session = getSession();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && session) {
    logout();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return data;
}

export async function login(email, password) {
  const session = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  saveSession(session);
  return session.user;
}

export const HOME_BY_ROLE = {
  DONOR: '/donor',
  HOSPITAL_STAFF: '/hospital',
  BLOODBANK_STAFF: '/bank',
  ADMIN: '/admin',
};
