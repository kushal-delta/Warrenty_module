import { create } from "zustand";
import axios from "axios";

const API = {
  GET: "/api/warranty/customers/get",
  DETAIL: "/api/warranty/customers/detail",
  SAVE: "/api/warranty/customers/save",
  DELETE: "/api/warranty/customers/delete",
};

export interface Customer {
  CustomerId: string;
  CustomerName: string;
  Mobile: string;
  AltMobile?: string;
  Email?: string;
  Address?: string;
  Village?: string;
  City?: string;
  District?: string;
  StateId?: string;
  StateName?: string;
  Pincode?: string;
  Language: string;
  LastLogin?: string;
  InstallationCount?: number;
  ActiveWarrantyCount?: number;
  ComplaintCount?: number;
}

export interface CustomerDetail {
  customer: Customer;
  installations: any[];
  warranties: any[];
  complaints: any[];
}

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  fetchCustomers: (filters?: any) => Promise<Customer[]>;
  fetchCustomerDetail: (customerId: string) => Promise<CustomerDetail>;
  saveCustomer: (payload: Partial<Customer>) => Promise<Customer>;
  deleteCustomer: (customerId: string) => Promise<void>;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  isLoading: false,

  fetchCustomers: async (filters = {}) => {
    set({ isLoading: true });
    try {
      const res = await axios.post(API.GET, filters);
      set({ customers: res.data.customers });
      return res.data.customers;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCustomerDetail: async (customerId) => (await axios.post(API.DETAIL, { CustomerId: customerId })).data,

  saveCustomer: async (payload) => {
    const res = await axios.post(API.SAVE, payload);
    await get().fetchCustomers();
    return res.data.customer;
  },

  deleteCustomer: async (customerId) => {
    await axios.post(API.DELETE, { CustomerId: customerId });
    await get().fetchCustomers();
  },
}));
