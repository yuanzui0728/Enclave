// 商城 + 礼物柜契约。商品/订单/库存/礼物记录真值落 cloud-api（与钱包同库，按 userId）。
// 价格一律整数 cents（÷100 为元），不混币种，对齐 wallet.ts / subscription.ts。
// 钱包扣款经 WalletService.adjustBalance（type='spend'）；赠送只消耗库存不动钱包。

// virtual=虚拟数字商品（购买入库、可赠送 AI 好友、进礼物柜）；
// physical=实物商品（需收货地址、订单、发货，不入库存、不可赠送）。
export type GoodsKind = "virtual" | "physical";

export type GoodsCategory =
  | "flower"
  | "gift_icon"
  | "decoration"
  | "badge"
  | "merch"
  | "other";

export interface GoodsSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: GoodsKind;
  category: string | null;
  priceCents: number;
  currency: string;
  iconUrl: string | null;
  imageUrl: string | null;
  isGiftable: boolean;
  // null=无限库存。
  stock: number | null;
}

// 虚拟即时 completed；实物 pending→shipped→delivered；或 cancelled/refunded。
export type GoodsOrderStatus =
  | "completed"
  | "pending"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
}

export interface GoodsOrderSummary {
  id: string;
  // 仅后台列表返回（用户自查省略）。
  userId?: string;
  goodsId: string;
  goodsCode: string;
  goodsName: string;
  kind: GoodsKind;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  currency: string;
  status: GoodsOrderStatus;
  walletTransactionId: string | null;
  shipping: ShippingAddress | null;
  trackingNo: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface InventoryItemSummary {
  id: string;
  goodsId: string;
  goodsCode: string;
  name: string;
  iconUrl: string | null;
  quantity: number;
}

// user_to_character=用户送 AI 好友；character_to_user=AI 好友送用户。
export type GiftDirection = "user_to_character" | "character_to_user";

export interface GiftRecordSummary {
  id: string;
  direction: GiftDirection;
  characterId: string;
  characterName: string | null;
  characterAvatar: string | null;
  goodsId: string;
  goodsCode: string;
  name: string;
  iconUrl: string | null;
  quantity: number;
  message: string | null;
  acknowledged: boolean;
  intimacyDelta: number | null;
  createdAt: string;
}

// 礼物柜：收到的礼物（AI→用户）+ 自己拥有的虚拟收藏。
export interface GiftCabinetResponse {
  receivedGifts: GiftRecordSummary[];
  inventory: InventoryItemSummary[];
}

export interface GoodsListResponse {
  items: GoodsSummary[];
}

export interface GoodsOrderListResponse {
  items: GoodsOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── 请求体 ────────────────────────────────────────────────
export interface CreateGoodsOrderPayload {
  goodsCode: string;
  quantity: number;
  // 客户端生成的幂等键（每次结算一个 UUID）：兜重复扣款。
  idempotencyKey: string;
  // 实物必填。
  shipping?: ShippingAddress;
}

export interface CreateGoodsOrderResponse {
  order: GoodsOrderSummary;
  // 虚拟购买入库后返回；实物为 null。
  inventoryItem: InventoryItemSummary | null;
  // 扣款后最新余额（cents）。
  balanceCents: number;
}

export interface GiftToCharacterPayload {
  goodsCode: string;
  characterId: string;
  quantity: number;
  // 客户端生成的幂等键（每次赠送一个 UUID）：兜重试/双标签页重复扣库存。
  idempotencyKey: string;
  message?: string;
  // 角色名/头像快照（前端从好友列表带上，cloud-api 不查 world）。
  characterName?: string;
  characterAvatar?: string;
}

export interface GiftToCharacterResponse {
  gift: GiftRecordSummary;
  inventoryItem: InventoryItemSummary;
}

// ── 后台（admin）──────────────────────────────────────────
export interface AdminGoodsSummary extends GoodsSummary {
  isActive: boolean;
  isPubliclyPurchasable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGoodsListResponse {
  items: AdminGoodsSummary[];
}

export interface AdminUpsertGoodsPayload {
  code: string;
  name: string;
  description?: string | null;
  kind: GoodsKind;
  category?: string | null;
  priceCents: number;
  iconUrl?: string | null;
  imageUrl?: string | null;
  isGiftable?: boolean;
  isActive?: boolean;
  isPubliclyPurchasable?: boolean;
  sortOrder?: number;
  stock?: number | null;
}

export interface AdminUpdateGoodsPayload {
  name?: string;
  description?: string | null;
  category?: string | null;
  priceCents?: number;
  iconUrl?: string | null;
  imageUrl?: string | null;
  isGiftable?: boolean;
  isActive?: boolean;
  isPubliclyPurchasable?: boolean;
  sortOrder?: number;
  stock?: number | null;
}

export interface AdminShipOrderPayload {
  trackingNo?: string;
}

// ── 跨服务内部契约（world ↔ cloud-api，X-Service-Token）──────────────
// 用户送 AI 好友：world 加亲密度 + 触发 AI 回应后回报增量。
export interface GiftInboundFromUserRequest {
  giftRecordId: string;
  characterId: string;
  goodsCode: string;
  goodsName: string;
  quantity: number;
  message: string;
}

export interface GiftInboundFromUserResponse {
  intimacyDelta: number;
  newIntimacyLevel: number | null;
}

// AI 好友送用户：world 触发 → cloud-api 授予库存 + 落 character_to_user 礼物记录。
export interface GiftInboundFromCharacterRequest {
  phone: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  goodsCode: string;
  quantity: number;
  message?: string;
  // 防重放幂等键（world 生成；重试不重复入库）。
  idempotencyKey: string;
}

export interface GiftInboundFromCharacterResponse {
  gift: GiftRecordSummary;
}
