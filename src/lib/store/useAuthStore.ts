import { create } from "zustand";
import axios from "axios";

const API = {
  LOGIN: "/api/Auth/login",
  LOGOUT: "/api/Auth/logout",
  GET_USER: "/api/Auth/getUser",
};

export interface AuthUser {
  UserId: string;
  Username: string;
  FirstName: string;
  LastName?: string | null;
  Email?: string | null;
  Phone?: string | null;
  Address?: string | null;
  Role: string;
  StateRights?: string | null;
  DistrictRights?: string | null;
  FormRights?: string | null;
  ServiceCenterId?: string | null;
  IsAdmin: boolean;
  IsActive?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: { username: string; password: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<AuthUser | null>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async ({ username, password }) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.LOGIN, { username, password });
      const { user, token } = res.data;

      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });

      return user;
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error || err.message || "Login failed. Please check credentials.";
      set({ error: errorMsg, isLoading: false, isAuthenticated: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      set({ isLoading: true });
      await axios.post(API.LOGOUT, {});
    } catch (_) {
      // Ignore network errors on logout
    } finally {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      if (typeof window !== "undefined") {
        // The full page reload clears any toast, so the login page shows it from this flag.
        try { window.sessionStorage.setItem("logoutNotice", "1"); } catch {}
        // replace(): Back must not return to a signed-in page
        window.location.replace("/login");
      }
    }
  },

  fetchCurrentUser: async () => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.GET_USER, {});
      const { user } = res.data;
      set({ user, isAuthenticated: true, isLoading: false });
      return user;
    } catch (err: any) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return null;
    }
  },

  clearError: () => set({ error: null }),
}));
