import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle auth errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const msg = err.response?.data?.message || '';

      if (msg === 'SESSION_SUPERSEDED') {
        // Another device/browser logged in — show a clear message
        useAuthStore.getState().clearAuth();
        toast.error(
          'You have been logged out because your account was signed in on another device or browser.',
          { duration: 6000, id: 'session-superseded' }
        );
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } else {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
      return Promise.reject(err);
    }

    const msg = err.response?.data?.message || 'An error occurred';
    toast.error(msg);
    return Promise.reject(err);
  }
);

export default api;

// Typed helper for downloading blob (Excel reports)
export async function downloadReport(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
