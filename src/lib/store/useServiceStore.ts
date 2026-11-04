import { create } from "zustand";
import axios from "axios";

const API = {
  GET_COMPLAINTS: "/api/service/complaints/get",
  ADD_COMPLAINT: "/api/service/complaints/add",
  ASSIGN_COMPLAINT: "/api/service/complaints/assign",
  CLOSE_COMPLAINT: "/api/service/complaints/close",
};

export interface Complaint {
  ComplaintId: string;
  ComplaintNo: string;
  CallDate: string;
  CallTypeId: string;
  CallTypeName?: string;
  ProjectId?: string;
  ProjectName?: string;
  Priority: string;
  Source: string;
  Status: string;
  InstallationId?: string;
  CustomerId?: string;
  CustomerName: string;
  Mobile: string;
  Address?: string;
  Village?: string;
  District?: string;
  StateId?: string;
  Pincode?: string;
  WarrantyStatus?: string;
  ComplaintText: string;
  ServiceCenterId?: string;
  ServiceCenterName?: string;
  EngineerUserId?: string;
  EngineerName?: string;
  AssignedOn?: string;
  DueDate?: string;
  ClosedOn?: string;
  Resolution?: string;
  CreatedBy?: string;
  /** e.g. "PUMP 2512PU30003, MOTOR 2512MO30003" */
  Components?: string | null;
  PhotoCount?: number;
  InsertedOn: string;
  LastUpdatedOn: string;
}

interface ServiceState {
  complaints: Complaint[];
  isLoading: boolean;
  error: string | null;

  fetchComplaints: (filters?: any) => Promise<Complaint[]>;
  addComplaint: (payload: any) => Promise<Complaint>;
  assignComplaint: (payload: { ComplaintId: string; EngineerUserId: string; ServiceCenterId?: string }) => Promise<Complaint>;
  closeComplaint: (payload: { ComplaintId: string; Resolution: string; Status?: string }) => Promise<Complaint>;
}

export const useServiceStore = create<ServiceState>((set, get) => ({
  complaints: [],
  isLoading: false,
  error: null,

  fetchComplaints: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET_COMPLAINTS, filters);
      const list = res.data.complaints;
      set({ complaints: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error || "Failed to load complaints" });
      throw err;
    }
  },

  addComplaint: async (payload) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ADD_COMPLAINT, payload);
      const created = res.data.complaint;
      await get().fetchComplaints();
      set({ isLoading: false });
      return created;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  assignComplaint: async (payload) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ASSIGN_COMPLAINT, payload);
      const updated = res.data.complaint;
      await get().fetchComplaints();
      set({ isLoading: false });
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  closeComplaint: async (payload) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.CLOSE_COMPLAINT, payload);
      const updated = res.data.complaint;
      await get().fetchComplaints();
      set({ isLoading: false });
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
