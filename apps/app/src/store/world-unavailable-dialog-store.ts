import { create } from "zustand";

type WorldUnavailableDialogState = {
  open: boolean;
  message: string;
  openDialog: (input: { message: string }) => void;
  closeDialog: () => void;
};

export const useWorldUnavailableDialogStore =
  create<WorldUnavailableDialogState>((set) => ({
    open: false,
    message: "", // i18n-ignore-line
    openDialog: (input) =>
      set((state) =>
        // 已经显示就不重复触发；100 个并发请求同时 502 时避免反复刷新文案。
        state.open ? state : { open: true, message: input.message },
      ),
    closeDialog: () => set({ open: false, message: "" }), // i18n-ignore-line
  }));
