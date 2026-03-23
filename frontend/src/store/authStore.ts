import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'admin' | 'creator' | 'approver_1' | 'approver_2';
  mustChangePwd: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  updateToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      isAuthenticated: false,
      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
      updateToken: (accessToken) => set({ accessToken }),
    }),
    { name: 'nps-auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken, isAuthenticated: s.isAuthenticated }) }
  )
);

// Role helpers
export const canCreate = (role?: string) => role === 'admin' || role === 'creator';
export const canApprove1 = (role?: string) => role === 'admin' || role === 'approver_1';
export const canApprove2 = (role?: string) => role === 'admin' || role === 'approver_2';
export const isAdmin = (role?: string) => role === 'admin';
