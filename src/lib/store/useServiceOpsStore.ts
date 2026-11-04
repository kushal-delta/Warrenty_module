import { create } from "zustand";
import axios from "axios";

const API = {
  GET_REMINDERS: "/api/service/reminders/get",
  SAVE_REMINDER: "/api/service/reminders/save",
  DELETE_REMINDER: "/api/service/reminders/delete",
  GET_VISITS: "/api/service/visits/get",
  SAVE_VISIT: "/api/service/visits/save",
  DELETE_VISIT: "/api/service/visits/delete",
  GET_REPLACEMENTS: "/api/service/replacements/get",
  REPLACEMENT_DETAIL: "/api/service/replacements/detail",
  SAVE_REPLACEMENT: "/api/service/replacements/save",
  DELETE_REPLACEMENT: "/api/service/replacements/delete",
  REPORTS: "/api/service/reports",
  ACTIVITY: "/api/system/activity",
  NOTIFICATIONS: "/api/system/notifications",
};

export interface Reminder {
  ComplaintReminderId: string;
  ComplaintId: string;
  ComplaintNo: string;
  CustomerName: string;
  Mobile: string;
  ComplaintStatus: string;
  ReminderDate: string;
  ReminderText: string;
  Status: "Pending" | "Done";
  DoneOn?: string;
  CreatedBy?: string;
}

export interface VisitReport {
  VisitReportId: string;
  VisitNo: string;
  ComplaintId: string;
  ComplaintNo: string;
  CustomerName: string;
  Mobile: string;
  Village?: string;
  District?: string;
  EngineerUserId: string;
  EngineerName?: string;
  VisitDate: string;
  Observations?: string;
  ActionTaken?: string;
  CustomerFeedback?: string;
  StartTime?: string | null;
  EndTime?: string | null;
  TravelKm?: number | null;
  TravelExpense?: number | null;
  OtherExpense?: number | null;
  CustomerRating?: number | null;
  FromLocation?: string | null;
  ToLocation?: string | null;
  Status: string;
}

export interface Replacement {
  ReplacementId: string;
  ReplNo: string;
  ReplDate: string;
  Source: string;
  ComplaintId?: string;
  ComplaintNo?: string;
  CustomerName?: string;
  DealerId?: string;
  DealerName?: string;
  ReplacementType?: string;
  VoucherType?: string;
  OutOfWarranty?: boolean | number;
  DocumentCount?: number;
  Status: string;
  CnNo?: string;
  CnAmount?: number;
  NetValue: number;
  Charges: number;
  SerialSwaps?: string;
  [key: string]: any;
}

interface ServiceOpsState {
  reminders: Reminder[];
  visits: VisitReport[];
  replacements: Replacement[];
  isLoading: boolean;
  fetchReminders: (filters?: any) => Promise<void>;
  saveReminder: (payload: any) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  fetchVisits: (filters?: any) => Promise<void>;
  saveVisit: (payload: any) => Promise<void>;
  deleteVisit: (id: string) => Promise<void>;
  fetchReplacements: (filters?: any) => Promise<void>;
  fetchReplacementDetail: (id: string) => Promise<{ replacement: Replacement; lines: any[]; documents: any[] }>;
  saveReplacement: (payload: any) => Promise<{ ReplacementId: string; ReplNo: string }>;
  deleteReplacement: (id: string) => Promise<void>;
  fetchReports: (filters?: any) => Promise<any>;
  fetchActivity: (filters?: any) => Promise<any[]>;
  fetchNotifications: (filters?: any) => Promise<any[]>;
}

/** Loads a list into the store while toggling the shared loading flag. */
const loader = (set: any, url: string, key: string) => async (filters: any = {}) => {
  set({ isLoading: true });
  try {
    const res = await axios.post(url, filters);
    set({ [key]: res.data[key] });
  } finally {
    set({ isLoading: false });
  }
};

export const useServiceOpsStore = create<ServiceOpsState>((set, get) => ({
  reminders: [],
  visits: [],
  replacements: [],
  isLoading: false,

  fetchReminders: loader(set, API.GET_REMINDERS, "reminders"),
  saveReminder: async (payload) => { await axios.post(API.SAVE_REMINDER, payload); await get().fetchReminders(); },
  deleteReminder: async (id) => { await axios.post(API.DELETE_REMINDER, { ComplaintReminderId: id }); await get().fetchReminders(); },

  fetchVisits: loader(set, API.GET_VISITS, "visits"),
  saveVisit: async (payload) => { await axios.post(API.SAVE_VISIT, payload); await get().fetchVisits(); },
  deleteVisit: async (id) => { await axios.post(API.DELETE_VISIT, { VisitReportId: id }); await get().fetchVisits(); },

  fetchReplacements: loader(set, API.GET_REPLACEMENTS, "replacements"),
  fetchReplacementDetail: async (id) => (await axios.post(API.REPLACEMENT_DETAIL, { ReplacementId: id })).data,
  saveReplacement: async (payload) => { const res = await axios.post(API.SAVE_REPLACEMENT, payload); await get().fetchReplacements(); return res.data.replacement; },
  deleteReplacement: async (id) => { await axios.post(API.DELETE_REPLACEMENT, { ReplacementId: id }); await get().fetchReplacements(); },

  fetchReports: async (filters = {}) => (await axios.post(API.REPORTS, filters)).data,
  fetchActivity: async (filters = {}) => (await axios.post(API.ACTIVITY, filters)).data.logs,
  fetchNotifications: async (filters = {}) => (await axios.post(API.NOTIFICATIONS, filters)).data.notifications,
}));
