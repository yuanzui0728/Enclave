import { create } from "zustand";

type WorldUnavailableDialogState = {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};

export const useWorldUnavailableDialogStore =
  create<WorldUnavailableDialogState>((set) => ({
    open: false,
    openDialog: () =>
      // 已经显示就不重复触发；100 个并发请求同时 502 时避免反复刷新。
      set((state) => (state.open ? state : { open: true })),
    closeDialog: () => set({ open: false }),
  }));
