import { create } from "zustand";
import axios from "axios";

const API = {
  GET: "/api/admin/users/get",
  ADD: "/api/admin/users/add",
  UPDATE: "/api/admin/users/update",
  DELETE: "/api/admin/users/delete",
};

export type UserRole = "SUPER" | "HO" | "MANAGER" | "ENGINEER" | "DEALER" | "CUSTOMER";

export interface AppUser {
  UserId: string;
  Username: string;
  FirstName: string;
  LastName?: string | null;
  Email?: string | null;
  Phone?: string | null;
  Role: UserRole;
  IsActive: boolean;
  IsAdmin: boolean;
  LastLogin?: string | null;
  InsertedOn: string;
  LastUpdatedOn: string;
  StateRights?: string | null;
  DistrictRights?: string | null;
  FormRights?: string | null;
  ServiceCenterId?: string | null;
}

/** Access rights sent with add / update; arrays are stored comma-separated, empty = all. */
export interface UserRightsPayload {
  StateRights?: string[];
  DistrictRights?: string[];
  FormRights?: string[];
  ServiceCenterId?: string | null;
}

export interface CreateUserPayload extends UserRightsPayload {
  Username: string;
  Password: string;
  FirstName: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  Role: UserRole;
  IsActive?: boolean;
  IsAdmin?: boolean;
}

export interface UpdateUserPayload extends UserRightsPayload {
  UserId: string;
  FirstName: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  Role: UserRole;
  IsActive: boolean;
  IsAdmin: boolean;
  Password?: string; // Only set if changing password
}

interface UserManagementState {
  users: AppUser[];
  isLoading: boolean;
  error: string | null;

  fetchUsers: (filters?: { search?: string; role?: string; activeOnly?: boolean }) => Promise<void>;
  addUser: (payload: CreateUserPayload) => Promise<AppUser>;
  updateUser: (payload: UpdateUserPayload) => Promise<AppUser>;
  deleteUser: (UserId: string) => Promise<void>;
  clearError: () => void;
}

export const useUserStore = create<UserManagementState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET, filters);
      set({ users: res.data.users || [], isLoading: false });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Failed to fetch users";
      set({ error: msg, isLoading: false });
    }
  },

  addUser: async (payload) => {
    const res = await axios.post(API.ADD, payload);
    const newUser: AppUser = res.data.user;
    set((state) => ({
      users: [newUser, ...state.users].sort((a, b) =>
        a.FirstName.localeCompare(b.FirstName)
      ),
    }));
    return newUser;
  },

  updateUser: async (payload) => {
    const res = await axios.post(API.UPDATE, payload);
    const updated: AppUser = res.data.user;
    set((state) => ({
      users: state.users.map((u) => (u.UserId === updated.UserId ? updated : u)),
    }));
    return updated;
  },

  deleteUser: async (UserId) => {
    await axios.post(API.DELETE, { UserId });
    set((state) => ({
      users: state.users.filter((u) => u.UserId !== UserId),
    }));
  },

  clearError: () => set({ error: null }),
}));
