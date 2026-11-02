import { create } from "zustand";
import axios from "axios";

const API = {
  GET_STATS: "/api/dashboard/stats",
};

export interface DashboardStats {
  stickers: { total: number; registered: number; in_stock: number };
  warranties: { total: number; active: number; expired: number };
  complaints: { total: number; new_count: number; assigned_count: number; closed_count: number };
  dealers: { total: number; approved: number };
  recentWarranties: any[];
  recentComplaints: any[];
}

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;

  fetchStats: () => Promise<DashboardStats | null>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  isLoading: false,
  error: null,

  fetchStats: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET_STATS, {});
      const { stats } = res.data;
      set({ stats, isLoading: false });
      return stats;
    } catch (err: any) {
      set({ isLoading: false, error: "Failed to load dashboard metrics" });
      return null;
    }
  },
}));
