import { create } from "zustand";
import axios from "axios";

const API = {
  BALANCE: "/api/stock/balance",
  GET_TXNS: "/api/stock/txns/get",
  ADD_TXN: "/api/stock/txns/add",
  DELETE_TXN: "/api/stock/txns/delete",
};

export interface StockRow {
  key: string;
  LocType: "SC" | "ENG";
  LocId: string;
  LocName: string;
  ServiceCenterName?: string;
  SpareId: string;
  SpareCode: string;
  SpareName: string;
  Category?: string;
  Uom: string;
  Good: number;
  Damaged: number;
  Rate: number;
  MinStock: number;
  Value: number;
  BelowMin: boolean;
}

export interface StockTxn {
  StockTxnId: string;
  TxnDate: string;
  TxnType: string;
  SpareId: string;
  SpareCode: string;
  SpareName: string;
  Uom: string;
  Qty: number;
  Rate: number;
  Amount: number;
  FromLocType?: string;
  FromLocName?: string;
  ToLocType?: string;
  ToLocName?: string;
  JobCardItemLnId?: string;
  JobCardNo?: string;
  Remarks?: string;
  CreatedBy?: string;
}

interface StockState {
  stock: StockRow[];
  txns: StockTxn[];
  isLoading: boolean;
  fetchStock: (filters?: any) => Promise<void>;
  fetchTxns: (filters?: any) => Promise<void>;
  addTxn: (payload: any) => Promise<void>;
  deleteTxn: (id: string) => Promise<void>;
}

export const useStockStore = create<StockState>((set, get) => ({
  stock: [],
  txns: [],
  isLoading: false,

  fetchStock: async (filters = {}) => {
    set({ isLoading: true });
    try { set({ stock: (await axios.post(API.BALANCE, filters)).data.stock }); } finally { set({ isLoading: false }); }
  },
  fetchTxns: async (filters = {}) => {
    set({ isLoading: true });
    try { set({ txns: (await axios.post(API.GET_TXNS, filters)).data.txns }); } finally { set({ isLoading: false }); }
  },
  addTxn: async (payload) => { await axios.post(API.ADD_TXN, payload); await get().fetchTxns(); },
  deleteTxn: async (id) => { await axios.post(API.DELETE_TXN, { StockTxnId: id }); await get().fetchTxns(); },
}));
