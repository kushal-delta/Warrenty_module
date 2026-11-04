import { create } from "zustand";
import axios from "axios";

const API = {
  GET: "/api/service/jobcards/get",
  DETAIL: "/api/service/jobcards/detail",
  SAVE: "/api/service/jobcards/save",
  DECIDE: "/api/service/jobcards/decide",
  CLOSE: "/api/service/jobcards/close",
  DELETE: "/api/service/jobcards/delete",
};

export interface JobCard {
  JobCardId: string;
  JobCardNo: string;
  JobCardDate: string;
  ComplaintId: string;
  ComplaintNo: string;
  CustomerName: string;
  Mobile: string;
  EngineerName?: string;
  ServiceCenterName?: string;
  ServiceCenterId?: string;
  Status: string;
  CurrentLevel: number;
  LevelsRequired: number;
  LevelPosition: number;
  PendingRole?: string;
  CanAct: boolean;
  SparesTotal: number;
  LabourTotal: number;
  TotalEstimate: number;
  WarrantyAmount: number;
  CustomerPayable: number;
  Remarks?: string;
  [key: string]: any;
}

export interface JobCardDetail {
  jobCard: JobCard;
  faults: any[];
  items: any[];
  approvals: any[];
  levels: any[];
  photos: any[];
  components: any[];
}

interface JobCardState {
  jobCards: JobCard[];
  isLoading: boolean;
  fetchJobCards: (filters?: any) => Promise<JobCard[]>;
  fetchJobCardDetail: (id: string) => Promise<JobCardDetail>;
  saveJobCard: (payload: any) => Promise<{ jobCard: JobCard; restarted: boolean }>;
  decideJobCard: (payload: { JobCardId: string; action: "Submit" | "Approved" | "Rejected"; remarks?: string }) => Promise<{ status: string; message: string }>;
  closeJobCard: (payload: { JobCardId: string; remarks?: string; resolveCall?: boolean }) => Promise<void>;
  deleteJobCard: (id: string) => Promise<void>;
}

export const useJobCardStore = create<JobCardState>((set, get) => ({
  jobCards: [],
  isLoading: false,

  fetchJobCards: async (filters = {}) => {
    set({ isLoading: true });
    try {
      const res = await axios.post(API.GET, filters);
      set({ jobCards: res.data.jobCards });
      return res.data.jobCards;
    } finally {
      set({ isLoading: false });
    }
  },
  fetchJobCardDetail: async (id) => (await axios.post(API.DETAIL, { JobCardId: id })).data,
  saveJobCard: async (payload) => (await axios.post(API.SAVE, payload)).data,
  decideJobCard: async (payload) => (await axios.post(API.DECIDE, payload)).data,
  closeJobCard: async (payload) => { await axios.post(API.CLOSE, payload); },
  deleteJobCard: async (id) => { await axios.post(API.DELETE, { JobCardId: id }); await get().fetchJobCards(); },
}));
