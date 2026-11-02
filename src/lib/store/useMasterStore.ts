import { create } from "zustand";
import axios from "axios";

const API = {
  BOOTSTRAP: "/api/masters/bootstrap",
  GET_COMPANY: "/api/masters/company/get",
  UPDATE_COMPANY: "/api/masters/company/update",
  GET_MODELS: "/api/masters/product-models/get",
  ADD_MODEL: "/api/masters/product-models/add",
  UPDATE_MODEL: "/api/masters/product-models/update",
  DELETE_MODEL: "/api/masters/product-models/delete",
  BULK_MODELS: "/api/masters/product-models/bulk-upload",
};

export interface Company {
  CompanyId: string;
  CompanyName: string;
  Tagline?: string;
  Address?: string;
  City?: string;
  State?: string;
  Pincode?: string;
  Phone?: string;
  TollFree?: string;
  Email?: string;
  Website?: string;
  Gstin?: string;
  WhatsappSender?: string;
  WarrantyTerms?: string;
}

export interface ProductModel {
  ProductModelId: string;
  ModelCode: string;
  ModelName: string;
  Category: string;
  Hp?: string;
  Kw?: string;
  Technology?: string;
  VoltageRange?: string;
  HeadRange?: string;
  Discharge?: string;
  SizeInch?: string;
  WarrantyMonths: number;
  Description?: string;
  IsActive: boolean;
}

export interface MasterState {
  company: Company | null;
  states: any[];
  districts: any[];
  productModels: ProductModel[];
  projects: any[];
  callTypes: any[];
  faultMasters: any[];
  serviceCenters: any[];
  spares: any[];
  labourMasters: any[];
  approvalRules: any[];
  isLoading: boolean;
  error: string | null;

  fetchBootstrap: () => Promise<void>;
  updateCompany: (data: Partial<Company>) => Promise<Company>;
  fetchProductModels: (filters?: any) => Promise<ProductModel[]>;
  addProductModel: (model: Partial<ProductModel>) => Promise<ProductModel>;
  updateProductModel: (model: Partial<ProductModel>) => Promise<ProductModel>;
  deleteProductModel: (productModelId: string) => Promise<void>;
  bulkUploadProductModels: (rows: any[]) => Promise<any>;
}

export const useMasterStore = create<MasterState>((set, get) => ({
  company: null,
  states: [],
  districts: [],
  productModels: [],
  projects: [],
  callTypes: [],
  faultMasters: [],
  serviceCenters: [],
  spares: [],
  labourMasters: [],
  approvalRules: [],
  isLoading: false,
  error: null,

  fetchBootstrap: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await axios.post(API.BOOTSTRAP, {});
      const data = res.data.data;
      set({
        company: data.company,
        states: data.states,
        districts: data.districts,
        productModels: data.productModels,
        projects: data.projects,
        callTypes: data.callTypes,
        faultMasters: data.faultMasters,
        serviceCenters: data.serviceCenters,
        spares: data.spares,
        labourMasters: data.labourMasters,
        approvalRules: data.approvalRules,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.response?.data?.error || "Failed to load masters",
      });
    }
  },

  updateCompany: async (data) => {
    try {
      set({ isLoading: true });
      const current = get().company;
      const res = await axios.post(API.UPDATE_COMPANY, {
        CompanyId: current?.CompanyId,
        ...data,
      });
      const updated = res.data.company;
      set({ company: updated, isLoading: false });
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  fetchProductModels: async (filters = {}) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.GET_MODELS, filters);
      const models = res.data.productModels;
      set({ productModels: models, isLoading: false });
      return models;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  addProductModel: async (model) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.ADD_MODEL, model);
      const created = res.data.productModel;
      set((state) => ({
        productModels: [created, ...state.productModels],
        isLoading: false,
      }));
      return created;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  updateProductModel: async (model) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.UPDATE_MODEL, model);
      const updated = res.data.productModel;
      set((state) => ({
        productModels: state.productModels.map((m) =>
          m.ProductModelId === updated.ProductModelId ? updated : m
        ),
        isLoading: false,
      }));
      return updated;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  deleteProductModel: async (productModelId) => {
    try {
      set({ isLoading: true });
      await axios.post(API.DELETE_MODEL, { ProductModelId: productModelId });
      set((state) => ({
        productModels: state.productModels.filter(
          (m) => m.ProductModelId !== productModelId
        ),
        isLoading: false,
      }));
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },

  bulkUploadProductModels: async (rows) => {
    try {
      set({ isLoading: true });
      const res = await axios.post(API.BULK_MODELS, { rows });
      await get().fetchProductModels();
      set({ isLoading: false });
      return res.data;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
