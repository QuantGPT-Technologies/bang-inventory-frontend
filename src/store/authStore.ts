import { create } from 'zustand';
import { User } from '@/lib/types';
import { storeAuth, clearAuth, getStoredUser, getStoredToken } from '@/lib/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True once initialize() has run at least once; guards against a premature redirect-to-login flash. */
  hasHydrated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  hasHydrated: false,

  login: (token, user) => {
    storeAuth(token, user);
    set({ token, user, isAuthenticated: true, hasHydrated: true });
  },

  logout: () => {
    clearAuth();
    set({ token: null, user: null, isAuthenticated: false, hasHydrated: true });
  },

  initialize: () => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (token && user) {
      set({ token, user, isAuthenticated: true, hasHydrated: true });
    } else {
      set({ hasHydrated: true });
    }
  },
}));
