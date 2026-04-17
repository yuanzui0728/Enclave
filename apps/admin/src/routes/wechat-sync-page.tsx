import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  CharacterDraft,
  WechatSyncContactBundle,
  WechatSyncImportResponse,
  WechatSyncPreviewItem,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminEmptyState,
  AdminMiniPanel,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectableCard,
  AdminTextArea,
  AdminTextField,
  AdminToggle,
} from "../components/admin-workbench";
import {
  adminApi,
  type WechatSyncHistoryItem,
} from "../lib/admin-api";
import {
  buildWechatConnectorContactBundles,
  getWechatConnectorHealth,
  listWechatConnectorContacts,
  loadWechatConnectorSettings,
  saveWechatConnectorSettings,
  scanWechatConnector,
  type WechatConnectorSettings,
} from "../lib/wechat-local-connector";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

const SAMPLE_WECHAT_SYNC_CONTACTS: WechatSyncContactBundle[] = [
  {
    username: "wxid_alice_product",
    displayName: "Alice",
    nickname: "Alice",
    remarkName: "产品 Alice",
    region: "上海",
    source: "wechat_export",
    tags: ["同事", "产品"],
    isGroup: false,
    messageCount: 128,
    ownerMessageCount: 62,
    contactMessageCount: 66,
    latestMessageAt: "2026-04-16T11:20:00.000Z",
    chatSummary: "经常聊产品迭代、周末约饭和出差安排，说话直接，节奏很快。",
    topicKeywords: ["产品", "迭代", "出差", "周末"],
    sampleMessages: [
      {
        timestamp: "2026-04-16 19:20",
        text: "周五评审后一起吃饭？",
        sender: "Alice",
        direction: "contact",
      },
      {
        timestamp: "2026-04-16 19:22",
        text: "可以，我把新方案带过去。",
        sender: "我",
        direction: "owner",
      },
    ],
    momentHighlights: [
      {
        postedAt: "2026-04-14T08:00:00.000Z",
        text: "连续开了三天会，今天终于把方案敲定。",
        location: "上海",
      },
    ],
  },
];

const SAMPLE_WECHAT_SYNC_JSON = JSON.stringify(
  SAMPLE_WECHAT_SYNC_CONTACTS,
  null,
  2,
);

export function WechatSyncPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [connectorSettings, setConnectorSettings] = useState<WechatConnectorSettings>(
    () => loadWechatConnectorSettings(),
  );
  const [search, setSearch] = useState("");
  const [includeGroups, setIncludeGroups] = useState(false);
  const [autoAddFriend, setAutoAddFriend] = useState(true);
  const [seedMoments, setSeedMoments] = useState(true);
  const [manualBundleJson, setManualBundleJson] = useState("");
  const [manualBundleError, setManualBundleError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    "all" | "active" | "attention" | "removed"
  >("all");
  const [selectedHistoryCharacterId, setSelectedHistoryCharacterId] = useState<string | null>(null);
  const [rollbackGuideItem, setRollbackGuideItem] = useState<WechatSyncHistoryItem | null>(null);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [selectedPreviewUsernames, setSelectedPreviewUsernames] = useState<string[]>([]);
  const [batchRelationshipInput, setBatchRelationshipInput] = useState("");
  const [batchDomainInput, setBatchDomainInput] = useState("");
  const [previewItems, setPreviewItems] = useState<WechatSyncPreviewItem[]>([]);
  const deferredSearch = useDeferredValue(search.trim());
  const deferredHistorySearch = useDeferredValue(historySearch.trim().toLowerCase());

  const connectorHealthQuery = useQuery({
    queryKey: ["wechat-connector-health", connectorSettings.baseUrl],
    queryFn: () => getWechatConnectorHealth(connectorSettings.baseUrl),
    retry: false,
    refetchInterval: 10_000,
  });

  const contactsQuery = useQuery({
    queryKey: [
      "wechat-connector-contacts",
      connectorSettings.baseUrl,
      deferredSearch,
      includeGroups,
    ],
    queryFn: () =>
      listWechatConnectorContacts(connectorSettings.baseUrl, {
        query: deferredSearch,
        includeGroups,
        limit: 200,
      }),
    enabled: connectorHealthQuery.isSuccess,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["admin-wechat-sync-history", baseUrl],
    queryFn: () => adminApi.getWechatSyncHistory(),
  });

  const connectorReady = connectorHealthQuery.isSuccess && connectorHealthQuery.data.ok;
  const selectedSet = useMemo(
    () => new Set(selectedUsernames),
    [selectedUsernames],
  );
  const selectedPreviewSet = useMemo(
    () => new Set(selectedPreviewUsernames),
    [selectedPreviewUsernames],
  );
  const selectedCount = selectedUsernames.length;
  const previewValidation = useMemo(
    () =>
      new Map(
        previewItems.map((item) => [
          item.contact.username,
          validatePreviewItem(item),
        ]),
      ),
    [previewItems],
  );
  const invalidPreviewCount = useMemo(
    () =>
      previewItems.filter(
        (item) => (previewValidation.get(item.contact.username)?.length ?? 0) > 0,
      ).length,
    [previewItems, previewValidation],
  );
  const batchTargetUsernames = useMemo(() => {
    if (selectedPreviewUsernames.length > 0) {
      return selectedPreviewUsernames;
    }
    return previewItems.map((item) => item.contact.username);
  }, [previewItems, selectedPreviewUsernames]);
  const historyItems = historyQuery.data?.items ?? [];
  const historyCounts = useMemo(
    () => ({
      total: historyItems.length,
      active: historyItems.filter((item) =>
        isActiveFriendshipStatus(item.friendshipStatus),
      ).length,
      attention: historyItems.filter(
        (item) => !isActiveFriendshipStatus(item.friendshipStatus),
      ).length,
      removed: historyItems.filter(
        (item) => item.friendshipStatus === "removed",
      ).length,
    }),
    [historyItems],
  );
  const filteredHistoryItems = useMemo(() => {
    return historyItems.filter((item) => {
      const matchesSearch =
        !deferredHistorySearch ||
        [
          item.character.name,
          item.character.relationship,
          item.character.sourceKey,
          item.remarkName,
          item.region,
          ...item.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(deferredHistorySearch);

      const matchesStatus =
        historyStatusFilter === "all" ||
        (historyStatusFilter === "active"
          ? isActiveFriendshipStatus(item.friendshipStatus)
          : historyStatusFilter === "attention"
            ? !isActiveFriendshipStatus(item.friendshipStatus)
            : item.friendshipStatus === "removed");

      return matchesSearch && matchesStatus;
    });
  }, [deferredHistorySearch, historyItems, historyStatusFilter]);
  const selectedHistoryItem = useMemo(() => {
    if (!filteredHistoryItems.length) {
      return null;
    }
    return (
      filteredHistoryItems.find(
        (item) => item.character.id === selectedHistoryCharacterId,
      ) ?? filteredHistoryItems[0]
    );
  }, [filteredHistoryItems, selectedHistoryCharacterId]);
  const selectedHistoryPreviewItem = useMemo(() => {
    if (!selectedHistoryItem) {
      return null;
    }
    return findPreviewItemForHistoryItem(selectedHistoryItem, previewItems);
  }, [previewItems, selectedHistoryItem]);
  const selectedHistoryPreviewValidationIssues = useMemo(() => {
    if (!selectedHistoryPreviewItem) {
      return [];
    }
    return previewValidation.get(selectedHistoryPreviewItem.contact.username) ?? [];
  }, [previewValidation, selectedHistoryPreviewItem]);

  const scanMutation = useMutation({
    mutationFn: () => scanWechatConnector(connectorSettings.baseUrl),
    onSuccess: async () => {
      saveWechatConnectorSettings(connectorSettings);
      setPreviewItems([]);
      setSelectedPreviewUsernames([]);
      setSelectedUsernames([]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["wechat-connector-health", connectorSettings.baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["wechat-connector-contacts", connectorSettings.baseUrl],
        }),
      ]);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (contacts?: WechatSyncContactBundle[]) => {
      const selectedContacts =
        contacts && contacts.length > 0
          ? contacts
          : await loadSelectedConnectorContacts(
              connectorSettings.baseUrl,
              selectedUsernames,
            );
      saveWechatConnectorSettings(connectorSettings);
      return adminApi.previewWechatSync({ contacts: selectedContacts });
    },
    onSuccess: (result) => {
      setPreviewItems(result.items);
      setSelectedPreviewUsernames(result.items.map((item) => item.contact.username));
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!previewItems.length) {
        throw new Error("请先生成角色预览。");
      }
      return adminApi.importWechatSync({
        items: previewItems.map((item) => ({
          contact: item.contact,
          draftCharacter: item.draftCharacter,
          autoAddFriend,
          seedMoments,
        })),
      });
    },
    onSuccess: async () => {
      setRollbackGuideItem(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wechat-sync-history", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-friend-ids", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
      ]);
    },
  });
  const retryFriendshipMutation = useMutation({
    mutationFn: (characterId: string) =>
      adminApi.retryWechatSyncFriendship(characterId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wechat-sync-history", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-friend-ids", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
      ]);
    },
  });
  const rollbackMutation = useMutation({
    mutationFn: (item: WechatSyncHistoryItem) =>
      adminApi.rollbackWechatSyncImport(item.character.id),
    onSuccess: async (_, item) => {
      setRollbackGuideItem(item);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wechat-sync-history", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-friend-ids", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
      ]);
    },
  });
  const reimportMutation = useMutation({
    mutationFn: (item: WechatSyncPreviewItem) =>
      adminApi.importWechatSync({
        items: [
          {
            contact: item.contact,
            draftCharacter: item.draftCharacter,
            autoAddFriend,
            seedMoments,
          },
        ],
      }),
    onSuccess: async (result) => {
      setRollbackGuideItem(null);
      if (result.items[0]) {
        setSelectedHistoryCharacterId(result.items[0].character.id);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wechat-sync-history", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-friend-ids", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
      ]);
    },
  });

  function toggleUsername(username: string) {
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username],
    );
  }

  function selectVisibleContacts() {
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames((contactsQuery.data ?? [])
      .filter((item) => !item.isGroup)
      .map((item) => item.username));
  }

  function clearSelection() {
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames([]);
  }

  function patchPreviewItem(
    username: string,
    updater: (current: WechatSyncPreviewItem) => WechatSyncPreviewItem,
  ) {
    setPreviewItems((current) =>
      current.map((item) =>
        item.contact.username === username ? updater(item) : item,
      ),
    );
  }

  function patchPreviewDraft(
    username: string,
    updater: (current: CharacterDraft) => CharacterDraft,
  ) {
    patchPreviewItem(username, (item) => ({
      ...item,
      draftCharacter: updater(item.draftCharacter),
    }));
  }

  function removePreviewItem(username: string) {
    setPreviewItems((current) =>
      current.filter((item) => item.contact.username !== username),
    );
    setSelectedUsernames((current) =>
      current.filter((item) => item !== username),
    );
    setSelectedPreviewUsernames((current) =>
      current.filter((item) => item !== username),
    );
  }

  function togglePreviewSelection(username: string) {
    setSelectedPreviewUsernames((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username],
    );
  }

  function selectAllPreviewItems() {
    setSelectedPreviewUsernames(
      previewItems.map((item) => item.contact.username),
    );
  }

  function clearPreviewSelection() {
    setSelectedPreviewUsernames([]);
  }

  function patchPreviewItems(
    usernames: string[],
    updater: (current: WechatSyncPreviewItem) => WechatSyncPreviewItem,
  ) {
    if (!usernames.length) {
      return;
    }
    const selected = new Set(usernames);
    setPreviewItems((current) =>
      current.map((item) =>
        selected.has(item.contact.username) ? updater(item) : item,
      ),
    );
  }

  function applyBatchRelationship() {
    const relationship = batchRelationshipInput.trim();
    if (!relationship) {
      return;
    }
    patchPreviewItems(batchTargetUsernames, (item) => ({
      ...item,
      draftCharacter: patchDraftIdentity(item.draftCharacter, { relationship }),
    }));
  }

  function applyBatchDomains() {
    const domains = splitCsv(batchDomainInput);
    if (!domains.length) {
      return;
    }
    patchPreviewItems(batchTargetUsernames, (item) => ({
      ...item,
      draftCharacter: mergeDraftDomains(item.draftCharacter, domains),
    }));
    setBatchDomainInput("");
  }

  function autofillPreviewDrafts() {
    patchPreviewItems(batchTargetUsernames, (item) => ({
      ...item,
      draftCharacter: fillWechatSyncDraftBlanks(item.contact, item.draftCharacter),
    }));
  }

  function loadRollbackGuideIntoManualInput() {
    if (!rollbackGuideItem) {
      return;
    }
    setManualBundleError(null);
    setManualBundleJson(
      JSON.stringify([buildRollbackGuideContactBundle(rollbackGuideItem)], null, 2),
    );
  }

  function regeneratePreviewFromHistoryItem(item: WechatSyncHistoryItem) {
    const bundle = buildRollbackGuideContactBundle(item);
    reimportMutation.reset();
    setManualBundleError(null);
    setManualBundleJson(JSON.stringify([bundle], null, 2));
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames([bundle.username]);
    previewMutation.mutate([bundle]);
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="角色中心 / 微信同步"
        title="一键同步微信朋友"
        description="通过你本地授权提供的联系人资料和聊天摘要，挑选要导入的微信联系人，生成隐界角色并自动成为好友。第一版会优先使用聊天、标签和联系人资料；朋友圈摘要目前只在数据源提供时参与导入。"
        actions={
          <>
            <Link to="/characters">
              <Button variant="secondary" size="lg">
                返回角色中心
              </Button>
            </Link>
            <Button
              variant="primary"
              size="lg"
              onClick={() => previewMutation.mutate(undefined)}
              disabled={!connectorReady || !selectedCount || previewMutation.isPending}
            >
              {previewMutation.isPending ? "生成预览中..." : "生成角色预览"}
            </Button>
          </>
        }
        metrics={[
          {
            label: "连接器状态",
            value: connectorReady ? "已连接" : "未连接",
          },
          {
            label: "已选联系人",
            value: selectedCount,
          },
          {
            label: "最近扫描联系人",
            value: connectorHealthQuery.data?.contactCount ?? 0,
          },
          {
            label: "已生成预览",
            value: previewItems.length,
          },
        ]}
      />

      <AdminCallout
        title="本地运行前提"
        tone="info"
        description={
          <div className="space-y-2">
            <p>后台只消费你本地已经授权整理好的联系人资料和聊天摘要，不提供密钥提取、聊天记录破解或进程内存读取能力。</p>
            <p>如果你已经有自己的本地数据连接器，可直接填入连接器地址；如果没有，也可以把联系人快照 JSON 直接粘贴到下方手动导入区。</p>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="连接器设置"
            actions={
              <StatusPill tone={connectorReady ? "healthy" : "warning"}>
                {connectorReady ? "已连接" : "待启动"}
              </StatusPill>
            }
          />
          <div className="mt-4 grid gap-4">
            <AdminTextField
              label="连接器地址"
              value={connectorSettings.baseUrl}
              placeholder="http://127.0.0.1:17364"
              onChange={(value) =>
                setConnectorSettings((current) => ({ ...current, baseUrl: value }))
              }
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? "刷新中..." : "刷新本地索引"}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["wechat-connector-health", connectorSettings.baseUrl],
                })
              }
            >
              刷新连接状态
            </Button>
          </div>

          {connectorHealthQuery.isLoading ? (
            <LoadingBlock className="mt-4" label="正在探测本地微信连接器..." />
          ) : null}
          {connectorHealthQuery.isError && connectorHealthQuery.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={connectorHealthQuery.error.message} />
          ) : null}
          {scanMutation.isError && scanMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={scanMutation.error.message} />
          ) : null}
          {scanMutation.isSuccess ? (
            <AdminActionFeedback
              className="mt-4"
              tone="success"
              title="本地索引已刷新"
              description={scanMutation.data.message}
            />
          ) : null}

          {connectorReady ? (
            <div className="mt-4 grid gap-3">
              <AdminMiniPanel title="当前配置">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div>连接器：{connectorSettings.baseUrl}</div>
                  <div>连接器标识：{connectorHealthQuery.data.activeConfig.connectorLabel || "未回报"}</div>
                  <div>数据摘要：{connectorHealthQuery.data.activeConfig.sourceSummary || "未回报"}</div>
                  <div>上次扫描：{formatDateTime(connectorHealthQuery.data.lastScanAt)}</div>
                </div>
              </AdminMiniPanel>
              <AdminMiniPanel title="导入选项">
                <div className="space-y-3">
                  <AdminToggle
                    label="导入后自动成为好友"
                    checked={autoAddFriend}
                    onChange={setAutoAddFriend}
                  />
                  <AdminToggle
                    label="如果带有朋友圈摘要则自动生成角色朋友圈"
                    checked={seedMoments}
                    onChange={setSeedMoments}
                  />
                </div>
              </AdminMiniPanel>
            </div>
          ) : null}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="手动导入联系人快照"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setManualBundleJson(SAMPLE_WECHAT_SYNC_JSON)}
                >
                  填入示例
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    try {
                      const bundles = parseWechatSyncContactBundles(manualBundleJson);
                      setManualBundleError(null);
                      setPreviewItems([]);
                      setSelectedUsernames(bundles.map((item) => item.username));
                      previewMutation.mutate(bundles);
                    } catch (error) {
                      setManualBundleError(
                        error instanceof Error ? error.message : "联系人快照解析失败。",
                      );
                    }
                  }}
                  disabled={previewMutation.isPending}
                >
                  载入 JSON 并生成预览
                </Button>
              </div>
            }
          />
          <div className="mt-4">
            <AdminTextArea
              label="联系人快照 JSON"
              value={manualBundleJson}
              onChange={setManualBundleJson}
              textareaClassName="min-h-52 font-mono text-xs"
              description="粘贴 `WechatSyncContactBundle[]` 数组即可直接生成预览。只适用于你本人合法导出的联系人资料和聊天摘要。"
              placeholder='[{"username":"wxid_alice","displayName":"Alice","tags":["同事"],"isGroup":false,"messageCount":128,"ownerMessageCount":62,"contactMessageCount":66,"latestMessageAt":"2026-04-16T11:20:00.000Z","chatSummary":"经常聊产品迭代、周末约饭和出差安排。","topicKeywords":["产品","出差","周末"],"sampleMessages":[{"timestamp":"2026-04-16 19:20","text":"周五一起吃饭？","sender":"Alice","direction":"contact"}],"momentHighlights":[]}]'
            />
          </div>

          {rollbackGuideItem ? (
            <AdminCallout
              className="mt-4"
              title="已保留最近一次回滚的重新导入模板"
              tone="warning"
              description={
                <div className="space-y-2">
                  <p>
                    已回滚角色：{rollbackGuideItem.character.name}。
                    {rollbackGuideItem.character.sourceKey
                      ? ` 你也可以用 ${extractWechatUsername(
                          rollbackGuideItem.character.sourceKey,
                        ) || rollbackGuideItem.character.sourceKey} 在上方连接器联系人里重新搜索。`
                      : " 当前没有可用的 sourceKey，只能通过手动 JSON 重新导入。"}
                  </p>
                  <p>点“填回手动导入区”后，会生成一份最小联系人快照模板，方便你重新生成预览。</p>
                </div>
              }
              actions={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadRollbackGuideIntoManualInput}
                  >
                    填回手动导入区
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRollbackGuideItem(null)}
                  >
                    关闭引导
                  </Button>
                </>
              }
            />
          ) : null}

          {manualBundleError ? (
            <ErrorBlock className="mt-4" message={manualBundleError} />
          ) : null}
          {previewMutation.isError && previewMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={previewMutation.error.message} />
          ) : null}
        </Card>

        <Card className="bg-[color:var(--surface-console)] xl:col-span-2">
          <AdminSectionHeader
            title="联系人选择"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={selectVisibleContacts}
                  disabled={!contactsQuery.data?.length}
                >
                  全选可见联系人
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearSelection}
                  disabled={!selectedCount}
                >
                  清空选择
                </Button>
              </div>
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="min-w-[240px] flex-1">
              <AdminTextField
                label="搜索联系人"
                value={search}
                placeholder="搜索备注名、昵称、标签"
                onChange={setSearch}
              />
            </div>
            <div className="pt-6">
              <AdminToggle
                label="包含群聊"
                checked={includeGroups}
                onChange={(checked) => {
                  setPreviewItems([]);
                  setIncludeGroups(checked);
                }}
              />
            </div>
          </div>

          {contactsQuery.isLoading ? (
            <LoadingBlock className="mt-4" label="正在读取本地微信联系人..." />
          ) : null}
          {contactsQuery.isError && contactsQuery.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={contactsQuery.error.message} />
          ) : null}

          {!contactsQuery.isLoading && connectorReady && !(contactsQuery.data?.length ?? 0) ? (
            <AdminEmptyState
              className="mt-4"
              title="当前没有可选择的联系人"
              description="先刷新一次本地索引；如果已经刷新过，检查搜索词或确认连接器是否提供了联系人列表。"
            />
          ) : null}

          <div className="mt-4 space-y-3">
            {(contactsQuery.data ?? []).map((contact) => (
              <AdminSelectableCard
                key={contact.username}
                active={selectedSet.has(contact.username)}
                onClick={() => toggleUsername(contact.username)}
                title={contact.displayName}
                subtitle={contact.remarkName || contact.nickname || contact.username}
                badge={
                  <StatusPill tone={contact.isGroup ? "warning" : "healthy"}>
                    {contact.isGroup ? "群聊" : "联系人"}
                  </StatusPill>
                }
                meta={
                  <div className="space-y-1">
                    <div>
                      消息 {contact.messageCount} 条
                      {contact.latestMessageAt ? ` · 最近 ${formatDateTime(contact.latestMessageAt)}` : ""}
                    </div>
                    <div>
                      {contact.tags.length ? `标签：${contact.tags.join("、")}` : "暂无标签"}
                    </div>
                    {contact.sampleSnippet ? <div>样本：{contact.sampleSnippet}</div> : null}
                  </div>
                }
                activeLabel="已加入导入队列"
              />
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title="角色预览"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPreviewItems([]);
                  setSelectedPreviewUsernames([]);
                }}
                disabled={!previewItems.length || importMutation.isPending}
              >
                清空预览
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => importMutation.mutate()}
                disabled={
                  !previewItems.length ||
                  importMutation.isPending ||
                  invalidPreviewCount > 0
                }
              >
                {importMutation.isPending ? "导入中..." : "导入并建立好友关系"}
              </Button>
            </div>
          }
        />

        {previewMutation.isError && previewMutation.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={previewMutation.error.message} />
        ) : null}
        {importMutation.isError && importMutation.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={importMutation.error.message} />
        ) : null}
        {importMutation.isSuccess ? (
          <ImportResultPanel result={importMutation.data} />
        ) : null}

        {previewItems.length ? (
          <Card className="mt-4 bg-[color:var(--surface-card)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-base font-semibold text-[color:var(--text-primary)]">
                  批量编辑与导入校验
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  当前批量目标：
                  {selectedPreviewUsernames.length
                    ? `已选 ${selectedPreviewUsernames.length} 项`
                    : `全部 ${previewItems.length} 项`}
                  。不勾选时，批量动作默认作用于全部预览项。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={selectAllPreviewItems}
                  disabled={!previewItems.length}
                >
                  全选预览
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearPreviewSelection}
                  disabled={!selectedPreviewUsernames.length}
                >
                  清空批量选中
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <AdminTextField
                    label="批量关系定位"
                    value={batchRelationshipInput}
                    onChange={setBatchRelationshipInput}
                    placeholder="统一替换目标项的关系定位"
                  />
                  <AdminTextField
                    label="批量追加领域标签"
                    value={batchDomainInput}
                    onChange={setBatchDomainInput}
                    placeholder="例如：朋友, 同事, 产品"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBatchRelationship}
                    disabled={!batchTargetUsernames.length || !batchRelationshipInput.trim()}
                  >
                    应用关系定位
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBatchDomains}
                    disabled={!batchTargetUsernames.length || !splitCsv(batchDomainInput).length}
                  >
                    追加领域标签
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={autofillPreviewDrafts}
                    disabled={!batchTargetUsernames.length}
                  >
                    自动填补空白字段
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {invalidPreviewCount > 0 ? (
                  <AdminCallout
                    title="当前还有未通过校验的角色草稿"
                    tone="warning"
                    description={`共有 ${invalidPreviewCount} 个预览项缺少必要字段，导入按钮已禁用。请先补齐角色名、关系定位、简介、领域标签和记忆摘要。`}
                  />
                ) : (
                  <AdminCallout
                    title="当前预览已通过导入前校验"
                    tone="success"
                    description={`本轮 ${previewItems.length} 个预览项都具备基础导入字段，可以继续导入并建立好友关系。`}
                  />
                )}
              </div>
            </div>
          </Card>
        ) : null}

        {!previewItems.length && !previewMutation.isPending ? (
          <AdminEmptyState
            className="mt-4"
            title="还没有生成导入预览"
            description="先在上方选择微信联系人，再点击“生成角色预览”。"
          />
        ) : null}
        {previewMutation.isPending ? (
          <LoadingBlock className="mt-4" label="正在根据微信聊天资料生成角色预览..." />
        ) : null}

        {previewItems.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {previewItems.map((item) => (
              <PreviewCharacterCard
                key={item.contact.username}
                item={item}
                selected={selectedPreviewSet.has(item.contact.username)}
                validationIssues={
                  previewValidation.get(item.contact.username) ?? []
                }
                onRemove={() => removePreviewItem(item.contact.username)}
                onToggleSelect={() => togglePreviewSelection(item.contact.username)}
                onNameChange={(value) =>
                  patchPreviewDraft(item.contact.username, (draft) =>
                    patchDraftIdentity(draft, { name: value }),
                  )
                }
                onRelationshipChange={(value) =>
                  patchPreviewDraft(item.contact.username, (draft) =>
                    patchDraftIdentity(draft, { relationship: value }),
                  )
                }
                onBioChange={(value) =>
                  patchPreviewDraft(item.contact.username, (draft) => ({
                    ...draft,
                    bio: value,
                  }))
                }
                onDomainsChange={(value) =>
                  patchPreviewDraft(item.contact.username, (draft) =>
                    patchDraftDomains(draft, value),
                  )
                }
                onMemorySummaryChange={(value) =>
                  patchPreviewDraft(item.contact.username, (draft) =>
                    patchDraftMemorySummary(draft, value),
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title="已导入历史"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["admin-wechat-sync-history", baseUrl],
                })
              }
            >
              刷新历史
            </Button>
          }
        />

        {historyQuery.isLoading ? (
          <LoadingBlock className="mt-4" label="正在加载微信同步导入历史..." />
        ) : null}
        {historyQuery.isError && historyQuery.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={historyQuery.error.message} />
        ) : null}
        {retryFriendshipMutation.isError && retryFriendshipMutation.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={retryFriendshipMutation.error.message} />
        ) : null}
        {rollbackMutation.isError && rollbackMutation.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={rollbackMutation.error.message} />
        ) : null}
        {reimportMutation.isError && reimportMutation.error instanceof Error ? (
          <ErrorBlock className="mt-4" message={reimportMutation.error.message} />
        ) : null}
        {retryFriendshipMutation.isSuccess ? (
          <AdminActionFeedback
            className="mt-4"
            tone="success"
            title="好友关系补建完成"
            description={
              retryFriendshipMutation.data.friendshipCreated
                ? "目标角色已重新成为好友。"
                : "目标角色本来就是好友，已完成状态校正。"
            }
          />
        ) : null}
        {rollbackMutation.isSuccess ? (
          <AdminActionFeedback
            className="mt-4"
            tone="success"
            title="导入已回滚"
            description="该微信同步角色已删除，关联会话、好友关系和内容也一并清理；下方保留了重新导入引导。"
          />
        ) : null}
        {reimportMutation.isSuccess ? (
          <ImportResultPanel
            result={reimportMutation.data}
            title="再导入完成"
            description={`已按当前预览重新导入 ${reimportMutation.data.importedCount} 个角色。`}
          />
        ) : null}

        {historyItems.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <AdminTextField
              label="搜索历史记录"
              value={historySearch}
              onChange={setHistorySearch}
              placeholder="搜索角色名、关系、sourceKey、备注或标签"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant={historyStatusFilter === "all" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setHistoryStatusFilter("all")}
              >
                全部 {historyCounts.total}
              </Button>
              <Button
                variant={historyStatusFilter === "active" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setHistoryStatusFilter("active")}
              >
                好友正常 {historyCounts.active}
              </Button>
              <Button
                variant={historyStatusFilter === "attention" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setHistoryStatusFilter("attention")}
              >
                待处理 {historyCounts.attention}
              </Button>
              <Button
                variant={historyStatusFilter === "removed" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setHistoryStatusFilter("removed")}
              >
                已移除 {historyCounts.removed}
              </Button>
            </div>
          </div>
        ) : null}

        {!historyQuery.isLoading && !historyItems.length ? (
          <AdminEmptyState
            className="mt-4"
            title="还没有微信同步导入历史"
            description="完成一次导入后，这里会展示导入角色、好友状态、朋友圈种子数以及回滚 / 重试操作。"
          />
        ) : null}

        {historyItems.length && !filteredHistoryItems.length ? (
          <AdminEmptyState
            className="mt-4"
            title="当前筛选没有匹配的导入历史"
            description="调整搜索词或状态筛选后，再继续查看导入记录。"
          />
        ) : null}

        {filteredHistoryItems.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              {filteredHistoryItems.map((item) => (
                <WechatSyncHistoryCard
                  key={item.character.id}
                  item={item}
                  selected={selectedHistoryItem?.character.id === item.character.id}
                  retryPending={
                    retryFriendshipMutation.isPending &&
                    retryFriendshipMutation.variables === item.character.id
                  }
                  rollbackPending={
                    rollbackMutation.isPending &&
                    rollbackMutation.variables?.character.id === item.character.id
                  }
                  onSelect={() => setSelectedHistoryCharacterId(item.character.id)}
                  onRegeneratePreview={() => regeneratePreviewFromHistoryItem(item)}
                  onRetryFriendship={() =>
                    retryFriendshipMutation.mutate(item.character.id)
                  }
                  onRollback={() => rollbackMutation.mutate(item)}
                />
              ))}
            </div>
            <HistoryDetailPanel
              item={selectedHistoryItem}
              matchedPreviewItem={selectedHistoryPreviewItem}
              matchedPreviewValidationIssues={
                selectedHistoryPreviewValidationIssues
              }
              previewPending={previewMutation.isPending}
              reimportPending={reimportMutation.isPending}
              retryPending={
                retryFriendshipMutation.isPending &&
                retryFriendshipMutation.variables === selectedHistoryItem?.character.id
              }
              rollbackPending={
                rollbackMutation.isPending &&
                rollbackMutation.variables?.character.id === selectedHistoryItem?.character.id
              }
              onRegeneratePreview={
                selectedHistoryItem
                  ? () => regeneratePreviewFromHistoryItem(selectedHistoryItem)
                  : undefined
              }
              onReimportPreview={
                selectedHistoryPreviewItem
                  ? () => reimportMutation.mutate(selectedHistoryPreviewItem)
                  : undefined
              }
              onRetryFriendship={
                selectedHistoryItem
                  ? () => retryFriendshipMutation.mutate(selectedHistoryItem.character.id)
                  : undefined
              }
              onRollback={
                selectedHistoryItem
                  ? () => rollbackMutation.mutate(selectedHistoryItem)
                  : undefined
              }
              onLoadTemplateToManualInput={
                selectedHistoryItem
                  ? () => {
                      setRollbackGuideItem(selectedHistoryItem);
                      setManualBundleError(null);
                      setManualBundleJson(
                        JSON.stringify(
                          [buildRollbackGuideContactBundle(selectedHistoryItem)],
                          null,
                          2,
                        ),
                      );
                    }
                  : undefined
              }
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ImportResultPanel({
  result,
  title = "导入完成",
  description = `本轮共导入 ${result.importedCount} 个角色。`,
}: {
  result: WechatSyncImportResponse;
  title?: string;
  description?: string;
}) {
  return (
    <div className="mt-4 space-y-4">
      <AdminActionFeedback
        tone="success"
        title={title}
        description={description}
      />

      {result.items.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {result.items.map((item) => (
            <Card key={item.contactUsername} className="bg-[color:var(--surface-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-[color:var(--text-primary)]">
                    {item.character.name}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                    {item.displayName} · {item.status === "created" ? "新建角色" : "更新现有角色"}
                  </div>
                </div>
                <StatusPill tone="healthy">
                  {item.friendshipCreated ? "已建立好友" : "好友已存在"}
                </StatusPill>
              </div>
              <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                已生成朋友圈种子：{item.seededMomentCount} 条
              </div>
              <div className="mt-4">
                <Link
                  to="/characters/$characterId"
                  params={{ characterId: item.character.id }}
                >
                  <Button variant="secondary" size="sm">
                    打开角色工作区
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {result.skipped.length ? (
        <Card className="bg-[color:var(--surface-card)]">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            跳过项
          </div>
          <div className="mt-3 space-y-2">
            {result.skipped.map((item) => (
              <div
                key={`${item.contactUsername}-${item.reason}`}
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--text-secondary)]"
              >
                {item.displayName || item.contactUsername}：{item.reason}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function WechatSyncHistoryCard({
  item,
  selected,
  retryPending,
  rollbackPending,
  onSelect,
  onRegeneratePreview,
  onRetryFriendship,
  onRollback,
}: {
  item: WechatSyncHistoryItem;
  selected: boolean;
  retryPending: boolean;
  rollbackPending: boolean;
  onSelect: () => void;
  onRegeneratePreview: () => void;
  onRetryFriendship: () => void;
  onRollback: () => void;
}) {
  const currentSnapshot = item.character.profile?.wechatSyncImport?.currentSnapshot;
  const friendshipTone =
    item.friendshipStatus === "friend" ||
    item.friendshipStatus === "close" ||
    item.friendshipStatus === "best"
      ? "healthy"
      : item.friendshipStatus === "removed" || item.friendshipStatus === "blocked"
        ? "warning"
        : "muted";

  return (
    <Card
      className={`bg-[color:var(--surface-card)] ${selected ? "ring-2 ring-sky-200" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {item.character.name}
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            {item.remarkName || item.character.relationship}
          </div>
        </div>
        <StatusPill tone={friendshipTone}>
          {formatFriendshipStatus(item.friendshipStatus)}
        </StatusPill>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title="导入信息">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div>导入时间：{formatDateTime(item.importedAt)}</div>
            <div>
              导入版本：
              {currentSnapshot ? `v${currentSnapshot.version}` : "未持久化"}
            </div>
            <div>朋友圈种子：{item.seededMomentCount} 条</div>
            <div>来源键：{item.character.sourceKey || "暂无"}</div>
            <div>地区：{item.region || "暂无"}</div>
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="好友状态">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div>当前状态：{formatFriendshipStatus(item.friendshipStatus)}</div>
            <div>建立时间：{formatDateTime(item.friendshipCreatedAt)}</div>
            <div>最近互动：{formatDateTime(item.lastInteractedAt)}</div>
            <div>标签：{item.tags.length ? item.tags.join("、") : "暂无"}</div>
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={selected ? "primary" : "secondary"} size="sm" onClick={onSelect}>
          {selected ? "详情已展开" : "查看详情"}
        </Button>
        <Link
          to="/characters/$characterId"
          params={{ characterId: item.character.id }}
        >
          <Button variant="secondary" size="sm">
            打开角色工作区
          </Button>
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRegeneratePreview}
          disabled={retryPending || rollbackPending}
        >
          重新生成预览
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetryFriendship}
          disabled={retryPending || rollbackPending}
        >
          {retryPending ? "补建中..." : "补建好友关系"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onRollback}
          disabled={rollbackPending || retryPending}
        >
          {rollbackPending ? "回滚中..." : "回滚导入"}
        </Button>
      </div>
    </Card>
  );
}

function HistoryDetailPanel({
  item,
  matchedPreviewItem,
  matchedPreviewValidationIssues,
  previewPending,
  reimportPending,
  retryPending,
  rollbackPending,
  onRegeneratePreview,
  onReimportPreview,
  onRetryFriendship,
  onRollback,
  onLoadTemplateToManualInput,
}: {
  item: WechatSyncHistoryItem | null;
  matchedPreviewItem: WechatSyncPreviewItem | null;
  matchedPreviewValidationIssues: string[];
  previewPending: boolean;
  reimportPending: boolean;
  retryPending: boolean;
  rollbackPending: boolean;
  onRegeneratePreview?: () => void;
  onReimportPreview?: () => void;
  onRetryFriendship?: () => void;
  onRollback?: () => void;
  onLoadTemplateToManualInput?: () => void;
}) {
  if (!item) {
    return (
      <Card className="bg-[color:var(--surface-card)]">
        <div className="text-base font-semibold text-[color:var(--text-primary)]">
          导入详情
        </div>
        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          当前没有可查看的历史项，先在左侧选择一条已导入记录。
        </div>
      </Card>
    );
  }

  const currentImportSnapshot =
    item.character.profile?.wechatSyncImport?.currentSnapshot ?? null;
  const previousImportSnapshot =
    item.character.profile?.wechatSyncImport?.previousSnapshot ?? null;

  return (
    <Card className="bg-[color:var(--surface-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {item.character.name}
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            {item.remarkName || item.character.relationship}
          </div>
        </div>
        <StatusPill
          tone={
            isActiveFriendshipStatus(item.friendshipStatus)
              ? "healthy"
              : item.friendshipStatus === "removed" || item.friendshipStatus === "blocked"
                ? "warning"
                : "muted"
          }
        >
          {formatFriendshipStatus(item.friendshipStatus)}
        </StatusPill>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AdminMiniPanel title="导入轨迹">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div>导入时间：{formatDateTime(item.importedAt)}</div>
            <div>来源键：{item.character.sourceKey || "暂无"}</div>
            <div>最近互动：{formatDateTime(item.lastInteractedAt)}</div>
            <div>朋友圈种子：{item.seededMomentCount} 条</div>
          </div>
        </AdminMiniPanel>
        <AdminMiniPanel title="角色摘要">
          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
            <div>关系：{item.character.relationship || "暂无"}</div>
            <div>地区：{item.region || "暂无"}</div>
            <div>
              领域：
              {item.character.expertDomains.length
                ? item.character.expertDomains.join("、")
                : "暂无"}
            </div>
            <div>标签：{item.tags.length ? item.tags.join("、") : "暂无"}</div>
          </div>
        </AdminMiniPanel>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            角色简介
          </div>
          <div className="mt-2 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            {item.character.bio || "暂无简介。"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            记忆摘要
          </div>
          <div className="mt-2 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            {item.character.profile?.memorySummary || "暂无记忆摘要。"}
          </div>
        </div>
      </div>

      {currentImportSnapshot ? (
        <div className="mt-4 space-y-4">
          <AdminCallout
            title={
              previousImportSnapshot
                ? "最近两次导入预览快照已持久化"
                : "当前导入预览快照已持久化"
            }
            tone={previousImportSnapshot ? "info" : "success"}
            description={
              previousImportSnapshot ? (
                <div className="space-y-2">
                  <p>
                    当前线上角色保存了 `v{previousImportSnapshot.version}` 到
                    `v{currentImportSnapshot.version}` 的导入快照。
                  </p>
                  <p>下面展示的是“上一版导入草稿 / 当前导入草稿”的字段差异，可直接用于回看这次同步改了什么。</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>这条记录已经持久化了最近一次导入快照。</p>
                  <p>后续再次导入时，会把当前快照滚到上一版，形成可对照的版本链。</p>
                </div>
              )
            }
          />

          {previousImportSnapshot ? (
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                上一次导入版本 / 当前导入版本
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {buildPersistedImportVersionDiffs(
                  previousImportSnapshot,
                  currentImportSnapshot,
                ).map((diff) => (
                  <HistoryDiffCard key={`snapshot-${diff.label}`} diff={diff} />
                ))}
              </div>
            </div>
          ) : (
            <AdminMiniPanel title="当前导入快照">
              <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                <div>版本：v{currentImportSnapshot.version}</div>
                <div>导入时间：{formatDateTime(currentImportSnapshot.importedAt)}</div>
                <div>导入状态：{currentImportSnapshot.status === "created" ? "首次创建" : "覆盖更新"}</div>
                <div>自动加好友：{currentImportSnapshot.autoAddFriend ? "是" : "否"}</div>
                <div>朋友圈种子：{currentImportSnapshot.seededMomentCount} 条</div>
              </div>
            </AdminMiniPanel>
          )}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {matchedPreviewItem ? (
          <>
            <AdminCallout
              title={
                matchedPreviewValidationIssues.length
                  ? "当前已有对应预览，但还不能直接再导入"
                  : hasHistoryPreviewChanges(item, matchedPreviewItem)
                    ? "当前预览与线上角色存在差异"
                    : "当前预览与线上角色已经一致"
              }
              tone={
                matchedPreviewValidationIssues.length
                  ? "warning"
                  : hasHistoryPreviewChanges(item, matchedPreviewItem)
                    ? "info"
                    : "success"
              }
              description={
                matchedPreviewValidationIssues.length ? (
                  <div className="space-y-2">
                    <p>当前已经命中了这条历史项对应的预览草稿，但还有未通过校验的字段，暂时不能直接再导入。</p>
                    <p>请先在上方“角色预览”卡片里补齐缺失字段，再回来执行一键再导入。</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p>这条历史项已经和当前预览草稿关联上了。下面会按“当前线上角色 / 当前预览草稿”展示字段差异。</p>
                    <p>确认无误后，可以直接按当前预览重新导入，后台会按同一个 `sourceKey` 更新角色与好友资料。</p>
                  </div>
                )
              }
            />

            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                当前线上角色 / 当前预览草稿
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {buildHistoryPreviewDiffs(item, matchedPreviewItem).map((diff) => (
                  <HistoryDiffCard key={diff.label} diff={diff} />
                ))}
              </div>
            </div>

            {matchedPreviewValidationIssues.length ? (
              <div className="space-y-2">
                {matchedPreviewValidationIssues.map((issue) => (
                  <div
                    key={issue}
                    className="rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-[color:var(--text-secondary)]"
                  >
                    {issue}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <AdminCallout
            title="当前还没有这条历史项的再导入预览"
            tone="muted"
            description="点“一键重新生成预览”后，这里会自动关联对应草稿，并显示字段差异与再导入按钮。"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onReimportPreview}
          disabled={
            reimportPending ||
            !onReimportPreview ||
            matchedPreviewValidationIssues.length > 0
          }
        >
          {reimportPending ? "再导入中..." : "按当前预览重新导入"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRegeneratePreview}
          disabled={previewPending || !onRegeneratePreview}
        >
          {previewPending ? "重新生成中..." : "一键重新生成预览"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onLoadTemplateToManualInput}
          disabled={!onLoadTemplateToManualInput}
        >
          写回手动导入区
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetryFriendship}
          disabled={retryPending || rollbackPending || !onRetryFriendship}
        >
          {retryPending ? "补建中..." : "补建好友关系"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onRollback}
          disabled={rollbackPending || retryPending || !onRollback}
        >
          {rollbackPending ? "回滚中..." : "回滚导入"}
        </Button>
      </div>
    </Card>
  );
}

function HistoryDiffCard({
  diff,
}: {
  diff: HistoryDiffCardValue;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        diff.changed
          ? "border-sky-200 bg-sky-50/80"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {diff.label}
        </div>
        <StatusPill tone={diff.changed ? "warning" : "healthy"}>
          {diff.changed ? "有变化" : "一致"}
        </StatusPill>
      </div>
      <div className="mt-3 grid gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            当前线上角色
          </div>
          <div className="mt-1 rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {diff.currentValue}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            当前预览草稿
          </div>
          <div className="mt-1 rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {diff.nextValue}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCharacterCard({
  item,
  selected,
  validationIssues,
  onRemove,
  onToggleSelect,
  onNameChange,
  onRelationshipChange,
  onBioChange,
  onDomainsChange,
  onMemorySummaryChange,
}: {
  item: WechatSyncPreviewItem;
  selected: boolean;
  validationIssues: string[];
  onRemove: () => void;
  onToggleSelect: () => void;
  onNameChange: (value: string) => void;
  onRelationshipChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onDomainsChange: (value: string) => void;
  onMemorySummaryChange: (value: string) => void;
}) {
  const draft = item.draftCharacter;
  const confidenceTone =
    item.confidence === "high"
      ? "healthy"
      : item.confidence === "medium"
        ? "warning"
        : "muted";
  const domains = (draft.expertDomains?.length
    ? draft.expertDomains
    : ["general"]).join("、");

  return (
    <Card className="bg-[color:var(--surface-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-[color:var(--text-primary)]">
            {draft.name || item.contact.displayName}
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            来源联系人：{item.contact.displayName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={confidenceTone}>
            {item.confidence === "high"
              ? "高置信"
              : item.confidence === "medium"
                ? "中置信"
                : "低置信"}
          </StatusPill>
          <Button
            variant={selected ? "primary" : "secondary"}
            size="sm"
            onClick={onToggleSelect}
          >
            {selected ? "已选中" : "加入批量"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onRemove}>
            移出本轮
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AdminTextField
              label="角色名"
              value={draft.name || ""}
              onChange={onNameChange}
              placeholder="导入后的角色名"
            />
            <AdminTextField
              label="领域标签（逗号分隔）"
              value={draft.expertDomains?.join(", ") || ""}
              onChange={onDomainsChange}
              placeholder="例如：产品, 创业, 出差"
            />
          </div>
          <AdminTextField
            label="关系定位"
            value={draft.relationship || ""}
            onChange={onRelationshipChange}
            placeholder="描述你和这个联系人的关系"
          />
          <AdminTextArea
            label="角色简介"
            value={draft.bio || ""}
            onChange={onBioChange}
            textareaClassName="min-h-24"
            placeholder="导入后的角色简介"
          />
          <AdminTextArea
            label="记忆摘要"
            value={draft.profile?.memorySummary || ""}
            onChange={onMemorySummaryChange}
            textareaClassName="min-h-28"
            placeholder="总结这位联系人与你的长期熟悉关系"
          />
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-3 text-sm text-[color:var(--text-secondary)]">
            当前导入字段概览：领域 {domains}
          </div>
        </div>

        <div className="space-y-3">
          <AdminMiniPanel title="源联系人上下文">
            <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
              <div>用户名：{item.contact.username}</div>
              <div>备注 / 昵称：{item.contact.remarkName || item.contact.nickname || "暂无"}</div>
              <div>地区：{item.contact.region || "暂无"}</div>
              <div>消息数：{item.contact.messageCount}</div>
              <div>最近聊天：{formatDateTime(item.contact.latestMessageAt)}</div>
              <div>标签：{item.contact.tags.length ? item.contact.tags.join("、") : "暂无"}</div>
              <div>
                关键词：
                {item.contact.topicKeywords.length
                  ? item.contact.topicKeywords.join("、")
                  : "暂无"}
              </div>
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title="聊天摘要">
            <div className="text-sm leading-6 text-[color:var(--text-secondary)]">
              {item.contact.chatSummary || "当前没有附带聊天摘要。"}
            </div>
          </AdminMiniPanel>
          <AdminMiniPanel title="聊天样本">
            <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
              {item.contact.sampleMessages.length ? (
                item.contact.sampleMessages.slice(0, 4).map((message) => (
                  <div
                    key={`${message.timestamp}-${message.text}`}
                    className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2"
                  >
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {message.sender || formatDirection(message.direction)} · {message.timestamp}
                    </div>
                    <div className="mt-1 leading-6">{message.text}</div>
                  </div>
                ))
              ) : (
                <div>当前没有聊天样本。</div>
              )}
            </div>
          </AdminMiniPanel>
        </div>
      </div>

      {item.warnings.length ? (
        <div className="mt-4 space-y-2">
          {item.warnings.map((warning) => (
            <div
              key={warning}
              className="rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-[color:var(--text-secondary)]"
            >
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      {validationIssues.length ? (
        <div className="mt-4 space-y-2">
          {validationIssues.map((issue) => (
            <div
              key={issue}
              className="rounded-2xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-[color:var(--text-secondary)]"
            >
              {issue}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadSelectedConnectorContacts(
  baseUrl: string,
  usernames: string[],
) {
  if (!usernames.length) {
    throw new Error("请先至少选择一个联系人。");
  }
  return buildWechatConnectorContactBundles(baseUrl, usernames);
}

function parseWechatSyncContactBundles(value: string): WechatSyncContactBundle[] {
  const raw = value.trim();
  if (!raw) {
    throw new Error("请先粘贴联系人快照 JSON。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("联系人快照不是合法 JSON。");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("联系人快照必须是 JSON 数组。");
  }

  const contacts = parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`第 ${index + 1} 个联系人不是对象。`);
    }
    const username = readString(entry.username);
    const displayName =
      readString(entry.displayName) ||
      readString(entry.remarkName) ||
      readString(entry.nickname);
    if (!username) {
      throw new Error(`第 ${index + 1} 个联系人缺少 username。`);
    }
    if (!displayName) {
      throw new Error(`第 ${index + 1} 个联系人缺少 displayName。`);
    }

    return {
      username,
      displayName,
      nickname: readNullableString(entry.nickname),
      remarkName: readNullableString(entry.remarkName),
      region: readNullableString(entry.region),
      source: readNullableString(entry.source),
      tags: readStringArray(entry.tags),
      isGroup: entry.isGroup === true,
      messageCount: readNumber(entry.messageCount),
      ownerMessageCount: readNumber(entry.ownerMessageCount),
      contactMessageCount: readNumber(entry.contactMessageCount),
      latestMessageAt: readNullableString(entry.latestMessageAt),
      chatSummary: readNullableString(entry.chatSummary),
      topicKeywords: readStringArray(entry.topicKeywords),
      sampleMessages: readMessageSamples(entry.sampleMessages),
      momentHighlights: readMomentHighlights(entry.momentHighlights),
    } satisfies WechatSyncContactBundle;
  });

  if (!contacts.length) {
    throw new Error("联系人快照为空，无法生成预览。");
  }

  return contacts;
}

function readMessageSamples(value: unknown): WechatSyncContactBundle["sampleMessages"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const text = readString(entry.text);
      if (!text) {
        return null;
      }
      return {
        timestamp: readString(entry.timestamp),
        text,
        sender: readNullableString(entry.sender),
        typeLabel: readNullableString(entry.typeLabel),
        direction: normalizeMessageDirection(entry.direction),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
}

function readMomentHighlights(
  value: unknown,
): WechatSyncContactBundle["momentHighlights"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const text = readString(entry.text);
      if (!text) {
        return null;
      }
      return {
        postedAt: readNullableString(entry.postedAt),
        text,
        location: readNullableString(entry.location),
        mediaHint: readNullableString(entry.mediaHint),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
}

function normalizeMessageDirection(
  value: unknown,
): WechatSyncContactBundle["sampleMessages"][number]["direction"] {
  switch (value) {
    case "owner":
    case "contact":
    case "group_member":
    case "system":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readString(entry))
    .filter(Boolean);
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function patchDraftIdentity(
  draft: CharacterDraft,
  patch: { name?: string; relationship?: string },
): CharacterDraft {
  const profile = draft.profile;

  return {
    ...draft,
    name: patch.name ?? draft.name,
    relationship: patch.relationship ?? draft.relationship,
    profile: profile
      ? {
          ...profile,
          name: patch.name ?? profile.name,
          relationship: patch.relationship ?? profile.relationship,
        }
      : profile,
  };
}

function patchDraftDomains(draft: CharacterDraft, value: string): CharacterDraft {
  const expertDomains = splitCsv(value);
  const profile = draft.profile;

  return {
    ...draft,
    expertDomains,
    profile: profile
      ? {
          ...profile,
          expertDomains,
        }
      : profile,
  };
}

function mergeDraftDomains(
  draft: CharacterDraft,
  additions: string[],
): CharacterDraft {
  const expertDomains = Array.from(
    new Set([...(draft.expertDomains ?? []), ...additions]),
  );
  const profile = draft.profile;

  return {
    ...draft,
    expertDomains,
    profile: profile
      ? {
          ...profile,
          expertDomains,
        }
      : profile,
  };
}

function patchDraftMemorySummary(
  draft: CharacterDraft,
  value: string,
): CharacterDraft {
  const profile = draft.profile;
  if (!profile) {
    return draft;
  }

  return {
    ...draft,
    profile: {
      ...profile,
      memorySummary: value,
      memory: profile.memory
        ? {
            ...profile.memory,
            recentSummary: value,
          }
        : profile.memory,
    },
  };
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDirection(
  value: WechatSyncContactBundle["sampleMessages"][number]["direction"],
) {
  switch (value) {
    case "owner":
      return "我";
    case "contact":
      return "联系人";
    case "group_member":
      return "群成员";
    case "system":
      return "系统";
    default:
      return "未知";
  }
}

function formatFriendshipStatus(value?: string | null) {
  switch (value) {
    case "friend":
      return "好友";
    case "close":
      return "亲密好友";
    case "best":
      return "挚友";
    case "removed":
      return "已移除";
    case "blocked":
      return "已屏蔽";
    default:
      return "未建立";
  }
}

function isActiveFriendshipStatus(value?: string | null) {
  return value === "friend" || value === "close" || value === "best";
}

function extractWechatUsername(sourceKey?: string | null) {
  if (!sourceKey) {
    return "";
  }
  return sourceKey.startsWith("wechat:") ? sourceKey.slice("wechat:".length) : sourceKey;
}

function buildRollbackGuideContactBundle(
  item: WechatSyncHistoryItem,
): WechatSyncContactBundle {
  const snapshotContact =
    item.character.profile?.wechatSyncImport?.currentSnapshot?.contact ?? null;
  if (snapshotContact) {
    return {
      ...snapshotContact,
      remarkName: item.remarkName || snapshotContact.remarkName || null,
      region: item.region || snapshotContact.region || null,
      tags: item.tags.length ? item.tags : snapshotContact.tags,
    };
  }

  const username =
    extractWechatUsername(item.character.sourceKey) || `wechat_import_${item.character.id}`;
  const displayName =
    item.remarkName?.trim() ||
    item.character.name.trim() ||
    "未命名联系人";
  const memorySummary =
    item.character.profile?.memorySummary?.trim() ||
    item.character.bio?.trim() ||
    item.character.relationship?.trim() ||
    `${displayName} 是曾经导入过的微信联系人。`;

  return {
    username,
    displayName,
    nickname: item.character.name,
    remarkName: item.remarkName || item.character.name,
    region: item.region || null,
    source: "wechat_rollback_template",
    tags: item.tags,
    isGroup: false,
    messageCount: 0,
    ownerMessageCount: 0,
    contactMessageCount: 0,
    latestMessageAt: item.lastInteractedAt || item.importedAt || null,
    chatSummary: memorySummary,
    topicKeywords: item.character.expertDomains.slice(0, 8),
    sampleMessages: [],
    momentHighlights: [],
  };
}

type HistoryDiffCardValue = {
  label: string;
  currentValue: string;
  nextValue: string;
  changed: boolean;
};

function findPreviewItemForHistoryItem(
  item: WechatSyncHistoryItem,
  previewItems: WechatSyncPreviewItem[],
) {
  const username = extractWechatUsername(item.character.sourceKey);
  if (username) {
    const byUsername = previewItems.find(
      (previewItem) => previewItem.contact.username === username,
    );
    if (byUsername) {
      return byUsername;
    }
  }

  return previewItems.find(
    (previewItem) =>
      previewItem.draftCharacter.sourceKey === item.character.sourceKey,
  ) ?? null;
}

function buildHistoryPreviewDiffs(
  item: WechatSyncHistoryItem,
  previewItem: WechatSyncPreviewItem,
) {
  return [
    createHistoryPreviewDiff(
      "角色名",
      item.character.name,
      previewItem.draftCharacter.name?.trim() || previewItem.contact.displayName,
    ),
    createHistoryPreviewDiff(
      "关系定位",
      item.character.relationship,
      previewItem.draftCharacter.relationship?.trim() || "暂无",
    ),
    createHistoryPreviewDiff(
      "角色简介",
      item.character.bio,
      previewItem.draftCharacter.bio?.trim() || "暂无",
    ),
    createHistoryPreviewDiff(
      "领域标签",
      item.character.expertDomains.join("、"),
      (previewItem.draftCharacter.expertDomains ?? []).join("、"),
    ),
    createHistoryPreviewDiff(
      "记忆摘要",
      item.character.profile?.memorySummary || "",
      previewItem.draftCharacter.profile?.memorySummary?.trim() || "暂无",
    ),
    createHistoryPreviewDiff(
      "微信备注/显示名",
      item.remarkName?.trim() || item.character.name,
      previewItem.contact.remarkName?.trim() ||
        previewItem.contact.nickname?.trim() ||
        previewItem.contact.displayName,
    ),
    createHistoryPreviewDiff(
      "地区",
      item.region?.trim() || "暂无",
      previewItem.contact.region?.trim() || "暂无",
    ),
    createHistoryPreviewDiff(
      "联系人标签",
      item.tags.join("、"),
      previewItem.contact.tags.join("、"),
    ),
  ];
}

function hasHistoryPreviewChanges(
  item: WechatSyncHistoryItem,
  previewItem: WechatSyncPreviewItem,
) {
  return buildHistoryPreviewDiffs(item, previewItem).some((diff) => diff.changed);
}

function buildPersistedImportVersionDiffs(
  previousSnapshot: NonNullable<
    WechatSyncHistoryItem["character"]["profile"]["wechatSyncImport"]
  >["previousSnapshot"],
  currentSnapshot: NonNullable<
    WechatSyncHistoryItem["character"]["profile"]["wechatSyncImport"]
  >["currentSnapshot"],
) {
  return [
    createHistoryPreviewDiff(
      "版本与导入时间",
      `v${previousSnapshot?.version ?? 0} · ${formatDateTime(previousSnapshot?.importedAt)}`,
      `v${currentSnapshot?.version ?? 0} · ${formatDateTime(currentSnapshot?.importedAt)}`,
    ),
    createHistoryPreviewDiff(
      "角色名",
      previousSnapshot?.draftCharacter.name ?? "暂无",
      currentSnapshot?.draftCharacter.name ?? "暂无",
    ),
    createHistoryPreviewDiff(
      "关系定位",
      previousSnapshot?.draftCharacter.relationship ?? "暂无",
      currentSnapshot?.draftCharacter.relationship ?? "暂无",
    ),
    createHistoryPreviewDiff(
      "角色简介",
      previousSnapshot?.draftCharacter.bio ?? "暂无",
      currentSnapshot?.draftCharacter.bio ?? "暂无",
    ),
    createHistoryPreviewDiff(
      "领域标签",
      (previousSnapshot?.draftCharacter.expertDomains ?? []).join("、"),
      (currentSnapshot?.draftCharacter.expertDomains ?? []).join("、"),
    ),
    createHistoryPreviewDiff(
      "记忆摘要",
      previousSnapshot?.draftCharacter.memorySummary ?? "暂无",
      currentSnapshot?.draftCharacter.memorySummary ?? "暂无",
    ),
    createHistoryPreviewDiff(
      "联系人备注 / 显示名",
      previousSnapshot?.contact.remarkName?.trim() ||
        previousSnapshot?.contact.displayName ||
        "暂无",
      currentSnapshot?.contact.remarkName?.trim() ||
        currentSnapshot?.contact.displayName ||
        "暂无",
    ),
    createHistoryPreviewDiff(
      "地区",
      previousSnapshot?.contact.region ?? "暂无",
      currentSnapshot?.contact.region ?? "暂无",
    ),
    createHistoryPreviewDiff(
      "联系人标签",
      (previousSnapshot?.contact.tags ?? []).join("、"),
      (currentSnapshot?.contact.tags ?? []).join("、"),
    ),
    createHistoryPreviewDiff(
      "聊天摘要",
      previousSnapshot?.contact.chatSummary ?? "暂无",
      currentSnapshot?.contact.chatSummary ?? "暂无",
    ),
  ];
}

function createHistoryPreviewDiff(
  label: string,
  currentValue: string,
  nextValue: string,
) {
  const normalizedCurrent = normalizeHistoryDiffValue(currentValue);
  const normalizedNext = normalizeHistoryDiffValue(nextValue);
  return {
    label,
    currentValue: normalizedCurrent,
    nextValue: normalizedNext,
    changed: normalizedCurrent !== normalizedNext,
  };
}

function normalizeHistoryDiffValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "暂无";
}

function validatePreviewItem(item: WechatSyncPreviewItem) {
  const issues: string[] = [];
  const name = item.draftCharacter.name?.trim();
  const relationship = item.draftCharacter.relationship?.trim();
  const bio = item.draftCharacter.bio?.trim();
  const expertDomains =
    item.draftCharacter.expertDomains?.filter((entry) => entry.trim().length > 0) ??
    [];
  const memorySummary = item.draftCharacter.profile?.memorySummary?.trim();

  if (!name) {
    issues.push("缺少角色名。");
  }
  if (!relationship) {
    issues.push("缺少关系定位。");
  }
  if (!bio) {
    issues.push("缺少角色简介。");
  }
  if (expertDomains.length === 0) {
    issues.push("至少需要一个领域标签。");
  }
  if (!memorySummary) {
    issues.push("缺少记忆摘要。");
  }

  return issues;
}

function fillWechatSyncDraftBlanks(
  contact: WechatSyncContactBundle,
  draft: CharacterDraft,
): CharacterDraft {
  const resolvedName =
    draft.name?.trim() ||
    contact.remarkName?.trim() ||
    contact.nickname?.trim() ||
    contact.displayName;
  const relationship =
    draft.relationship?.trim() ||
    `${resolvedName} 是你现实微信里的熟人朋友，你们已经有真实聊天记录。`;
  const bio =
    draft.bio?.trim() ||
    contact.chatSummary?.trim() ||
    `${resolvedName} 是从本地联系人资料导入的熟人朋友。`;
  const expertDomains =
    draft.expertDomains?.filter((entry) => entry.trim().length > 0).length
      ? draft.expertDomains
      : inferContactDomains(contact);
  const profile = draft.profile;
  const memorySummary =
    profile?.memorySummary?.trim() ||
    contact.chatSummary?.trim() ||
    `${resolvedName} 和你保持着稳定的微信联系，彼此已经有明确的熟人语境。`;

  return {
    ...draft,
    name: resolvedName,
    relationship,
    bio,
    expertDomains,
    profile: profile
      ? {
          ...profile,
          name: profile.name?.trim() || resolvedName,
          relationship: profile.relationship?.trim() || relationship,
          expertDomains:
            profile.expertDomains?.filter((entry) => entry.trim().length > 0).length
              ? profile.expertDomains
              : expertDomains,
          memorySummary,
          memory: profile.memory
            ? {
                ...profile.memory,
                recentSummary:
                  profile.memory.recentSummary?.trim() || memorySummary,
              }
            : profile.memory,
        }
      : profile,
  };
}

function inferContactDomains(contact: WechatSyncContactBundle) {
  const inferred = [...contact.topicKeywords, ...contact.tags].filter(
    (entry) => entry.trim().length > 0,
  );
  return inferred.length ? Array.from(new Set(inferred)).slice(0, 6) : ["general"];
}
