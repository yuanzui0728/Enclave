import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createStoreOrder,
  getMyGiftCabinet,
  getMyStoreInventory,
  giftGoodsToCharacter,
  listMyStoreOrders,
  listStoreGoods,
  type CreateGoodsOrderPayload,
  type GiftToCharacterPayload,
} from "@yinjie/contracts";
import { useCloudSessionStore } from "../../store/cloud-session-store";


// 商城 / 礼物柜数据 hooks：全部走 cloud-api（需云账号 accessToken），无 token 时禁用查询。
export function useStoreGoodsQuery() {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["store-goods", accessToken],
    queryFn: () => listStoreGoods(accessToken ?? ""),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });
}

export function useStoreInventoryQuery() {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["store-inventory", accessToken],
    queryFn: () => getMyStoreInventory(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });
}

export function useGiftCabinetQuery() {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["gift-cabinet", accessToken],
    queryFn: () => getMyGiftCabinet(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });
}

export function useStoreOrdersQuery(page: number) {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: ["store-orders", accessToken, page],
    queryFn: () => listMyStoreOrders(accessToken ?? "", { page, pageSize: 20 }),
    enabled: Boolean(accessToken),
    placeholderData: keepPreviousData,
  });
}

export function useBuyGoodsMutation() {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGoodsOrderPayload) =>
      createStoreOrder(payload, accessToken ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cloud-wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["store-inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["store-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["gift-cabinet"] });
    },
  });
}

export function useGiftMutation() {
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GiftToCharacterPayload) =>
      giftGoodsToCharacter(payload, accessToken ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["store-inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["gift-cabinet"] });
      // 让聊天里出现礼物气泡 + AI 回应（会话列表与当前会话刷新）。
      void queryClient.invalidateQueries({ queryKey: ["app-conversations"] });
    },
  });
}
