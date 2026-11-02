import { create } from "zustand";
import axios from "axios";

const API = {
  GET_STICKERS: "/api/warranty/stickers/get",
  ADD_STICKER: "/api/warranty/stickers/add",
  UPDATE_STICKER: "/api/warranty/stickers/update",
  DELETE_STICKER: "/api/warranty/stickers/delete",
  BULK_STICKERS: "/api/warranty/stickers/bulk-upload",

  GET_DEALERS: "/api/warranty/dealers/get",
  ADD_DEALER: "/api/warranty/dealers/add",
  UPDATE_DEALER: "/api/warranty/dealers/update",
  DELETE_DEALER: "/api/warranty/dealers/delete",

  GET_WARRANTIES: "/api/warranty/warranties/get",
  VERIFY_WARRANTY: "/api/warranty/warranties/verify",
  ADD_FULL_INSTALLATION: "/api/warranty/installations/add-full",
};

export interface Sticker {
  StickerId: string;
  SerialNo: string;
  Category: string;
  ProductModelId: string;
  ModelCode?: string;
  ModelName?: string;
  SupplierName?: string;
  ProductGroup?: string;
  InvoiceNo?: string;
  InvoiceDate?: string;
  InvoiceLocation?: string;
  MfgDate?: string;
  Status: string;
  PrintCount: number;
  LastPrintedOn?: string;
  BatchNo?: string;
  InsertedOn: string;
  LastUpdatedOn: string;
}

export interface Dealer {
  DealerId: string;
  DealerCode?: string;
  FirmName: string;
  ContactPerson?: string;
  Mobile: string;
  Email?: string;
  Address?: string;
  City?: string;
  District?: string;
  StateId?: string;
  StateName?: string;
  Pincode?: string;
  Gstin?: string;
  WarrantyMonths?: number;
  Status: string;
  SignupOn?: string;
  ApprovedBy?: string;
  ApprovedOn?: string;
  Remarks?: string;
}

export interface Warranty {
  WarrantyId: string;
  WarrantyNo: string;
  InstallationId: string;
  InstallNo?: string;
  SerialNo: string;
  Category: string;
  ProductModelId?: string;
  ModelName?: string;
  ModelCode?: string;
  CustomerId?: string;
  CustomerName?: string;
  CustomerMobile?: string;
  Village?: string;
  District?: string;
  DealerId?: string;
  DealerName?: string;
  StartDate: string;
  WarrantyMonths: number;
  ExtendedMonths: number;
  EndDate: string;
  Status: string;
  effectiveStatus?: string;
  daysLeft?: number;
  isExpired?: boolean;
  RegisteredBy?: string;
  RegisteredOn?: string;
  WhatsappSent: boolean;
  Remarks?: string;
}

interface WarrantyState {
  stickers: Sticker[];
  dealers: Dealer[];
  warranties: Warranty[];
  verifyResult: any | null;
  isLoading: boolean;
  error: string | null;

  fetchStickers: (filters?: any) => Promise<Sticker[]>;
  addSticker: (sticker: Partial<Sticker>) => Promise<Sticker>;
  updateSticker: (sticker: Partial<Sticker>) => Promise<Sticker>;
  deleteSticker: (stickerId: string) => Promise<void>;
  bulkUploadStickers: (rows: any[]) => Promise<any>;

  fetchDealers: (filters?: any) => Promise<Dealer[]>;
  addDealer: (dealer: Partial<Dealer>) => Promise<Dealer>;
  updateDealer: (dealer: Partial<Dealer>) => Promise<Dealer>;
  deleteDealer: (dealerId: string) => Promise<void>;

  fetchWarranties: (filters?: any) => Promise<Warranty[]>;
  verifySerial: (serialNo: string) => Promise<any>;
  addFullInstallation: (payload: any) => Promise<any>;
}

export const useWarrantyStore = create<WarrantyState>((set, get) => ({
  stickers: [],
  dealers: [],
  warranties: [],
  verifyResult: null,
  isLoading: false,
  error: null,

  fetchStickers: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET_STICKERS, filters);
      const list = res.data.stickers;
      set({ stickers: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ isLoading: false, error: err.response?.data?.error || "Failed to load stickers" });
      throw err;
    }
  },

  addSticker: async (sticker) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ADD_STICKER, sticker);
      const created = res.data.sticker;
      set((state) => ({
        stickers: [created, ...state.stickers],
        isLoading: false,
      }));
      return created;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateSticker: async (sticker) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.UPDATE_STICKER, sticker);
      const updated = res.data.sticker;
      set((state) => ({
        stickers: state.stickers.map((s) => (s.StickerId === updated.StickerId ? updated : s)),
        isLoading: false,
      }));
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  deleteSticker: async (stickerId) => {
    try {
      set({ isLoading: true });
      await axios.post(API.DELETE_STICKER, { StickerId: stickerId });
      set((state) => ({
        stickers: state.stickers.filter((s) => s.StickerId !== stickerId),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  bulkUploadStickers: async (rows) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.BULK_STICKERS, { rows });
      await get().fetchStickers();
      set({ isLoading: false });
      return res.data;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  fetchDealers: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET_DEALERS, filters);
      const list = res.data.dealers;
      set({ dealers: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  addDealer: async (dealer) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ADD_DEALER, dealer);
      const created = res.data.dealer;
      set((state) => ({
        dealers: [created, ...state.dealers],
        isLoading: false,
      }));
      return created;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateDealer: async (dealer) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.UPDATE_DEALER, dealer);
      const updated = res.data.dealer;
      set((state) => ({
        dealers: state.dealers.map((d) => (d.DealerId === updated.DealerId ? updated : d)),
        isLoading: false,
      }));
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  deleteDealer: async (dealerId) => {
    try {
      set({ isLoading: true });
      await axios.post(API.DELETE_DEALER, { DealerId: dealerId });
      set((state) => ({
        dealers: state.dealers.filter((d) => d.DealerId !== dealerId),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  fetchWarranties: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.GET_WARRANTIES, filters);
      const list = res.data.warranties;
      set({ warranties: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  verifySerial: async (serialNo) => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.VERIFY_WARRANTY, { serialNo });
      set({ verifyResult: res.data, isLoading: false });
      return res.data;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  addFullInstallation: async (payload) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ADD_FULL_INSTALLATION, payload);
      await get().fetchWarranties();
      set({ isLoading: false });
      return res.data;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
