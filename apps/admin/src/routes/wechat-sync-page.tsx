import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  CharacterDraft,
  WechatSyncContactBundle,
  WechatSyncHistoryItem,
  WechatSyncImportResponse,
  WechatSyncPreviewItem,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
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
import { adminApi } from "../lib/admin-api";
import {
  buildWechatConnectorContactBundles,
  getWechatConnectorHealth,
  listWechatConnectorContacts,
  loadWechatConnectorSettings,
  patchWechatConnectorConfig,
  saveWechatConnectorSettings,
  scanWechatConnector,
  type WechatConnectorProviderKey,
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

const WECHAT_SYNC_LOCAL_VIEW_STATE_STORAGE_KEY =
  "yinjie.admin.wechat-sync.local-view-state.v1";
const WECHAT_SYNC_ANNOTATIONS_STORAGE_KEY =
  "yinjie.admin.wechat-sync.annotations.v1";
const WECHAT_SYNC_ANNOTATION_TEMPLATES_STORAGE_KEY =
  "yinjie.admin.wechat-sync.annotation-templates.v1";

const DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES: WechatSyncAnnotationTemplate[] =
  [
    {
      id: "default-reliable-source",
      label: "来源可信",
      content: "聊天样本与联系人标签基本一致，当前资料可作为后续角色修订依据。",
      source: "default",
      isPinned: false,
      scope: "all",
    },
    {
      id: "default-needs-review",
      label: "需二次核验",
      content: "聊天摘要和联系人画像仍需二次核验，暂不建议直接覆盖线上角色。",
      source: "default",
      isPinned: false,
      scope: "all",
    },
    {
      id: "default-safe-restore",
      label: "适合恢复线上",
      content: "当前信息完整，适合直接恢复为线上角色并保留现有好友关系。",
      source: "default",
      isPinned: false,
      scope: "snapshot",
    },
    {
      id: "default-trim-summary",
      label: "建议压缩摘要",
      content: "摘要信息偏长，建议先压缩成关键事实，再执行重导入或版本恢复。",
      source: "default",
      isPinned: false,
      scope: "record",
    },
  ];

export function WechatSyncPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const initialViewState = readInitialWechatSyncViewState();
  const initialHasSharedView = hasWechatSyncViewQueryState();
  const [connectorSettings, setConnectorSettings] =
    useState<WechatConnectorSettings>(() => loadWechatConnectorSettings());
  const [connectorProviderKey, setConnectorProviderKey] =
    useState<WechatConnectorProviderKey>("manual-json");
  const [connectorManualJsonPath, setConnectorManualJsonPath] = useState("");
  const [connectorWechatDecryptBaseUrl, setConnectorWechatDecryptBaseUrl] =
    useState("http://127.0.0.1:5678");
  const [connectorConfigHydrated, setConnectorConfigHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [includeGroups, setIncludeGroups] = useState(false);
  const [autoAddFriend, setAutoAddFriend] = useState(true);
  const [seedMoments, setSeedMoments] = useState(true);
  const [manualBundleJson, setManualBundleJson] = useState("");
  const [manualBundleError, setManualBundleError] = useState<string | null>(
    null,
  );
  const [manualBundleFileName, setManualBundleFileName] = useState<
    string | null
  >(null);
  const [connectorProbeRequested, setConnectorProbeRequested] = useState(false);
  const manualBundleFileInputRef = useRef<HTMLInputElement | null>(null);
  const [historySearch, setHistorySearch] = useState(
    initialViewState.historySearch,
  );
  const [historyStatusFilter, setHistoryStatusFilter] = useState<
    "all" | "active" | "attention" | "removed"
  >(initialViewState.historyStatusFilter);
  const [selectedHistoryCharacterId, setSelectedHistoryCharacterId] = useState<
    string | null
  >(initialViewState.selectedHistoryCharacterId);
  const [rollbackGuideItem, setRollbackGuideItem] =
    useState<WechatSyncHistoryItem | null>(null);
  const [pendingSnapshotRestore, setPendingSnapshotRestore] = useState<{
    historyItem: WechatSyncHistoryItem;
    snapshot: WechatImportSnapshotLike;
  } | null>(null);
  const [focusedHistorySnapshotKey, setFocusedHistorySnapshotKey] = useState<
    string | null
  >(null);
  const [auditSearch, setAuditSearch] = useState(initialViewState.auditSearch);
  const [auditModeFilter, setAuditModeFilter] = useState<
    "all" | "preview_import" | "snapshot_restore"
  >(initialViewState.auditModeFilter);
  const [auditExpandedRecordId, setAuditExpandedRecordId] = useState<
    string | null
  >(initialViewState.auditExpandedRecordId);
  const [linkedAuditVersion, setLinkedAuditVersion] = useState<number | null>(
    initialViewState.linkedAuditVersion,
  );
  const [preserveSharedViewState, setPreserveSharedViewState] =
    useState(initialHasSharedView);
  const [restorableLocalViewState, setRestorableLocalViewState] =
    useState<WechatSyncViewState | null>(() =>
      initialHasSharedView ? readSavedWechatSyncLocalViewState() : null,
    );
  const [annotations, setAnnotations] = useState<WechatSyncAnnotationsState>(
    () => readWechatSyncAnnotationsState(),
  );
  const [annotationTemplates, setAnnotationTemplates] = useState<
    WechatSyncAnnotationTemplate[]
  >(() => readWechatSyncAnnotationTemplates());
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [selectedPreviewUsernames, setSelectedPreviewUsernames] = useState<
    string[]
  >([]);
  const [batchRelationshipInput, setBatchRelationshipInput] = useState("");
  const [batchDomainInput, setBatchDomainInput] = useState("");
  const [previewItems, setPreviewItems] = useState<WechatSyncPreviewItem[]>([]);
  const deferredSearch = useDeferredValue(search.trim());
  const deferredHistorySearch = useDeferredValue(
    historySearch.trim().toLowerCase(),
  );

  useEffect(() => {
    if (!focusedHistorySnapshotKey) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setFocusedHistorySnapshotKey((current) =>
        current === focusedHistorySnapshotKey ? null : current,
      );
    }, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [focusedHistorySnapshotKey]);

  useEffect(() => {
    syncWechatSyncViewStateToUrl({
      historySearch,
      historyStatusFilter,
      selectedHistoryCharacterId,
      auditSearch,
      auditModeFilter,
      auditExpandedRecordId,
      linkedAuditVersion,
    });
  }, [
    auditExpandedRecordId,
    auditModeFilter,
    auditSearch,
    historySearch,
    historyStatusFilter,
    linkedAuditVersion,
    selectedHistoryCharacterId,
  ]);

  useEffect(() => {
    if (preserveSharedViewState) {
      return;
    }
    saveWechatSyncLocalViewState({
      historySearch,
      historyStatusFilter,
      selectedHistoryCharacterId,
      auditSearch,
      auditModeFilter,
      auditExpandedRecordId,
      linkedAuditVersion,
    });
  }, [
    auditExpandedRecordId,
    auditModeFilter,
    auditSearch,
    historySearch,
    historyStatusFilter,
    linkedAuditVersion,
    preserveSharedViewState,
    selectedHistoryCharacterId,
  ]);

  useEffect(() => {
    persistWechatSyncAnnotationsState(annotations);
  }, [annotations]);

  useEffect(() => {
    persistWechatSyncAnnotationTemplates(annotationTemplates);
  }, [annotationTemplates]);

  const connectorHealthQuery = useQuery({
    queryKey: ["wechat-connector-health", connectorSettings.baseUrl],
    queryFn: () => getWechatConnectorHealth(connectorSettings.baseUrl),
    enabled: connectorProbeRequested,
    retry: false,
    refetchInterval: (query) =>
      connectorProbeRequested && query.state.status === "success"
        ? 10_000
        : false,
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
    enabled: connectorProbeRequested && connectorHealthQuery.isSuccess,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["admin-wechat-sync-history", baseUrl],
    queryFn: () => adminApi.getWechatSyncHistory(),
  });

  useEffect(() => {
    setConnectorConfigHydrated(false);
  }, [connectorSettings.baseUrl]);

  useEffect(() => {
    const activeConfig = connectorHealthQuery.data?.activeConfig;
    if (!activeConfig || connectorConfigHydrated) {
      return;
    }

    if (activeConfig.providerKey) {
      setConnectorProviderKey(activeConfig.providerKey);
    }
    setConnectorManualJsonPath(activeConfig.manualJsonPath ?? "");
    setConnectorWechatDecryptBaseUrl(
      activeConfig.wechatDecryptBaseUrl ?? "http://127.0.0.1:5678",
    );
    setConnectorConfigHydrated(true);
  }, [
    connectorConfigHydrated,
    connectorHealthQuery.data?.activeConfig,
  ]);

  const connectorReady =
    connectorHealthQuery.isSuccess && connectorHealthQuery.data.ok;
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
        (item) =>
          (previewValidation.get(item.contact.username)?.length ?? 0) > 0,
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
    return (
      previewValidation.get(selectedHistoryPreviewItem.contact.username) ?? []
    );
  }, [previewValidation, selectedHistoryPreviewItem]);

  useEffect(() => {
    if (
      selectedHistoryItem &&
      selectedHistoryCharacterId !== selectedHistoryItem.character.id
    ) {
      setSelectedHistoryCharacterId(selectedHistoryItem.character.id);
    }
  }, [selectedHistoryCharacterId, selectedHistoryItem]);

  const auditShareUrl = useMemo(
    () =>
      buildWechatSyncAuditShareUrl({
        historySearch,
        historyStatusFilter,
        selectedHistoryCharacterId,
        auditSearch,
        auditModeFilter,
        auditExpandedRecordId,
        linkedAuditVersion,
      }),
    [
      auditExpandedRecordId,
      auditModeFilter,
      auditSearch,
      historySearch,
      historyStatusFilter,
      linkedAuditVersion,
      selectedHistoryCharacterId,
    ],
  );

  function applyWechatSyncViewState(state: WechatSyncViewState) {
    setHistorySearch(state.historySearch);
    setHistoryStatusFilter(state.historyStatusFilter);
    setSelectedHistoryCharacterId(state.selectedHistoryCharacterId);
    setAuditSearch(state.auditSearch);
    setAuditModeFilter(state.auditModeFilter);
    setAuditExpandedRecordId(state.auditExpandedRecordId);
    setLinkedAuditVersion(state.linkedAuditVersion);
    setFocusedHistorySnapshotKey(null);
  }

  function restoreLocalWechatSyncViewState() {
    if (!restorableLocalViewState) {
      return;
    }
    applyWechatSyncViewState(restorableLocalViewState);
    setPreserveSharedViewState(false);
    setRestorableLocalViewState(null);
  }

  function adoptCurrentWechatSyncViewStateAsLocal() {
    const currentState = {
      historySearch,
      historyStatusFilter,
      selectedHistoryCharacterId,
      auditSearch,
      auditModeFilter,
      auditExpandedRecordId,
      linkedAuditVersion,
    } satisfies WechatSyncViewState;
    saveWechatSyncLocalViewState(currentState);
    setPreserveSharedViewState(false);
    setRestorableLocalViewState(null);
  }

  function selectHistoryItem(characterId: string) {
    setSelectedHistoryCharacterId(characterId);
    setAuditExpandedRecordId(null);
    setLinkedAuditVersion(null);
    setFocusedHistorySnapshotKey(null);
  }

  function requestConnectorProbe() {
    setConnectorProbeRequested(true);
    void connectorHealthQuery.refetch();
  }

  function buildConnectorSourceConfig() {
    return {
      providerKey: connectorProviderKey,
      manualJsonPath:
        connectorProviderKey === "manual-json"
          ? connectorManualJsonPath.trim() || null
          : null,
      wechatDecryptBaseUrl:
        connectorProviderKey === "wechat-decrypt-http"
          ? connectorWechatDecryptBaseUrl.trim() || null
          : null,
    };
  }

  const connectorSourceConfigReady =
    connectorProviderKey !== "wechat-decrypt-http" ||
    connectorWechatDecryptBaseUrl.trim().length > 0;

  const connectorConfigMutation = useMutation({
    mutationFn: () =>
      patchWechatConnectorConfig(
        connectorSettings.baseUrl,
        buildConnectorSourceConfig(),
      ),
    onSuccess: async () => {
      saveWechatConnectorSettings(connectorSettings);
      setConnectorProbeRequested(true);
      await queryClient.invalidateQueries({
        queryKey: ["wechat-connector-health", connectorSettings.baseUrl],
      });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      scanWechatConnector(
        connectorSettings.baseUrl,
        buildConnectorSourceConfig(),
      ),
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
      setSelectedPreviewUsernames(
        result.items.map((item) => item.contact.username),
      );
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
      setPendingSnapshotRestore(null);
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
      setPendingSnapshotRestore(null);
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
      setPendingSnapshotRestore(null);
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
  const restoreSnapshotMutation = useMutation({
    mutationFn: (input: {
      historyItem: WechatSyncHistoryItem;
      snapshot: WechatImportSnapshotLike;
    }) => {
      const restoredPreviewItem = buildPreviewItemFromImportSnapshot(
        input.snapshot,
      );
      return adminApi.importWechatSync({
        items: [
          {
            contact: restoredPreviewItem.contact,
            draftCharacter: restoredPreviewItem.draftCharacter,
            autoAddFriend,
            seedMoments,
            importMode: "snapshot_restore",
            restoredFromVersion: input.snapshot.version,
          },
        ],
      });
    },
    onSuccess: async (result, variables) => {
      setRollbackGuideItem(null);
      setPendingSnapshotRestore(null);
      setSelectedHistoryCharacterId(
        result.items[0]?.character.id ?? variables.historyItem.character.id,
      );
      const restoredPreviewItem = buildPreviewItemFromImportSnapshot(
        variables.snapshot,
      );
      setPreviewItems([restoredPreviewItem]);
      setSelectedUsernames([restoredPreviewItem.contact.username]);
      setSelectedPreviewUsernames([restoredPreviewItem.contact.username]);
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
    setSelectedUsernames(
      (contactsQuery.data ?? [])
        .filter((item) => !item.isGroup)
        .map((item) => item.username),
    );
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
      draftCharacter: fillWechatSyncDraftBlanks(
        item.contact,
        item.draftCharacter,
      ),
    }));
  }

  function loadRollbackGuideIntoManualInput() {
    if (!rollbackGuideItem) {
      return;
    }
    const snapshot =
      getImportSnapshotsFromHistoryItem(rollbackGuideItem)[0] ?? null;
    setPendingSnapshotRestore(null);
    loadSnapshotIntoManualInput(snapshot, rollbackGuideItem);
  }

  function requestRestoreSnapshotToLive(
    historyItem: WechatSyncHistoryItem,
    snapshot: WechatImportSnapshotLike,
  ) {
    restoreSnapshotMutation.reset();
    setPendingSnapshotRestore({ historyItem, snapshot });
  }

  function cancelRestoreSnapshotToLive() {
    setPendingSnapshotRestore(null);
  }

  function confirmRestoreSnapshotToLive() {
    if (!pendingSnapshotRestore) {
      return;
    }
    restoreSnapshotMutation.mutate(pendingSnapshotRestore);
  }

  function focusSnapshotVersionCard(
    item: WechatSyncHistoryItem,
    snapshot: WechatImportSnapshotLike,
  ) {
    setSelectedHistoryCharacterId(item.character.id);
    setFocusedHistorySnapshotKey(
      buildSnapshotMutationKey(item.character.id, snapshot),
    );
  }

  function linkAuditVersionForHistoryItem(
    item: WechatSyncHistoryItem,
    version: number | null,
  ) {
    setSelectedHistoryCharacterId(item.character.id);
    setLinkedAuditVersion(version);
    if (version === null) {
      setFocusedHistorySnapshotKey(null);
      return;
    }
    const snapshot = getImportSnapshotsFromHistoryItem(item).find(
      (entry) => entry.version === version,
    );
    if (snapshot) {
      focusSnapshotVersionCard(item, snapshot);
      return;
    }
    setFocusedHistorySnapshotKey(null);
  }

  function updateRecordAnnotation(recordId: string, value: string) {
    setAnnotations((current) => ({
      ...current,
      records: {
        ...current.records,
        [recordId]: value,
      },
    }));
  }

  function updateSnapshotAnnotation(
    snapshot: WechatImportSnapshotLike,
    characterId: string | null,
    value: string,
  ) {
    const key = buildWechatSyncSnapshotAnnotationKey(snapshot, characterId);
    setAnnotations((current) => ({
      ...current,
      snapshots: {
        ...current.snapshots,
        [key]: value,
      },
    }));
  }

  function addAnnotationTemplate(
    label: string,
    content: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) {
    const normalizedLabel = label.trim();
    const normalizedContent = content.trim();
    if (!normalizedLabel || !normalizedContent) {
      return false;
    }
    const exists = annotationTemplates.some(
      (template) =>
        template.label.trim().toLowerCase() === normalizedLabel.toLowerCase() &&
        template.content.trim().toLowerCase() ===
          normalizedContent.toLowerCase(),
    );
    if (exists) {
      return false;
    }
    setAnnotationTemplates((current) => [
      ...current,
      {
        id: createWechatSyncAnnotationTemplateId(),
        label: normalizedLabel,
        content: normalizedContent,
        source: "custom",
        isPinned: false,
        scope,
      },
    ]);
    return true;
  }

  function removeAnnotationTemplate(templateId: string) {
    setAnnotationTemplates((current) =>
      current.filter(
        (template) =>
          !(template.id === templateId && template.source === "custom"),
      ),
    );
  }

  function resetAnnotationTemplates() {
    setAnnotationTemplates(DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES);
  }

  function toggleAnnotationTemplatePin(templateId: string) {
    setAnnotationTemplates((current) =>
      current.map((template) =>
        template.id === templateId
          ? {
              ...template,
              isPinned: !template.isPinned,
            }
          : template,
      ),
    );
  }

  function importAnnotationTemplates(raw: string) {
    const result = mergeWechatSyncAnnotationTemplateImportPayload(
      annotationTemplates,
      raw,
    );
    setAnnotationTemplates(result.templates);
    return result;
  }

  function updateAnnotationTemplateScope(
    templateId: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) {
    setAnnotationTemplates((current) =>
      current.map((template) =>
        template.id === templateId
          ? {
              ...template,
              scope,
            }
          : template,
      ),
    );
  }

  function applyAnnotationTemplateToRecord(
    recordId: string,
    template: WechatSyncAnnotationTemplate,
  ) {
    updateRecordAnnotation(
      recordId,
      appendWechatSyncAnnotationTemplate(
        annotations.records[recordId] ?? "",
        template,
      ),
    );
  }

  function applyAnnotationTemplateToSnapshot(
    snapshot: WechatImportSnapshotLike,
    characterId: string | null,
    template: WechatSyncAnnotationTemplate,
  ) {
    updateSnapshotAnnotation(
      snapshot,
      characterId,
      appendWechatSyncAnnotationTemplate(
        resolveWechatSyncSnapshotAnnotation(
          annotations.snapshots,
          snapshot,
          characterId,
        ),
        template,
      ),
    );
  }

  function regeneratePreviewFromHistoryItem(item: WechatSyncHistoryItem) {
    const bundle = buildRollbackGuideContactBundle(item);
    reimportMutation.reset();
    restoreSnapshotMutation.reset();
    setPendingSnapshotRestore(null);
    setManualBundleError(null);
    setManualBundleFileName(null);
    setManualBundleJson(JSON.stringify([bundle], null, 2));
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames([bundle.username]);
    previewMutation.mutate([bundle]);
  }

  function loadSnapshotIntoManualInput(
    snapshot: WechatImportSnapshotLike | null,
    item: WechatSyncHistoryItem,
  ) {
    reimportMutation.reset();
    restoreSnapshotMutation.reset();
    setPendingSnapshotRestore(null);
    setManualBundleError(null);
    setManualBundleFileName(null);
    setManualBundleJson(
      JSON.stringify(
        [
          snapshot
            ? buildContactBundleFromImportSnapshot(snapshot)
            : buildRollbackGuideContactBundle(item),
        ],
        null,
        2,
      ),
    );
  }

  function restorePreviewFromSnapshot(
    snapshot: WechatImportSnapshotLike,
    item: WechatSyncHistoryItem,
  ) {
    const restoredItem = buildPreviewItemFromImportSnapshot(snapshot);
    reimportMutation.reset();
    restoreSnapshotMutation.reset();
    setPendingSnapshotRestore(null);
    setManualBundleError(null);
    setManualBundleFileName(null);
    setManualBundleJson(
      JSON.stringify([buildContactBundleFromImportSnapshot(snapshot)], null, 2),
    );
    focusSnapshotVersionCard(item, snapshot);
    setPreviewItems([restoredItem]);
    setSelectedUsernames([restoredItem.contact.username]);
    setSelectedPreviewUsernames([restoredItem.contact.username]);
  }

  function handleManualBundleTextChange(value: string) {
    setManualBundleJson(value);
    setManualBundleFileName(null);
  }

  function previewManualBundles(raw: string, sourceLabel?: string | null) {
    setManualBundleJson(raw);
    setManualBundleFileName(sourceLabel?.trim() || null);
    const bundles = parseWechatSyncContactBundles(raw);
    setManualBundleError(null);
    setPreviewItems([]);
    setSelectedPreviewUsernames([]);
    setSelectedUsernames(bundles.map((item) => item.username));
    previewMutation.mutate(bundles);
  }

  function handleManualBundleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    void (async () => {
      try {
        const raw = await file.text();
        previewManualBundles(raw, file.name);
      } catch (error) {
        setManualBundleError(
          error instanceof Error
            ? error.message
            : "读取联系人快照文件失败。",
        );
      }
    })();
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
              disabled={
                !connectorReady || !selectedCount || previewMutation.isPending
              }
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

      {preserveSharedViewState ? (
        <AdminCallout
          title="当前正在查看分享审计视图"
          tone="info"
          description={
            restorableLocalViewState
              ? "你可以一键还原到打开分享链接之前的本地筛选视图，或把当前分享视图设为新的本地默认视图。"
              : "当前 URL 带有审计视图参数。你可以直接继续操作，或把当前视图设为新的本地默认视图。"
          }
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={restoreLocalWechatSyncViewState}
                disabled={!restorableLocalViewState}
              >
                还原到分享前视图
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={adoptCurrentWechatSyncViewStateAsLocal}
              >
                将当前视图设为本地默认
              </Button>
            </>
          }
        />
      ) : null}

      <AdminCallout
        title="本地运行前提"
        tone="info"
        description={
          <div className="space-y-2">
            <p>
              后台只消费你本地已经授权整理好的联系人资料和聊天摘要，不提供密钥提取、聊天记录破解或进程内存读取能力。
            </p>
            <p>
              如果你已经有自己的本地数据连接器，可直接填入连接器地址；如果没有，也可以把联系人快照
              JSON 直接粘贴到下方手动导入区。
            </p>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="连接器设置"
            actions={
              <StatusPill
                tone={
                  connectorReady
                    ? "healthy"
                    : connectorProbeRequested
                      ? "warning"
                      : "muted"
                }
              >
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
                setConnectorSettings((current) => ({
                  ...current,
                  baseUrl: value,
                }))
              }
            />
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                数据源
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <AdminSelectableCard
                  active={connectorProviderKey === "manual-json"}
                  title="本地 JSON / 文件"
                  subtitle="从你授权导出的联系人快照读取"
                  activeLabel="当前数据源"
                  onClick={() => setConnectorProviderKey("manual-json")}
                />
                <AdminSelectableCard
                  active={connectorProviderKey === "wechat-decrypt-http"}
                  title="wechat-decrypt HTTP"
                  subtitle="读取本机 5678 服务的历史与标签"
                  activeLabel="当前数据源"
                  onClick={() => setConnectorProviderKey("wechat-decrypt-http")}
                />
              </div>
            </div>
            {connectorProviderKey === "manual-json" ? (
              <AdminTextField
                label="连接器侧 JSON 路径（可选）"
                value={connectorManualJsonPath}
                placeholder="D:\\exports\\wechat-contacts.json"
                onChange={setConnectorManualJsonPath}
              />
            ) : (
              <AdminTextField
                label="wechat-decrypt 地址"
                value={connectorWechatDecryptBaseUrl}
                placeholder="http://127.0.0.1:5678"
                onChange={setConnectorWechatDecryptBaseUrl}
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => connectorConfigMutation.mutate()}
              disabled={
                connectorConfigMutation.isPending || !connectorSourceConfigReady
              }
            >
              {connectorConfigMutation.isPending ? "保存中..." : "保存数据源配置"}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConnectorProbeRequested(true);
                scanMutation.mutate();
              }}
              disabled={scanMutation.isPending || !connectorSourceConfigReady}
            >
              {scanMutation.isPending ? "刷新中..." : "刷新本地索引"}
            </Button>
            <Button
              variant="secondary"
              onClick={requestConnectorProbe}
            >
              刷新连接状态
            </Button>
          </div>

          {!connectorProbeRequested ? (
            <InlineNotice className="mt-4" tone="muted">
              当前未探测本地微信连接器。下方手动 JSON / 本地文件导入仍可直接使用；只有在你要读取本地联系人列表时，才需要启动连接器探测。
            </InlineNotice>
          ) : null}
          {connectorProbeRequested && connectorHealthQuery.isLoading ? (
            <LoadingBlock className="mt-4" label="正在探测本地微信连接器..." />
          ) : null}
          {connectorProbeRequested &&
          connectorHealthQuery.isError &&
          connectorHealthQuery.error instanceof Error ? (
            <InlineNotice className="mt-4" tone="warning">
              {connectorHealthQuery.error.message}
            </InlineNotice>
          ) : null}
          {scanMutation.isError && scanMutation.error instanceof Error ? (
            <ErrorBlock className="mt-4" message={scanMutation.error.message} />
          ) : null}
          {connectorConfigMutation.isError &&
          connectorConfigMutation.error instanceof Error ? (
            <ErrorBlock
              className="mt-4"
              message={connectorConfigMutation.error.message}
            />
          ) : null}
          {connectorConfigMutation.isSuccess ? (
            <AdminActionFeedback
              className="mt-4"
              tone="success"
              title="数据源配置已保存"
              description="连接器会在下一次刷新索引时使用这个数据源。"
            />
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
                  <div>
                    连接器标识：
                    {connectorHealthQuery.data.activeConfig.connectorLabel ||
                      "未回报"}
                  </div>
                  <div>
                    数据摘要：
                    {connectorHealthQuery.data.activeConfig.sourceSummary ||
                      "未回报"}
                  </div>
                  <div>
                    数据源：
                    {formatConnectorProviderLabel(
                      connectorHealthQuery.data.activeConfig.providerKey,
                    )}
                  </div>
                  {connectorHealthQuery.data.activeConfig.wechatDecryptBaseUrl ? (
                    <div>
                      wechat-decrypt：
                      {
                        connectorHealthQuery.data.activeConfig
                          .wechatDecryptBaseUrl
                      }
                    </div>
                  ) : null}
                  <div>
                    上次扫描：
                    {formatDateTime(connectorHealthQuery.data.lastScanAt)}
                  </div>
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
                  onClick={() => manualBundleFileInputRef.current?.click()}
                  disabled={previewMutation.isPending}
                >
                  选择本地 JSON
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setManualBundleFileName(null);
                    setManualBundleJson(SAMPLE_WECHAT_SYNC_JSON);
                  }}
                >
                  填入示例
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    try {
                      previewManualBundles(manualBundleJson);
                    } catch (error) {
                      setManualBundleError(
                        error instanceof Error
                          ? error.message
                          : "联系人快照解析失败。",
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
          <input
            ref={manualBundleFileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleManualBundleFileChange}
          />
          <div className="mt-4">
            <AdminTextArea
              label="联系人快照 JSON"
              value={manualBundleJson}
              onChange={handleManualBundleTextChange}
              textareaClassName="min-h-52 font-mono text-xs"
              description="粘贴 `WechatSyncContactBundle[]` 数组即可直接生成预览。只适用于你本人合法导出的联系人资料和聊天摘要。"
              placeholder='[{"username":"wxid_alice","displayName":"Alice","tags":["同事"],"isGroup":false,"messageCount":128,"ownerMessageCount":62,"contactMessageCount":66,"latestMessageAt":"2026-04-16T11:20:00.000Z","chatSummary":"经常聊产品迭代、周末约饭和出差安排。","topicKeywords":["产品","出差","周末"],"sampleMessages":[{"timestamp":"2026-04-16 19:20","text":"周五一起吃饭？","sender":"Alice","direction":"contact"}],"momentHighlights":[]}]'
            />
          </div>
          {manualBundleFileName ? (
            <InlineNotice className="mt-4" tone="muted">
              已载入本地文件：{manualBundleFileName}
            </InlineNotice>
          ) : null}

          {rollbackGuideItem ? (
            <div className="mt-4 space-y-4">
              <AdminCallout
                title="已保留最近一次回滚的重新导入模板"
                tone="warning"
                description={
                  <div className="space-y-2">
                    <p>
                      已回滚角色：{rollbackGuideItem.character.name}。
                      {rollbackGuideItem.character.sourceKey
                        ? ` 你也可以用 ${
                            extractWechatUsername(
                              rollbackGuideItem.character.sourceKey,
                            ) || rollbackGuideItem.character.sourceKey
                          } 在上方连接器联系人里重新搜索。`
                        : " 当前没有可用的 sourceKey，只能通过手动 JSON 重新导入。"}
                    </p>
                    <p>
                      现在除了最小联系人模板，还可以直接从这条记录保留下来的导入快照恢复某个历史版本。
                    </p>
                  </div>
                }
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={loadRollbackGuideIntoManualInput}
                    >
                      填回最新手动导入区
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

              {getImportSnapshotsFromHistoryItem(rollbackGuideItem).length ? (
                <ImportSnapshotVersionList
                  title="回滚后快照恢复入口"
                  characterName={rollbackGuideItem.character.name}
                  liveItem={null}
                  snapshots={getImportSnapshotsFromHistoryItem(
                    rollbackGuideItem,
                  )}
                  annotationCharacterId={rollbackGuideItem.character.id}
                  annotations={annotations.snapshots}
                  annotationTemplates={annotationTemplates}
                  onRestorePreview={(snapshot) =>
                    restorePreviewFromSnapshot(snapshot, rollbackGuideItem)
                  }
                  onRestoreLive={(snapshot) =>
                    requestRestoreSnapshotToLive(rollbackGuideItem, snapshot)
                  }
                  onConfirmRestoreLive={confirmRestoreSnapshotToLive}
                  onCancelRestoreLive={cancelRestoreSnapshotToLive}
                  onLoadToManualInput={(snapshot) =>
                    loadSnapshotIntoManualInput(snapshot, rollbackGuideItem)
                  }
                  onAnnotationChange={(snapshot, value) =>
                    updateSnapshotAnnotation(
                      snapshot,
                      rollbackGuideItem.character.id,
                      value,
                    )
                  }
                  onApplyAnnotationTemplate={(snapshot, template) =>
                    applyAnnotationTemplateToSnapshot(
                      snapshot,
                      rollbackGuideItem.character.id,
                      template,
                    )
                  }
                  confirmingSnapshotKey={
                    pendingSnapshotRestore
                      ? buildSnapshotMutationKey(
                          pendingSnapshotRestore.historyItem.character.id,
                          pendingSnapshotRestore.snapshot,
                        )
                      : null
                  }
                  restoringSnapshotKey={
                    restoreSnapshotMutation.isPending
                      ? buildSnapshotMutationKey(
                          rollbackGuideItem.character.id,
                          restoreSnapshotMutation.variables?.snapshot,
                        )
                      : null
                  }
                />
              ) : null}
            </div>
          ) : null}

          {manualBundleError ? (
            <ErrorBlock className="mt-4" message={manualBundleError} />
          ) : null}
          {previewMutation.isError && previewMutation.error instanceof Error ? (
            <ErrorBlock
              className="mt-4"
              message={previewMutation.error.message}
            />
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
            <ErrorBlock
              className="mt-4"
              message={contactsQuery.error.message}
            />
          ) : null}

          {!contactsQuery.isLoading &&
          connectorReady &&
          !(contactsQuery.data?.length ?? 0) ? (
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
                subtitle={
                  contact.remarkName || contact.nickname || contact.username
                }
                badge={
                  <StatusPill tone={contact.isGroup ? "warning" : "healthy"}>
                    {contact.isGroup ? "群聊" : "联系人"}
                  </StatusPill>
                }
                meta={
                  <div className="space-y-1">
                    <div>
                      消息 {contact.messageCount} 条
                      {contact.latestMessageAt
                        ? ` · 最近 ${formatDateTime(contact.latestMessageAt)}`
                        : ""}
                    </div>
                    <div>
                      {contact.tags.length
                        ? `标签：${contact.tags.join("、")}`
                        : "暂无标签"}
                    </div>
                    {contact.sampleSnippet ? (
                      <div>样本：{contact.sampleSnippet}</div>
                    ) : null}
                  </div>
                }
                activeLabel="已选中，待生成预览"
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
          <ErrorBlock
            className="mt-4"
            message={previewMutation.error.message}
          />
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
                    disabled={
                      !batchTargetUsernames.length ||
                      !batchRelationshipInput.trim()
                    }
                  >
                    应用关系定位
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={applyBatchDomains}
                    disabled={
                      !batchTargetUsernames.length ||
                      !splitCsv(batchDomainInput).length
                    }
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
          <LoadingBlock
            className="mt-4"
            label="正在根据微信聊天资料生成角色预览..."
          />
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
                onToggleSelect={() =>
                  togglePreviewSelection(item.contact.username)
                }
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
        {retryFriendshipMutation.isError &&
        retryFriendshipMutation.error instanceof Error ? (
          <ErrorBlock
            className="mt-4"
            message={retryFriendshipMutation.error.message}
          />
        ) : null}
        {rollbackMutation.isError && rollbackMutation.error instanceof Error ? (
          <ErrorBlock
            className="mt-4"
            message={rollbackMutation.error.message}
          />
        ) : null}
        {reimportMutation.isError && reimportMutation.error instanceof Error ? (
          <ErrorBlock
            className="mt-4"
            message={reimportMutation.error.message}
          />
        ) : null}
        {restoreSnapshotMutation.isError &&
        restoreSnapshotMutation.error instanceof Error ? (
          <ErrorBlock
            className="mt-4"
            message={restoreSnapshotMutation.error.message}
          />
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
        {restoreSnapshotMutation.isSuccess ? (
          <ImportResultPanel
            result={restoreSnapshotMutation.data}
            title="历史版本已恢复为线上角色"
            description={`已按所选导入版本恢复 ${restoreSnapshotMutation.data.importedCount} 个角色，并自动写入一条变更记录。`}
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
                variant={
                  historyStatusFilter === "all" ? "primary" : "secondary"
                }
                size="sm"
                onClick={() => setHistoryStatusFilter("all")}
              >
                全部 {historyCounts.total}
              </Button>
              <Button
                variant={
                  historyStatusFilter === "active" ? "primary" : "secondary"
                }
                size="sm"
                onClick={() => setHistoryStatusFilter("active")}
              >
                好友正常 {historyCounts.active}
              </Button>
              <Button
                variant={
                  historyStatusFilter === "attention" ? "primary" : "secondary"
                }
                size="sm"
                onClick={() => setHistoryStatusFilter("attention")}
              >
                待处理 {historyCounts.attention}
              </Button>
              <Button
                variant={
                  historyStatusFilter === "removed" ? "primary" : "secondary"
                }
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
                  selected={
                    selectedHistoryItem?.character.id === item.character.id
                  }
                  retryPending={
                    retryFriendshipMutation.isPending &&
                    retryFriendshipMutation.variables === item.character.id
                  }
                  rollbackPending={
                    rollbackMutation.isPending &&
                    rollbackMutation.variables?.character.id ===
                      item.character.id
                  }
                  onSelect={() => selectHistoryItem(item.character.id)}
                  onRegeneratePreview={() =>
                    regeneratePreviewFromHistoryItem(item)
                  }
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
              restoreSnapshotPending={restoreSnapshotMutation.isPending}
              retryPending={
                retryFriendshipMutation.isPending &&
                retryFriendshipMutation.variables ===
                  selectedHistoryItem?.character.id
              }
              rollbackPending={
                rollbackMutation.isPending &&
                rollbackMutation.variables?.character.id ===
                  selectedHistoryItem?.character.id
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
              onRestoreSnapshotPreview={
                selectedHistoryItem
                  ? (snapshot) =>
                      restorePreviewFromSnapshot(snapshot, selectedHistoryItem)
                  : undefined
              }
              onRestoreSnapshotToLive={
                selectedHistoryItem
                  ? (snapshot) =>
                      requestRestoreSnapshotToLive(
                        selectedHistoryItem,
                        snapshot,
                      )
                  : undefined
              }
              onConfirmSnapshotRestore={confirmRestoreSnapshotToLive}
              onCancelSnapshotRestore={cancelRestoreSnapshotToLive}
              onLoadSnapshotToManualInput={
                selectedHistoryItem
                  ? (snapshot) =>
                      loadSnapshotIntoManualInput(snapshot, selectedHistoryItem)
                  : undefined
              }
              onReplayChangeRecordPreview={
                selectedHistoryItem
                  ? (snapshot) =>
                      restorePreviewFromSnapshot(snapshot, selectedHistoryItem)
                  : undefined
              }
              onLoadChangeRecordToManualInput={
                selectedHistoryItem
                  ? (snapshot) =>
                      loadSnapshotIntoManualInput(snapshot, selectedHistoryItem)
                  : undefined
              }
              auditSearch={auditSearch}
              auditModeFilter={auditModeFilter}
              auditExpandedRecordId={auditExpandedRecordId}
              linkedAuditVersion={linkedAuditVersion}
              auditShareUrl={auditShareUrl}
              onAuditSearchChange={setAuditSearch}
              onAuditModeFilterChange={setAuditModeFilter}
              onAuditExpandedRecordIdChange={setAuditExpandedRecordId}
              onLinkedAuditVersionChange={
                selectedHistoryItem
                  ? (version) =>
                      linkAuditVersionForHistoryItem(
                        selectedHistoryItem,
                        version,
                      )
                  : undefined
              }
              recordAnnotations={annotations.records}
              snapshotAnnotations={annotations.snapshots}
              onRecordAnnotationChange={updateRecordAnnotation}
              onSnapshotAnnotationChange={
                selectedHistoryItem
                  ? (snapshot, value) =>
                      updateSnapshotAnnotation(
                        snapshot,
                        selectedHistoryItem.character.id,
                        value,
                      )
                  : undefined
              }
              annotationTemplates={annotationTemplates}
              onAddAnnotationTemplate={addAnnotationTemplate}
              onRemoveAnnotationTemplate={removeAnnotationTemplate}
              onResetAnnotationTemplates={resetAnnotationTemplates}
              onToggleAnnotationTemplatePin={toggleAnnotationTemplatePin}
              onImportAnnotationTemplates={importAnnotationTemplates}
              onUpdateAnnotationTemplateScope={updateAnnotationTemplateScope}
              onApplyRecordAnnotationTemplate={applyAnnotationTemplateToRecord}
              onApplySnapshotAnnotationTemplate={
                selectedHistoryItem
                  ? (snapshot, template) =>
                      applyAnnotationTemplateToSnapshot(
                        snapshot,
                        selectedHistoryItem.character.id,
                        template,
                      )
                  : undefined
              }
              onFocusSnapshotVersion={
                selectedHistoryItem
                  ? (snapshot) =>
                      focusSnapshotVersionCard(selectedHistoryItem, snapshot)
                  : undefined
              }
              focusedSnapshotKey={
                selectedHistoryItem?.character.id === selectedHistoryCharacterId
                  ? focusedHistorySnapshotKey
                  : null
              }
              confirmingSnapshotKey={
                pendingSnapshotRestore
                  ? buildSnapshotMutationKey(
                      pendingSnapshotRestore.historyItem.character.id,
                      pendingSnapshotRestore.snapshot,
                    )
                  : null
              }
              restoringSnapshotKey={
                restoreSnapshotMutation.isPending
                  ? buildSnapshotMutationKey(
                      selectedHistoryItem?.character.id ?? "",
                      restoreSnapshotMutation.variables?.snapshot,
                    )
                  : null
              }
              onRetryFriendship={
                selectedHistoryItem
                  ? () =>
                      retryFriendshipMutation.mutate(
                        selectedHistoryItem.character.id,
                      )
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
                      setManualBundleFileName(null);
                      setManualBundleJson(
                        JSON.stringify(
                          [
                            buildRollbackGuideContactBundle(
                              selectedHistoryItem,
                            ),
                          ],
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
            <Card
              key={item.contactUsername}
              className="bg-[color:var(--surface-card)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-[color:var(--text-primary)]">
                    {item.character.name}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                    {item.displayName} ·{" "}
                    {item.status === "created" ? "新建角色" : "更新现有角色"}
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
  const currentSnapshot =
    item.character.profile?.wechatSyncImport?.currentSnapshot;
  const friendshipTone =
    item.friendshipStatus === "friend" ||
    item.friendshipStatus === "close" ||
    item.friendshipStatus === "best"
      ? "healthy"
      : item.friendshipStatus === "removed" ||
          item.friendshipStatus === "blocked"
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
        <Button
          variant={selected ? "primary" : "secondary"}
          size="sm"
          onClick={onSelect}
        >
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
  restoreSnapshotPending,
  confirmingSnapshotKey,
  retryPending,
  rollbackPending,
  onRegeneratePreview,
  onReimportPreview,
  onRestoreSnapshotPreview,
  onRestoreSnapshotToLive,
  onConfirmSnapshotRestore,
  onCancelSnapshotRestore,
  onLoadSnapshotToManualInput,
  onReplayChangeRecordPreview,
  onLoadChangeRecordToManualInput,
  auditSearch,
  auditModeFilter,
  auditExpandedRecordId,
  linkedAuditVersion,
  auditShareUrl,
  onAuditSearchChange,
  onAuditModeFilterChange,
  onAuditExpandedRecordIdChange,
  onLinkedAuditVersionChange,
  recordAnnotations,
  snapshotAnnotations,
  onRecordAnnotationChange,
  onSnapshotAnnotationChange,
  annotationTemplates,
  onAddAnnotationTemplate,
  onRemoveAnnotationTemplate,
  onResetAnnotationTemplates,
  onToggleAnnotationTemplatePin,
  onImportAnnotationTemplates,
  onUpdateAnnotationTemplateScope,
  onApplyRecordAnnotationTemplate,
  onApplySnapshotAnnotationTemplate,
  onFocusSnapshotVersion,
  focusedSnapshotKey,
  onRetryFriendship,
  onRollback,
  onLoadTemplateToManualInput,
  restoringSnapshotKey,
}: {
  item: WechatSyncHistoryItem | null;
  matchedPreviewItem: WechatSyncPreviewItem | null;
  matchedPreviewValidationIssues: string[];
  previewPending: boolean;
  reimportPending: boolean;
  restoreSnapshotPending: boolean;
  confirmingSnapshotKey: string | null;
  retryPending: boolean;
  rollbackPending: boolean;
  onRegeneratePreview?: () => void;
  onReimportPreview?: () => void;
  onRestoreSnapshotPreview?: (snapshot: WechatImportSnapshotLike) => void;
  onRestoreSnapshotToLive?: (snapshot: WechatImportSnapshotLike) => void;
  onConfirmSnapshotRestore?: () => void;
  onCancelSnapshotRestore?: () => void;
  onLoadSnapshotToManualInput?: (snapshot: WechatImportSnapshotLike) => void;
  onReplayChangeRecordPreview?: (snapshot: WechatImportSnapshotLike) => void;
  onLoadChangeRecordToManualInput?: (
    snapshot: WechatImportSnapshotLike,
  ) => void;
  auditSearch: string;
  auditModeFilter: "all" | "preview_import" | "snapshot_restore";
  auditExpandedRecordId: string | null;
  linkedAuditVersion: number | null;
  auditShareUrl: string;
  onAuditSearchChange: (value: string) => void;
  onAuditModeFilterChange: (
    value: "all" | "preview_import" | "snapshot_restore",
  ) => void;
  onAuditExpandedRecordIdChange: (value: string | null) => void;
  onLinkedAuditVersionChange?: (value: number | null) => void;
  recordAnnotations: Record<string, string>;
  snapshotAnnotations: Record<string, string>;
  onRecordAnnotationChange: (recordId: string, value: string) => void;
  onSnapshotAnnotationChange?: (
    snapshot: WechatImportSnapshotLike,
    value: string,
  ) => void;
  annotationTemplates: WechatSyncAnnotationTemplate[];
  onAddAnnotationTemplate: (
    label: string,
    content: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => boolean;
  onRemoveAnnotationTemplate: (templateId: string) => void;
  onResetAnnotationTemplates: () => void;
  onToggleAnnotationTemplatePin: (templateId: string) => void;
  onImportAnnotationTemplates: (
    raw: string,
  ) => WechatSyncAnnotationTemplateImportResult;
  onUpdateAnnotationTemplateScope: (
    templateId: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => void;
  onApplyRecordAnnotationTemplate: (
    recordId: string,
    template: WechatSyncAnnotationTemplate,
  ) => void;
  onApplySnapshotAnnotationTemplate?: (
    snapshot: WechatImportSnapshotLike,
    template: WechatSyncAnnotationTemplate,
  ) => void;
  onFocusSnapshotVersion?: (snapshot: WechatImportSnapshotLike) => void;
  focusedSnapshotKey?: string | null;
  onRetryFriendship?: () => void;
  onRollback?: () => void;
  onLoadTemplateToManualInput?: () => void;
  restoringSnapshotKey: string | null;
}) {
  const snapshotSectionRef = useRef<HTMLDivElement | null>(null);
  const changeHistorySectionRef = useRef<HTMLDivElement | null>(null);

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
  const importSnapshots = getImportSnapshotsFromHistoryItem(item);
  const importChangeHistory = getImportChangeHistoryFromHistoryItem(item);
  const annotationEntries = buildWechatSyncAnnotationSummaryEntries(
    item.character.id,
    importChangeHistory,
    importSnapshots,
    recordAnnotations,
    snapshotAnnotations,
  );

  function scrollHistoryDetailSection(target: HTMLDivElement | null) {
    target?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openAnnotatedRecord(record: WechatImportChangeRecordLike) {
    onAuditExpandedRecordIdChange(record.id);
    onLinkedAuditVersionChange?.(record.toVersion);
    window.setTimeout(() => {
      scrollHistoryDetailSection(changeHistorySectionRef.current);
    }, 80);
  }

  function openAnnotatedSnapshot(snapshot: WechatImportSnapshotLike) {
    onLinkedAuditVersionChange?.(snapshot.version);
    onFocusSnapshotVersion?.(snapshot);
    window.setTimeout(() => {
      scrollHistoryDetailSection(snapshotSectionRef.current);
    }, 80);
  }

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
              : item.friendshipStatus === "removed" ||
                  item.friendshipStatus === "blocked"
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
        <div ref={snapshotSectionRef} className="mt-4 space-y-4">
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
                    当前线上角色保存了 v{previousImportSnapshot.version} 到 v
                    {currentImportSnapshot.version} 的导入快照。
                  </p>
                  <p>
                    下面展示的是“上一版导入草稿 /
                    当前导入草稿”的字段差异，可直接用于回看这次同步改了什么。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>这条记录已经持久化了最近一次导入快照。</p>
                  <p>
                    后续再次导入时，会把当前快照滚到上一版，形成可对照的版本链。
                  </p>
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
                <div>
                  导入时间：{formatDateTime(currentImportSnapshot.importedAt)}
                </div>
                <div>
                  导入状态：
                  {currentImportSnapshot.status === "created"
                    ? "首次创建"
                    : "覆盖更新"}
                </div>
                <div>
                  自动加好友：
                  {currentImportSnapshot.autoAddFriend ? "是" : "否"}
                </div>
                <div>
                  朋友圈种子：{currentImportSnapshot.seededMomentCount} 条
                </div>
              </div>
            </AdminMiniPanel>
          )}

          <ImportSnapshotVersionList
            title="导入版本列表"
            characterName={item.character.name}
            liveItem={item}
            snapshots={importSnapshots}
            linkedVersionFilter={linkedAuditVersion}
            annotationCharacterId={item.character.id}
            annotations={snapshotAnnotations}
            annotationTemplates={annotationTemplates}
            onRestorePreview={onRestoreSnapshotPreview}
            onRestoreLive={onRestoreSnapshotToLive}
            onConfirmRestoreLive={onConfirmSnapshotRestore}
            onCancelRestoreLive={onCancelSnapshotRestore}
            onLoadToManualInput={onLoadSnapshotToManualInput}
            onLinkRelatedRecords={onLinkedAuditVersionChange}
            onAnnotationChange={onSnapshotAnnotationChange}
            onApplyAnnotationTemplate={onApplySnapshotAnnotationTemplate}
            confirmingSnapshotKey={confirmingSnapshotKey}
            focusedSnapshotKey={focusedSnapshotKey}
            restoringSnapshotKey={
              restoreSnapshotPending ? restoringSnapshotKey : null
            }
          />
        </div>
      ) : null}

      <div className="mt-4">
        <ImportAnnotationSummaryPanel
          characterName={item.character.name}
          entries={annotationEntries}
          templates={annotationTemplates}
          onAddTemplate={onAddAnnotationTemplate}
          onRemoveTemplate={onRemoveAnnotationTemplate}
          onResetTemplates={onResetAnnotationTemplates}
          onToggleTemplatePin={onToggleAnnotationTemplatePin}
          onImportTemplates={onImportAnnotationTemplates}
          onUpdateTemplateScope={onUpdateAnnotationTemplateScope}
          onOpenRecord={openAnnotatedRecord}
          onOpenSnapshot={openAnnotatedSnapshot}
        />
      </div>

      {importChangeHistory.length ? (
        <div ref={changeHistorySectionRef} className="mt-4">
          <ImportChangeHistoryList
            characterId={item.character.id}
            key={item.character.id}
            characterName={item.character.name}
            records={importChangeHistory}
            availableSnapshots={importSnapshots}
            search={auditSearch}
            modeFilter={auditModeFilter}
            expandedRecordId={auditExpandedRecordId}
            linkedVersionFilter={linkedAuditVersion}
            shareUrl={auditShareUrl}
            onSearchChange={onAuditSearchChange}
            onModeFilterChange={onAuditModeFilterChange}
            onExpandedRecordIdChange={onAuditExpandedRecordIdChange}
            onLinkedVersionFilterChange={onLinkedAuditVersionChange}
            annotations={recordAnnotations}
            snapshotAnnotations={snapshotAnnotations}
            onAnnotationChange={onRecordAnnotationChange}
            annotationTemplates={annotationTemplates}
            onApplyAnnotationTemplate={onApplyRecordAnnotationTemplate}
            onReplaySnapshotPreview={onReplayChangeRecordPreview}
            onLoadSnapshotToManualInput={onLoadChangeRecordToManualInput}
          />
        </div>
      ) : currentImportSnapshot ? (
        <div className="mt-4">
          <AdminCallout
            title="变更记录将在下一次导入或版本恢复后自动生成"
            tone="muted"
            description="旧数据已经补齐了快照链；从现在开始，每次重新导入或恢复历史版本都会自动记录一条变更摘要，方便回溯。"
          />
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
                    <p>
                      当前已经命中了这条历史项对应的预览草稿，但还有未通过校验的字段，暂时不能直接再导入。
                    </p>
                    <p>
                      请先在上方“角色预览”卡片里补齐缺失字段，再回来执行一键再导入。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p>
                      这条历史项已经和当前预览草稿关联上了。下面会按“当前线上角色
                      / 当前预览草稿”展示字段差异。
                    </p>
                    <p>
                      确认无误后，可以直接按当前预览重新导入，后台会按同一个
                      `sourceKey` 更新角色与好友资料。
                    </p>
                  </div>
                )
              }
            />

            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                当前线上角色 / 当前预览草稿
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {buildHistoryPreviewDiffs(item, matchedPreviewItem).map(
                  (diff) => (
                    <HistoryDiffCard key={diff.label} diff={diff} />
                  ),
                )}
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
  currentHeading = "当前线上角色",
  nextHeading = "当前预览草稿",
}: {
  diff: HistoryDiffCardValue;
  currentHeading?: string;
  nextHeading?: string;
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
            {currentHeading}
          </div>
          <div className="mt-1 rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {diff.currentValue}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            {nextHeading}
          </div>
          <div className="mt-1 rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {diff.nextValue}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportAnnotationSummaryPanel({
  characterName,
  entries,
  templates,
  onAddTemplate,
  onRemoveTemplate,
  onResetTemplates,
  onToggleTemplatePin,
  onImportTemplates,
  onUpdateTemplateScope,
  onOpenRecord,
  onOpenSnapshot,
}: {
  characterName: string;
  entries: WechatSyncAnnotationSummaryEntry[];
  templates: WechatSyncAnnotationTemplate[];
  onAddTemplate: (
    label: string,
    content: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => boolean;
  onRemoveTemplate: (templateId: string) => void;
  onResetTemplates: () => void;
  onToggleTemplatePin: (templateId: string) => void;
  onImportTemplates: (raw: string) => WechatSyncAnnotationTemplateImportResult;
  onUpdateTemplateScope: (
    templateId: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => void;
  onOpenRecord?: (record: WechatImportChangeRecordLike) => void;
  onOpenSnapshot?: (snapshot: WechatImportSnapshotLike) => void;
}) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "record" | "snapshot">(
    "all",
  );
  const [copyNotice, setCopyNotice] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (kindFilter !== "all" && entry.kind !== kindFilter) {
          return false;
        }
        if (!deferredSearch) {
          return true;
        }
        return buildWechatSyncAnnotationSummaryKeyword(entry).includes(
          deferredSearch,
        );
      }),
    [deferredSearch, entries, kindFilter],
  );
  const recordCount = useMemo(
    () => entries.filter((entry) => entry.kind === "record").length,
    [entries],
  );
  const snapshotCount = useMemo(
    () => entries.filter((entry) => entry.kind === "snapshot").length,
    [entries],
  );

  useEffect(() => {
    if (!copyNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopyNotice((current) => (current === copyNotice ? "" : current));
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  return (
    <div>
      {copyNotice ? (
        <AdminActionFeedback
          className="mb-4"
          tone="success"
          title="批注汇总已复制"
          description={copyNotice}
        />
      ) : null}

      <div className="rounded-3xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              批注汇总
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
              共 {entries.length} 条，本地记录批注 {recordCount} 条，版本批注{" "}
              {snapshotCount} 条。
            </div>
          </div>
          <div className="grid gap-3 xl:min-w-[30rem] xl:grid-cols-[1fr_auto]">
            <AdminTextField
              label="搜索批注汇总"
              value={search}
              onChange={setSearch}
              placeholder="搜索批注、摘要、版本号或关系"
            />
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                variant={kindFilter === "all" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setKindFilter("all")}
              >
                全部
              </Button>
              <Button
                variant={kindFilter === "record" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setKindFilter("record")}
              >
                记录批注
              </Button>
              <Button
                variant={kindFilter === "snapshot" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setKindFilter("snapshot")}
              >
                版本批注
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadWechatSyncAnnotationSummaryMarkdownExport(
                    characterName,
                    filteredEntries,
                  )
                }
                disabled={!filteredEntries.length}
              >
                导出当前汇总 Markdown
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const copied = await copyWechatSyncAuditText(
                    buildWechatSyncAnnotationSummaryMarkdownReport(
                      characterName,
                      filteredEntries,
                    ),
                    "复制批注汇总 Markdown",
                  );
                  if (copied) {
                    setCopyNotice("已复制当前筛选下的批注汇总 Markdown。");
                  }
                }}
                disabled={!filteredEntries.length}
              >
                复制当前汇总 Markdown
              </Button>
            </div>
          </div>
        </div>

        {!filteredEntries.length ? (
          <AdminEmptyState
            className="mt-4"
            title="当前筛选没有批注"
            description="调整搜索词或切换记录/版本批注筛选后，再查看当前角色的本地批注汇总。"
          />
        ) : null}

        <div className="mt-4 space-y-3">
          <AnnotationTemplateManager
            templates={templates}
            onAddTemplate={onAddTemplate}
            onRemoveTemplate={onRemoveTemplate}
            onResetTemplates={onResetTemplates}
            onToggleTemplatePin={onToggleTemplatePin}
            onImportTemplates={onImportTemplates}
            onUpdateTemplateScope={onUpdateTemplateScope}
          />
          {filteredEntries.map((entry) => (
            <Card key={entry.key} className="bg-[color:var(--surface-card)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[color:var(--text-primary)]">
                      {entry.title}
                    </span>
                    <StatusPill
                      tone={entry.kind === "record" ? "warning" : "healthy"}
                    >
                      {entry.kind === "record" ? "记录批注" : "版本批注"}
                    </StatusPill>
                  </div>
                  <div>{entry.subtitle}</div>
                  <div>{entry.meta}</div>
                  <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 leading-6">
                    {entry.note}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.kind === "record" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenRecord?.(entry.record)}
                      disabled={!onOpenRecord}
                    >
                      展开对应记录
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenSnapshot?.(entry.snapshot)}
                      disabled={!onOpenSnapshot}
                    >
                      定位到版本卡
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnnotationTemplateManager({
  templates,
  onAddTemplate,
  onRemoveTemplate,
  onResetTemplates,
  onToggleTemplatePin,
  onImportTemplates,
  onUpdateTemplateScope,
}: {
  templates: WechatSyncAnnotationTemplate[];
  onAddTemplate: (
    label: string,
    content: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => boolean;
  onRemoveTemplate: (templateId: string) => void;
  onResetTemplates: () => void;
  onToggleTemplatePin: (templateId: string) => void;
  onImportTemplates: (raw: string) => WechatSyncAnnotationTemplateImportResult;
  onUpdateTemplateScope: (
    templateId: string,
    scope: WechatSyncAnnotationTemplateScope,
  ) => void;
}) {
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<WechatSyncAnnotationTemplateScope>("all");
  const [importJson, setImportJson] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "info";
    title: string;
    description: string;
  } | null>(null);
  const [previewFilter, setPreviewFilter] = useState<
    "all" | WechatSyncAnnotationTemplateImportPreviewStatus
  >("all");
  const pinnedCount = useMemo(
    () => templates.filter((template) => template.isPinned).length,
    [templates],
  );
  const customCount = useMemo(
    () => templates.filter((template) => template.source === "custom").length,
    [templates],
  );
  const orderedTemplates = useMemo(
    () => sortWechatSyncAnnotationTemplates(templates),
    [templates],
  );
  const exportPayload = useMemo(
    () => buildWechatSyncAnnotationTemplateExportPayload(templates),
    [templates],
  );
  const exportJson = useMemo(
    () => JSON.stringify(exportPayload, null, 2),
    [exportPayload],
  );
  const importPreviewState = useMemo(() => {
    if (!importJson.trim()) {
      return {
        preview: null as WechatSyncAnnotationTemplateImportPreview | null,
        error: null as string | null,
      };
    }
    try {
      return {
        preview: buildWechatSyncAnnotationTemplateImportPreview(
          templates,
          importJson,
        ),
        error: null as string | null,
      };
    } catch (error) {
      return {
        preview: null as WechatSyncAnnotationTemplateImportPreview | null,
        error:
          error instanceof Error
            ? error.message
            : "模板导入预览失败，请检查 JSON。",
      };
    }
  }, [importJson, templates]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setFeedback((current) => (current === feedback ? null : current));
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  function submitTemplate() {
    const created = onAddTemplate(label, content, scope);
    if (!created) {
      setFeedback({
        tone: "warning",
        title: "模板未新增",
        description: "模板标签或内容为空，或与现有模板重复。",
      });
      return;
    }
    setLabel("");
    setContent("");
    setScope("all");
    setFeedback({
      tone: "success",
      title: "模板已新增",
      description: "已新增自定义批注模板。",
    });
  }

  function importTemplates() {
    if (!importJson.trim()) {
      setFeedback({
        tone: "warning",
        title: "导入内容为空",
        description: "导入 JSON 为空，先粘贴模板配置。",
      });
      return;
    }
    try {
      const result = onImportTemplates(importJson);
      setFeedback({
        tone: result.changed ? "success" : "info",
        title: result.changed ? "模板已导入" : "导入未产生变更",
        description: result.message,
      });
      if (result.changed) {
        setImportJson("");
      }
    } catch (error) {
      setFeedback({
        tone: "warning",
        title: "模板导入失败",
        description:
          error instanceof Error
            ? error.message
            : "模板导入失败，请检查 JSON。",
      });
    }
  }

  return (
    <Card className="bg-[color:var(--surface-card)]">
      {feedback ? (
        <AdminActionFeedback
          className="mb-4"
          tone={feedback.tone}
          title={feedback.title}
          description={feedback.description}
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            批注模板 / 常用标签
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            默认模板 {templates.length - customCount} 条，自定义模板{" "}
            {customCount} 条，已置顶 {pinnedCount}{" "}
            条。点击下方模板后，可以在记录批注和版本批注里一键追加。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadWechatSyncAnnotationTemplateExport(templates)
            }
          >
            导出当前模板 JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const copied = await copyWechatSyncAuditText(
                exportJson,
                "复制模板 JSON",
              );
              if (copied) {
                setFeedback({
                  tone: "success",
                  title: "模板已复制",
                  description: "已复制当前模板 JSON。",
                });
              }
            }}
          >
            复制当前模板 JSON
          </Button>
          <Button variant="secondary" size="sm" onClick={onResetTemplates}>
            恢复默认模板
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <AdminTextField
            label="模板标签"
            value={label}
            onChange={setLabel}
            placeholder="例如：需二次核验"
          />
          <AdminTextArea
            label="模板内容"
            value={content}
            onChange={setContent}
            textareaClassName="min-h-24"
            placeholder="例如：聊天摘要和联系人画像仍需二次核验，暂不建议直接覆盖线上角色。"
          />
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              作用域
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={scope === "all" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setScope("all")}
              >
                通用
              </Button>
              <Button
                variant={scope === "record" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setScope("record")}
              >
                记录批注
              </Button>
              <Button
                variant={scope === "snapshot" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setScope("snapshot")}
              >
                版本批注
              </Button>
            </div>
            <div className="text-xs leading-5 text-[color:var(--text-muted)]">
              {formatWechatSyncAnnotationTemplateScopeDescription(scope)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={submitTemplate}
              disabled={!label.trim() || !content.trim()}
            >
              新增自定义模板
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setLabel("");
                setContent("");
                setScope("all");
              }}
              disabled={!label && !content && scope === "all"}
            >
              清空输入
            </Button>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                模板导入 / 合并
              </div>
              <AdminTextArea
                label="模板 JSON"
                value={importJson}
                onChange={setImportJson}
                textareaClassName="min-h-32"
                placeholder="粘贴模板导出的 JSON，或点击“写入当前模板到导入框”后再编辑。"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setImportJson(exportJson);
                    setPreviewFilter("all");
                  }}
                >
                  写入当前模板到导入框
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={importTemplates}
                  disabled={
                    !importJson.trim() ||
                    Boolean(importPreviewState.error) ||
                    importPreviewState.preview?.entries.length === 0
                  }
                >
                  导入并合并
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setImportJson("");
                    setPreviewFilter("all");
                  }}
                  disabled={!importJson.trim()}
                >
                  清空导入框
                </Button>
              </div>
              <AnnotationTemplateImportPreviewPanel
                preview={importPreviewState.preview}
                error={importPreviewState.error}
                filter={previewFilter}
                onFilterChange={setPreviewFilter}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {orderedTemplates.map((template) => (
            <div
              key={template.id}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[color:var(--text-primary)]">
                      {template.label}
                    </span>
                    <StatusPill
                      tone={
                        template.source === "default" ? "healthy" : "warning"
                      }
                    >
                      {template.source === "default"
                        ? "默认模板"
                        : "自定义模板"}
                    </StatusPill>
                    <StatusPill tone="muted">
                      {formatWechatSyncAnnotationTemplateScopeLabel(
                        template.scope,
                      )}
                    </StatusPill>
                    {template.isPinned ? (
                      <StatusPill tone="warning">已置顶</StatusPill>
                    ) : null}
                  </div>
                  <div className="leading-6">{template.content}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={template.scope === "all" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => onUpdateTemplateScope(template.id, "all")}
                  >
                    通用
                  </Button>
                  <Button
                    variant={
                      template.scope === "record" ? "primary" : "secondary"
                    }
                    size="sm"
                    onClick={() => onUpdateTemplateScope(template.id, "record")}
                  >
                    记录
                  </Button>
                  <Button
                    variant={
                      template.scope === "snapshot" ? "primary" : "secondary"
                    }
                    size="sm"
                    onClick={() =>
                      onUpdateTemplateScope(template.id, "snapshot")
                    }
                  >
                    版本
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onToggleTemplatePin(template.id)}
                  >
                    {template.isPinned ? "取消置顶" : "置顶"}
                  </Button>
                  {template.source === "custom" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRemoveTemplate(template.id)}
                    >
                      删除
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AnnotationTemplateImportPreviewPanel({
  preview,
  error,
  filter,
  onFilterChange,
}: {
  preview: WechatSyncAnnotationTemplateImportPreview | null;
  error: string | null;
  filter: "all" | WechatSyncAnnotationTemplateImportPreviewStatus;
  onFilterChange: (
    nextFilter: "all" | WechatSyncAnnotationTemplateImportPreviewStatus,
  ) => void;
}) {
  const filteredEntries = useMemo(() => {
    if (!preview) {
      return [];
    }
    if (filter === "all") {
      return preview.entries;
    }
    return preview.entries.filter((entry) => entry.status === filter);
  }, [filter, preview]);

  if (!error && !preview) {
    return null;
  }

  if (error) {
    return (
      <AdminCallout
        tone="warning"
        title="模板导入预览失败"
        description={error}
      />
    );
  }

  if (!preview) {
    return null;
  }

  const summaryTone = preview.changed
    ? "info"
    : preview.skippedCount > 0
      ? "warning"
      : "success";

  return (
    <div className="space-y-3">
      <AdminCallout
        tone={summaryTone}
        title="导入前差异预览"
        description={preview.message}
      />
      {preview.entries.length ? (
        <div className="flex flex-wrap gap-2">
          {(
            [
              {
                key: "all",
                label: `全部 ${preview.entries.length}`,
              },
              {
                key: "added",
                label: `新增 ${preview.addedCount}`,
              },
              {
                key: "updated",
                label: `更新 ${preview.updatedCount}`,
              },
              {
                key: "unchanged",
                label: `无变化 ${preview.unchangedCount}`,
              },
              {
                key: "skipped",
                label: `跳过 ${preview.skippedCount}`,
              },
            ] as const
          ).map((option) => (
            <Button
              key={option.key}
              variant={filter === option.key ? "primary" : "secondary"}
              size="sm"
              onClick={() => onFilterChange(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {!preview.entries.length ? (
        <AdminEmptyState
          title="当前导入 JSON 没有可预览模板"
          description="补充有效的 templates 数组后，再查看导入前差异。"
        />
      ) : !filteredEntries.length ? (
        <AdminEmptyState
          title="当前筛选没有命中预览项"
          description="切回全部或调整导入 JSON 后，再查看这批模板的差异。"
        />
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.key}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-white/70 px-4 py-3"
            >
              <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[color:var(--text-primary)]">
                    {entry.nextTemplate.label}
                  </span>
                  <StatusPill
                    tone={resolveWechatSyncAnnotationTemplateImportStatusTone(
                      entry.status,
                    )}
                  >
                    {formatWechatSyncAnnotationTemplateImportStatusLabel(
                      entry.status,
                    )}
                  </StatusPill>
                  <StatusPill
                    tone={
                      entry.nextTemplate.source === "default"
                        ? "healthy"
                        : "warning"
                    }
                  >
                    {entry.nextTemplate.source === "default"
                      ? "默认模板"
                      : "自定义模板"}
                  </StatusPill>
                  <StatusPill tone="muted">
                    {formatWechatSyncAnnotationTemplateScopeLabel(
                      entry.nextTemplate.scope,
                    )}
                  </StatusPill>
                  {entry.nextTemplate.isPinned ? (
                    <StatusPill tone="warning">导入后置顶</StatusPill>
                  ) : null}
                </div>
                <div className="leading-6">
                  {formatWechatSyncAnnotationTemplateImportStatusDescription(
                    entry,
                  )}
                </div>
                {entry.status === "updated" && entry.currentTemplate ? (
                  <div className="space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      变更字段：
                      {entry.changedFields
                        .map(formatWechatSyncAnnotationTemplateImportFieldLabel)
                        .join("、")}
                    </div>
                    {entry.changedFields.includes("label") ? (
                      <div>
                        标签：{entry.currentTemplate.label} -&gt;{" "}
                        {entry.nextTemplate.label}
                      </div>
                    ) : null}
                    {entry.changedFields.includes("scope") ? (
                      <div>
                        作用域：
                        {formatWechatSyncAnnotationTemplateScopeLabel(
                          entry.currentTemplate.scope,
                        )}{" "}
                        -&gt;{" "}
                        {formatWechatSyncAnnotationTemplateScopeLabel(
                          entry.nextTemplate.scope,
                        )}
                      </div>
                    ) : null}
                    {entry.changedFields.includes("isPinned") ? (
                      <div>
                        置顶状态：
                        {formatWechatSyncAnnotationTemplatePinnedLabel(
                          entry.currentTemplate.isPinned,
                        )}{" "}
                        -&gt;{" "}
                        {formatWechatSyncAnnotationTemplatePinnedLabel(
                          entry.nextTemplate.isPinned,
                        )}
                      </div>
                    ) : null}
                    {entry.changedFields.includes("content") ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                            当前内容
                          </div>
                          <div className="mt-2 leading-6">
                            {entry.currentTemplate.content}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                            导入后内容
                          </div>
                          <div className="mt-2 leading-6">
                            {entry.nextTemplate.content}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 leading-6">
                    {entry.status === "added"
                      ? `导入后会新增这条模板：${entry.nextTemplate.content}`
                      : entry.status === "unchanged"
                        ? "当前模板已与导入内容一致，不会产生更新。"
                        : "这条默认模板没有命中当前列表，因此本次会跳过，不会新增到模板库。"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnotationTemplateQuickActions({
  templates,
  scope,
  title = "常用模板",
  description = "点击模板会把对应内容追加到当前批注里，重复内容不会重复插入。",
  feedback,
  onApplyTemplate,
}: {
  templates: WechatSyncAnnotationTemplate[];
  scope: "record" | "snapshot";
  title?: string;
  description?: string;
  feedback?: string;
  onApplyTemplate?: (template: WechatSyncAnnotationTemplate) => void;
}) {
  const orderedTemplates = useMemo(
    () =>
      sortWechatSyncAnnotationTemplates(
        filterWechatSyncAnnotationTemplatesByScope(templates, scope),
      ),
    [scope, templates],
  );

  if (!orderedTemplates.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {feedback ? (
        <AdminActionFeedback
          tone="success"
          title="模板已套用"
          description={feedback}
        />
      ) : null}
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {orderedTemplates.map((template) => (
          <Button
            key={template.id}
            variant={template.isPinned ? "primary" : "secondary"}
            size="sm"
            onClick={() => onApplyTemplate?.(template)}
            disabled={!onApplyTemplate}
          >
            {template.label}
          </Button>
        ))}
      </div>
      <div className="text-xs leading-5 text-[color:var(--text-muted)]">
        {description}
      </div>
    </div>
  );
}

function ImportChangeHistoryList({
  characterId,
  characterName,
  records,
  availableSnapshots,
  search,
  modeFilter,
  expandedRecordId,
  linkedVersionFilter,
  shareUrl,
  annotations,
  snapshotAnnotations,
  annotationTemplates,
  onSearchChange,
  onModeFilterChange,
  onExpandedRecordIdChange,
  onLinkedVersionFilterChange,
  onAnnotationChange,
  onApplyAnnotationTemplate,
  onReplaySnapshotPreview,
  onLoadSnapshotToManualInput,
}: {
  characterId: string;
  characterName: string;
  records: WechatImportChangeRecordLike[];
  availableSnapshots: WechatImportSnapshotLike[];
  search: string;
  modeFilter: "all" | "preview_import" | "snapshot_restore";
  expandedRecordId: string | null;
  linkedVersionFilter: number | null;
  shareUrl: string;
  annotations: Record<string, string>;
  snapshotAnnotations: Record<string, string>;
  annotationTemplates: WechatSyncAnnotationTemplate[];
  onSearchChange: (value: string) => void;
  onModeFilterChange: (
    value: "all" | "preview_import" | "snapshot_restore",
  ) => void;
  onExpandedRecordIdChange: (value: string | null) => void;
  onLinkedVersionFilterChange?: (value: number | null) => void;
  onAnnotationChange: (recordId: string, value: string) => void;
  onApplyAnnotationTemplate?: (
    recordId: string,
    template: WechatSyncAnnotationTemplate,
  ) => void;
  onReplaySnapshotPreview?: (snapshot: WechatImportSnapshotLike) => void;
  onLoadSnapshotToManualInput?: (snapshot: WechatImportSnapshotLike) => void;
}) {
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [annotationFilter, setAnnotationFilter] =
    useState<WechatSyncAnnotationFilter>("all");
  const [copyNotice, setCopyNotice] = useState("");
  const [templateFeedback, setTemplateFeedback] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const annotatedRecordCount = useMemo(
    () =>
      records.filter((record) =>
        hasWechatSyncAnnotation(annotations[record.id] ?? ""),
      ).length,
    [annotations, records],
  );
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const note = annotations[record.id] ?? "";
      if (modeFilter !== "all" && record.mode !== modeFilter) {
        return false;
      }
      if (!matchesWechatSyncAnnotationFilter(note, annotationFilter)) {
        return false;
      }
      if (!deferredSearch) {
        return (
          linkedVersionFilter === null ||
          isWechatSyncRecordLinkedToVersion(record, linkedVersionFilter)
        );
      }
      const matchesSearch = buildImportChangeRecordKeyword(
        record,
        note,
      ).includes(deferredSearch);
      const matchesVersion =
        linkedVersionFilter === null ||
        isWechatSyncRecordLinkedToVersion(record, linkedVersionFilter);
      return matchesSearch && matchesVersion;
    });
  }, [
    annotationFilter,
    annotations,
    deferredSearch,
    linkedVersionFilter,
    modeFilter,
    records,
  ]);

  useEffect(() => {
    if (!copyNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopyNotice((current) => (current === copyNotice ? "" : current));
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  useEffect(() => {
    if (!templateFeedback) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setTemplateFeedback((current) =>
        current === templateFeedback ? "" : current,
      );
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [templateFeedback]);

  useEffect(() => {
    if (!focusedRecordId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setFocusedRecordId((current) =>
        current === focusedRecordId ? null : current,
      );
    }, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [focusedRecordId]);

  return (
    <div>
      {copyNotice ? (
        <AdminActionFeedback
          className="mb-4"
          tone="success"
          title="审计报告已复制"
          description={copyNotice}
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            变更记录
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            共 {records.length} 条，当前命中 {filteredRecords.length}{" "}
            条，已写批注 {annotatedRecordCount} 条。
          </div>
        </div>
        <div className="grid gap-3 xl:min-w-[30rem] xl:grid-cols-[1fr_auto]">
          <AdminTextField
            label="筛选变更记录"
            value={search}
            onChange={onSearchChange}
            placeholder="搜索摘要、版本号、字段名、字段值或批注"
          />
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              variant={modeFilter === "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => onModeFilterChange("all")}
            >
              全部
            </Button>
            <Button
              variant={
                modeFilter === "preview_import" ? "primary" : "secondary"
              }
              size="sm"
              onClick={() => onModeFilterChange("preview_import")}
            >
              重新导入
            </Button>
            <Button
              variant={
                modeFilter === "snapshot_restore" ? "primary" : "secondary"
              }
              size="sm"
              onClick={() => onModeFilterChange("snapshot_restore")}
            >
              历史恢复
            </Button>
            <Button
              variant={annotationFilter === "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setAnnotationFilter("all")}
            >
              全部批注
            </Button>
            <Button
              variant={
                annotationFilter === "annotated" ? "primary" : "secondary"
              }
              size="sm"
              onClick={() => setAnnotationFilter("annotated")}
            >
              仅有批注
            </Button>
            <Button
              variant={
                annotationFilter === "unannotated" ? "primary" : "secondary"
              }
              size="sm"
              onClick={() => setAnnotationFilter("unannotated")}
            >
              未批注
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadWechatSyncChangeExport(
                  characterId,
                  characterName,
                  filteredRecords,
                  availableSnapshots,
                  {
                    recordAnnotations: annotations,
                    snapshotAnnotations,
                  },
                )
              }
              disabled={!filteredRecords.length}
            >
              导出当前筛选 JSON
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadWechatSyncChangeMarkdownExport(
                  characterId,
                  characterName,
                  filteredRecords,
                  availableSnapshots,
                  {
                    recordAnnotations: annotations,
                    snapshotAnnotations,
                  },
                )
              }
              disabled={!filteredRecords.length}
            >
              导出当前筛选 Markdown
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const copied = await copyWechatSyncAuditText(
                  shareUrl,
                  "复制审计链接",
                );
                if (copied) {
                  setCopyNotice("已复制当前审计视图分享链接。");
                }
              }}
              disabled={!shareUrl}
            >
              复制当前审计链接
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLinkedVersionFilterChange?.(null)}
              disabled={
                linkedVersionFilter === null || !onLinkedVersionFilterChange
              }
            >
              清除版本联动
            </Button>
          </div>
        </div>
      </div>

      {linkedVersionFilter !== null ? (
        <AdminCallout
          className="mt-4"
          title={`当前只看和 v${linkedVersionFilter} 相关的审计记录`}
          tone="info"
          description="来自版本列表或单条变更记录的联动筛选已生效。这里会保留 toVersion / previousVersion / restoredFromVersion 命中的记录。"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLinkedVersionFilterChange?.(null)}
              disabled={!onLinkedVersionFilterChange}
            >
              查看全部记录
            </Button>
          }
        />
      ) : null}

      {annotationFilter !== "all" ? (
        <AdminCallout
          className="mt-4"
          title={
            annotationFilter === "annotated"
              ? "当前只看带本地批注的审计记录"
              : "当前只看未写本地批注的审计记录"
          }
          tone="info"
          description="这个筛选只作用于当前浏览器里的本地批注，不会影响服务端数据。"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAnnotationFilter("all")}
            >
              查看全部记录
            </Button>
          }
        />
      ) : null}

      {filteredRecords.length ? (
        <div className="mt-4">
          <AnnotationTemplateQuickActions
            templates={annotationTemplates}
            scope="record"
            title="对当前筛选记录批量套用模板"
            description={`当前命中 ${filteredRecords.length} 条记录。点击模板后会把对应内容追加到所有命中记录的本地批注里。`}
            feedback={templateFeedback}
            onApplyTemplate={(template) => {
              const targetRecords = filteredRecords.filter((record) => {
                const currentNote = annotations[record.id] ?? "";
                return (
                  appendWechatSyncAnnotationTemplate(currentNote, template) !==
                  currentNote.trim()
                );
              });
              if (!targetRecords.length) {
                setTemplateFeedback(
                  `当前筛选记录都已包含模板“${template.label}”。`,
                );
                return;
              }
              targetRecords.forEach((record) =>
                onApplyAnnotationTemplate?.(record.id, template),
              );
              setTemplateFeedback(
                `已把模板“${template.label}”追加到 ${targetRecords.length} 条当前筛选记录。`,
              );
            }}
          />
        </div>
      ) : null}

      {!filteredRecords.length ? (
        <AdminEmptyState
          className="mt-4"
          title="当前筛选没有匹配的变更记录"
          description="调整搜索词或筛选类型后，再查看这条角色的导入审计轨迹。"
        />
      ) : null}

      <div className="mt-3 space-y-3">
        {filteredRecords.map((record) => {
          const expanded = expandedRecordId === record.id;
          const diffHeadings = buildImportChangeDiffHeadings(record);
          const replaySnapshot = resolveReplaySnapshotForChangeRecord(
            record,
            availableSnapshots,
          );
          const focused = focusedRecordId === record.id;
          const note = annotations[record.id] ?? "";

          return (
            <Card
              key={record.id}
              className={`bg-[color:var(--surface-soft)] ${
                focused
                  ? "ring-2 ring-emerald-200 shadow-[var(--shadow-soft)]"
                  : ""
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[color:var(--text-primary)]">
                      v{record.toVersion}
                    </span>
                    <StatusPill
                      tone={
                        record.mode === "snapshot_restore" ? "warning" : "muted"
                      }
                    >
                      {record.mode === "snapshot_restore"
                        ? "历史版本恢复"
                        : "预览重新导入"}
                    </StatusPill>
                    <StatusPill
                      tone={record.changedFields.length ? "warning" : "healthy"}
                    >
                      {record.changedFields.length
                        ? `变更 ${record.changedFields.length} 项`
                        : "无字段差异"}
                    </StatusPill>
                    {focused ? (
                      <StatusPill tone="healthy">已回放</StatusPill>
                    ) : null}
                  </div>
                  <div>记录时间：{formatDateTime(record.recordedAt)}</div>
                  <div>
                    版本轨迹：
                    {buildChangeRecordVersionPath(record)}
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 leading-6">
                    {record.summary}
                  </div>
                  {note.trim() ? (
                    <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                      本地批注：{note}
                    </div>
                  ) : null}
                </div>
                <div className="flex max-w-xl flex-col items-start gap-3">
                  <div className="flex flex-wrap gap-2">
                    {record.changedFields.length ? (
                      record.changedFields.map((field) => (
                        <StatusPill
                          key={`${record.id}-${field}`}
                          tone="warning"
                        >
                          {field}
                        </StatusPill>
                      ))
                    ) : (
                      <StatusPill tone="healthy">无字段差异</StatusPill>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={expanded ? "primary" : "secondary"}
                      size="sm"
                      onClick={() =>
                        onExpandedRecordIdChange(expanded ? null : record.id)
                      }
                    >
                      {expanded ? "收起完整 diff" : "展开完整 diff"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        downloadWechatSyncChangeExport(
                          characterId,
                          characterName,
                          [record],
                          availableSnapshots,
                          {
                            recordAnnotations: annotations,
                            snapshotAnnotations,
                          },
                        )
                      }
                    >
                      导出本条 JSON
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        downloadWechatSyncChangeMarkdownExport(
                          characterId,
                          characterName,
                          [record],
                          availableSnapshots,
                          {
                            recordAnnotations: annotations,
                            snapshotAnnotations,
                          },
                        )
                      }
                    >
                      导出本条 Markdown
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const copied = await copyWechatSyncAuditText(
                          buildWechatSyncChangeMarkdownReport(
                            characterId,
                            characterName,
                            [record],
                            availableSnapshots,
                            {
                              recordAnnotations: annotations,
                              snapshotAnnotations,
                            },
                          ),
                          "复制审计 Markdown",
                        );
                        if (copied) {
                          setCopyNotice(
                            `已复制 v${record.toVersion} 的单条 Markdown 审计报告。`,
                          );
                        }
                      }}
                    >
                      复制本条 Markdown
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        replaySnapshot &&
                        onLoadSnapshotToManualInput?.(replaySnapshot)
                      }
                      disabled={!replaySnapshot || !onLoadSnapshotToManualInput}
                    >
                      写入回放 JSON
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onLinkedVersionFilterChange?.(record.toVersion)
                      }
                      disabled={!onLinkedVersionFilterChange}
                    >
                      筛选相关版本
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!replaySnapshot || !onReplaySnapshotPreview) {
                          return;
                        }
                        onExpandedRecordIdChange(record.id);
                        onLinkedVersionFilterChange?.(record.toVersion);
                        setFocusedRecordId(record.id);
                        onReplaySnapshotPreview(replaySnapshot);
                      }}
                      disabled={!replaySnapshot || !onReplaySnapshotPreview}
                    >
                      {replaySnapshot ? "回放为此版本预览" : "当前无可回放快照"}
                    </Button>
                  </div>
                </div>
              </div>
              {expanded ? (
                <div className="mt-4 space-y-4">
                  <AdminTextArea
                    label="记录批注（仅保存在当前浏览器）"
                    value={note}
                    onChange={(value) => onAnnotationChange(record.id, value)}
                    textareaClassName="min-h-24"
                    placeholder="补充这条导入记录的判断、风险、回放备注。"
                  />
                  <AnnotationTemplateQuickActions
                    templates={annotationTemplates}
                    scope="record"
                    onApplyTemplate={(template) =>
                      onApplyAnnotationTemplate?.(record.id, template)
                    }
                  />
                  {record.diffs?.length ? (
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                        {diffHeadings.title}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {record.diffs.map((diff) => (
                          <HistoryDiffCard
                            key={`${record.id}-${diff.label}`}
                            diff={{
                              label: diff.label,
                              currentValue: diff.previousValue,
                              nextValue: diff.nextValue,
                              changed: diff.changed,
                            }}
                            currentHeading={diffHeadings.previous}
                            nextHeading={diffHeadings.next}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <AdminCallout
                      title="这条旧记录还没有完整 diff 快照"
                      tone="muted"
                      description="这条变更记录创建时系统还未持久化字段级 diff。后续产生的新记录都会在这里直接展开完整对比。"
                    />
                  )}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ImportSnapshotVersionList({
  title,
  characterName,
  liveItem,
  snapshots,
  linkedVersionFilter,
  annotationCharacterId,
  annotations,
  annotationTemplates,
  onRestorePreview,
  onRestoreLive,
  onConfirmRestoreLive,
  onCancelRestoreLive,
  onLoadToManualInput,
  onLinkRelatedRecords,
  onAnnotationChange,
  onApplyAnnotationTemplate,
  confirmingSnapshotKey,
  focusedSnapshotKey,
  restoringSnapshotKey,
}: {
  title: string;
  characterName: string;
  liveItem: WechatSyncHistoryItem | null;
  snapshots: WechatImportSnapshotLike[];
  linkedVersionFilter?: number | null;
  annotationCharacterId?: string | null;
  annotations: Record<string, string>;
  annotationTemplates: WechatSyncAnnotationTemplate[];
  onRestorePreview?: (snapshot: WechatImportSnapshotLike) => void;
  onRestoreLive?: (snapshot: WechatImportSnapshotLike) => void;
  onConfirmRestoreLive?: () => void;
  onCancelRestoreLive?: () => void;
  onLoadToManualInput?: (snapshot: WechatImportSnapshotLike) => void;
  onLinkRelatedRecords?: (version: number | null) => void;
  onAnnotationChange?: (
    snapshot: WechatImportSnapshotLike,
    value: string,
  ) => void;
  onApplyAnnotationTemplate?: (
    snapshot: WechatImportSnapshotLike,
    template: WechatSyncAnnotationTemplate,
  ) => void;
  confirmingSnapshotKey?: string | null;
  focusedSnapshotKey?: string | null;
  restoringSnapshotKey?: string | null;
}) {
  const snapshotCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [annotationFilter, setAnnotationFilter] =
    useState<WechatSyncAnnotationFilter>("all");
  const [copyNotice, setCopyNotice] = useState("");
  const [templateFeedback, setTemplateFeedback] = useState("");

  useEffect(() => {
    if (!focusedSnapshotKey) {
      return;
    }
    const target = snapshotCardRefs.current[focusedSnapshotKey];
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusedSnapshotKey]);

  useEffect(() => {
    if (!copyNotice) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCopyNotice((current) => (current === copyNotice ? "" : current));
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [copyNotice]);

  useEffect(() => {
    if (!templateFeedback) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setTemplateFeedback((current) =>
        current === templateFeedback ? "" : current,
      );
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [templateFeedback]);

  useEffect(() => {
    setAnnotationFilter("all");
    setCopyNotice("");
    setTemplateFeedback("");
  }, [characterName, title]);

  if (!snapshots.length) {
    return null;
  }

  const resolvedAnnotationCharacterId =
    annotationCharacterId ?? liveItem?.character.id ?? null;
  const annotatedSnapshotCount = snapshots.filter((snapshot) =>
    hasWechatSyncAnnotation(
      resolveWechatSyncSnapshotAnnotation(
        annotations,
        snapshot,
        resolvedAnnotationCharacterId,
      ),
    ),
  ).length;
  const visibleSnapshots =
    linkedVersionFilter === null || linkedVersionFilter === undefined
      ? snapshots
      : snapshots.filter(
          (snapshot) => snapshot.version === linkedVersionFilter,
        );
  const filteredSnapshots = visibleSnapshots.filter((snapshot) =>
    matchesWechatSyncAnnotationFilter(
      resolveWechatSyncSnapshotAnnotation(
        annotations,
        snapshot,
        resolvedAnnotationCharacterId,
      ),
      annotationFilter,
    ),
  );

  return (
    <div>
      {copyNotice ? (
        <AdminActionFeedback
          className="mb-4"
          tone="success"
          title="版本批注已复制"
          description={copyNotice}
        />
      ) : null}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            {title}
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            共 {snapshots.length} 张，当前命中 {filteredSnapshots.length}{" "}
            张，已写批注 {annotatedSnapshotCount} 张。
          </div>
          {linkedVersionFilter !== null && linkedVersionFilter !== undefined ? (
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              当前只展示和 v{linkedVersionFilter} 对应的版本卡。
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={annotationFilter === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAnnotationFilter("all")}
          >
            全部批注
          </Button>
          <Button
            variant={annotationFilter === "annotated" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAnnotationFilter("annotated")}
          >
            仅有批注
          </Button>
          <Button
            variant={
              annotationFilter === "unannotated" ? "primary" : "secondary"
            }
            size="sm"
            onClick={() => setAnnotationFilter("unannotated")}
          >
            未批注
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadWechatSyncSnapshotNotesMarkdownExport(
                characterName,
                filteredSnapshots,
                annotations,
                resolvedAnnotationCharacterId,
              )
            }
            disabled={!filteredSnapshots.length}
          >
            导出当前批注 Markdown
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const copied = await copyWechatSyncAuditText(
                buildWechatSyncSnapshotNotesMarkdownReport(
                  characterName,
                  filteredSnapshots,
                  annotations,
                  resolvedAnnotationCharacterId,
                ),
                "复制版本批注 Markdown",
              );
              if (copied) {
                setCopyNotice("已复制当前版本批注 Markdown。");
              }
            }}
            disabled={!filteredSnapshots.length}
          >
            复制当前批注 Markdown
          </Button>
          {linkedVersionFilter !== null && linkedVersionFilter !== undefined ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLinkRelatedRecords?.(null)}
              disabled={!onLinkRelatedRecords}
            >
              查看全部版本
            </Button>
          ) : null}
        </div>
      </div>
      {linkedVersionFilter !== null && linkedVersionFilter !== undefined ? (
        <AdminCallout
          className="mt-4"
          title={`当前只看 v${linkedVersionFilter} 版本卡`}
          tone="info"
          description="来自变更记录区的联动筛选已生效。清除后会恢复完整版本链。"
        />
      ) : null}
      {annotationFilter !== "all" ? (
        <AdminCallout
          className="mt-4"
          title={
            annotationFilter === "annotated"
              ? "当前只看带本地批注的版本卡"
              : "当前只看未写本地批注的版本卡"
          }
          tone="info"
          description="这个筛选只作用于当前浏览器里的本地批注，不会影响服务端快照链。"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAnnotationFilter("all")}
            >
              查看全部版本
            </Button>
          }
        />
      ) : null}

      {filteredSnapshots.length ? (
        <div className="mt-4">
          <AnnotationTemplateQuickActions
            templates={annotationTemplates}
            scope="snapshot"
            title="对当前筛选版本批量套用模板"
            description={`当前命中 ${filteredSnapshots.length} 张版本卡。点击模板后会把对应内容追加到所有命中版本的本地批注里。`}
            feedback={templateFeedback}
            onApplyTemplate={(template) => {
              const targetSnapshots = filteredSnapshots.filter((snapshot) => {
                const currentNote = resolveWechatSyncSnapshotAnnotation(
                  annotations,
                  snapshot,
                  resolvedAnnotationCharacterId,
                );
                return (
                  appendWechatSyncAnnotationTemplate(currentNote, template) !==
                  currentNote.trim()
                );
              });
              if (!targetSnapshots.length) {
                setTemplateFeedback(
                  `当前筛选版本都已包含模板“${template.label}”。`,
                );
                return;
              }
              targetSnapshots.forEach((snapshot) =>
                onApplyAnnotationTemplate?.(snapshot, template),
              );
              setTemplateFeedback(
                `已把模板“${template.label}”追加到 ${targetSnapshots.length} 张当前筛选版本卡。`,
              );
            }}
          />
        </div>
      ) : null}

      {!filteredSnapshots.length ? (
        <AdminEmptyState
          className="mt-4"
          title="当前筛选没有命中版本卡"
          description={
            linkedVersionFilter !== null && linkedVersionFilter !== undefined
              ? "这通常说明所选记录引用的是更旧的历史版本。清除联动筛选后可恢复完整版本链。"
              : "调整批注筛选后，再查看这条角色的版本链。"
          }
        />
      ) : null}
      <div className="mt-3 space-y-3">
        {filteredSnapshots.map((snapshot) => {
          const diffs = liveItem
            ? buildHistorySnapshotDiffs(liveItem, snapshot)
            : [];
          const isCurrentVersion =
            snapshots[0]?.version === snapshot.version &&
            snapshots[0]?.importedAt === snapshot.importedAt;
          const changedDiffs = diffs.filter((diff) => diff.changed);
          const compressedSummary = liveItem
            ? summarizeChangedDiffs(changedDiffs)
            : "当前线上角色已回滚，恢复此版本会重新创建角色并回填当时的导入字段。";
          const restoreKey = buildSnapshotMutationKey(
            liveItem?.character.id ?? "rollback-guide",
            snapshot,
          );
          const awaitingConfirmation = confirmingSnapshotKey === restoreKey;
          const focused = focusedSnapshotKey === restoreKey;
          const note = resolveWechatSyncSnapshotAnnotation(
            annotations,
            snapshot,
            resolvedAnnotationCharacterId,
          );
          const restoreDisabled =
            (liveItem ? changedDiffs.length === 0 : false) || !onRestoreLive;

          return (
            <div
              key={`${snapshot.version}-${snapshot.importedAt}`}
              ref={(node) => {
                snapshotCardRefs.current[restoreKey] = node;
              }}
              className="scroll-mt-24"
            >
              <Card
                className={`bg-[color:var(--surface-soft)] ${
                  focused
                    ? "ring-2 ring-emerald-200 shadow-[var(--shadow-soft)]"
                    : ""
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-[color:var(--text-primary)]">
                        v{snapshot.version}
                      </span>
                      <StatusPill tone={isCurrentVersion ? "healthy" : "muted"}>
                        {isCurrentVersion ? "当前版本" : "历史版本"}
                      </StatusPill>
                      <StatusPill
                        tone={
                          snapshot.status === "created" ? "healthy" : "warning"
                        }
                      >
                        {snapshot.status === "created"
                          ? "首次创建"
                          : "覆盖更新"}
                      </StatusPill>
                      <StatusPill
                        tone={
                          liveItem
                            ? changedDiffs.length
                              ? "warning"
                              : "healthy"
                            : "warning"
                        }
                      >
                        {liveItem
                          ? changedDiffs.length
                            ? `将变更 ${changedDiffs.length} 项`
                            : "与当前线上一致"
                          : "将重建线上角色"}
                      </StatusPill>
                      {focused ? (
                        <StatusPill tone="healthy">已定位</StatusPill>
                      ) : null}
                    </div>
                    <div>导入时间：{formatDateTime(snapshot.importedAt)}</div>
                    <div>
                      角色名：
                      {snapshot.draftCharacter.name ||
                        snapshot.contact.displayName}
                    </div>
                    <div>
                      关系：{snapshot.draftCharacter.relationship || "暂无"}
                    </div>
                    <div>
                      标签：
                      {snapshot.contact.tags.length
                        ? snapshot.contact.tags.join("、")
                        : "暂无"}
                    </div>
                    <div>朋友圈种子：{snapshot.seededMomentCount} 条</div>
                    <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                      差异摘要：{compressedSummary}
                    </div>
                    {note.trim() ? (
                      <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                        本地批注：{note}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onLinkRelatedRecords?.(snapshot.version)}
                      disabled={!onLinkRelatedRecords}
                    >
                      筛选相关记录
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onLoadToManualInput?.(snapshot)}
                      disabled={!onLoadToManualInput}
                    >
                      写入此版本 JSON
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRestorePreview?.(snapshot)}
                      disabled={!onRestorePreview}
                    >
                      恢复为此版本预览
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onRestoreLive?.(snapshot)}
                      disabled={
                        restoreDisabled ||
                        restoringSnapshotKey === restoreKey ||
                        awaitingConfirmation
                      }
                    >
                      {restoringSnapshotKey === restoreKey
                        ? "恢复中..."
                        : awaitingConfirmation
                          ? "等待确认..."
                          : liveItem
                            ? changedDiffs.length
                              ? "直接恢复为线上角色"
                              : "当前已在线上"
                            : "直接恢复为线上角色"}
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <AdminTextArea
                    label="版本批注（仅保存在当前浏览器）"
                    value={note}
                    onChange={(value) => onAnnotationChange?.(snapshot, value)}
                    textareaClassName="min-h-24"
                    placeholder="记录这个版本的判断、来源可信度或恢复备注。"
                  />
                  <div className="mt-4">
                    <AnnotationTemplateQuickActions
                      templates={annotationTemplates}
                      scope="snapshot"
                      onApplyTemplate={(template) =>
                        onApplyAnnotationTemplate?.(snapshot, template)
                      }
                    />
                  </div>
                </div>
                {awaitingConfirmation ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                    <div className="font-semibold text-[color:var(--text-primary)]">
                      {liveItem
                        ? `确认把 ${liveItem.character.name} 恢复成快照 v${snapshot.version}？`
                        : `确认用快照 v${snapshot.version} 重建线上角色？`}
                    </div>
                    <div className="mt-2 leading-6">
                      {liveItem
                        ? `本次会生成一个新的线上导入版本，并自动记录变更摘要。预计改动：${compressedSummary}`
                        : "当前角色已经回滚删除。确认后会按这个历史快照重新创建角色、恢复好友资料，并自动写入恢复记录。"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={onConfirmRestoreLive}
                        disabled={
                          !onConfirmRestoreLive ||
                          restoringSnapshotKey === restoreKey
                        }
                      >
                        {restoringSnapshotKey === restoreKey
                          ? "恢复中..."
                          : "确认恢复为线上角色"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onCancelRestoreLive}
                        disabled={
                          !onCancelRestoreLive ||
                          restoringSnapshotKey === restoreKey
                        }
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          );
        })}
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
  const domains = (
    draft.expertDomains?.length ? draft.expertDomains : ["general"]
  ).join("、");

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
              <div>
                备注 / 昵称：
                {item.contact.remarkName || item.contact.nickname || "暂无"}
              </div>
              <div>地区：{item.contact.region || "暂无"}</div>
              <div>消息数：{item.contact.messageCount}</div>
              <div>
                最近聊天：{formatDateTime(item.contact.latestMessageAt)}
              </div>
              <div>
                标签：
                {item.contact.tags.length
                  ? item.contact.tags.join("、")
                  : "暂无"}
              </div>
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
                      {message.sender || formatDirection(message.direction)} ·{" "}
                      {message.timestamp}
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

function formatConnectorProviderLabel(value?: WechatConnectorProviderKey | null) {
  switch (value) {
    case "wechat-decrypt-http":
      return "wechat-decrypt HTTP";
    case "manual-json":
      return "本地 JSON";
    default:
      return "未回报";
  }
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

function parseWechatSyncContactBundles(
  value: string,
): WechatSyncContactBundle[] {
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

function readMessageSamples(
  value: unknown,
): WechatSyncContactBundle["sampleMessages"] {
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
  return value.map((entry) => readString(entry)).filter(Boolean);
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

function patchDraftDomains(
  draft: CharacterDraft,
  value: string,
): CharacterDraft {
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
  return sourceKey.startsWith("wechat:")
    ? sourceKey.slice("wechat:".length)
    : sourceKey;
}

function buildWechatSourceKey(username: string) {
  return `wechat:${username}`;
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
    extractWechatUsername(item.character.sourceKey) ||
    `wechat_import_${item.character.id}`;
  const displayName =
    item.remarkName?.trim() || item.character.name.trim() || "未命名联系人";
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

type WechatImportSnapshotLike = NonNullable<
  NonNullable<
    WechatSyncHistoryItem["character"]["profile"]["wechatSyncImport"]
  >["currentSnapshot"]
>;

type WechatImportChangeRecordLike = NonNullable<
  NonNullable<
    WechatSyncHistoryItem["character"]["profile"]["wechatSyncImport"]
  >["changeHistory"]
>[number];

function getImportSnapshotsFromHistoryItem(item: WechatSyncHistoryItem) {
  const metadata = item.character.profile?.wechatSyncImport;
  const snapshots = [
    ...(metadata?.snapshotHistory ?? []),
    ...(metadata?.changeHistory?.map((record) => record.resultSnapshot) ?? []),
    metadata?.currentSnapshot ?? null,
    metadata?.previousSnapshot ?? null,
  ];
  const seen = new Set<string>();
  const items: WechatImportSnapshotLike[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot) {
      continue;
    }
    const key = `${snapshot.version}:${snapshot.importedAt}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(snapshot);
  }

  return items.sort(
    (left, right) => Date.parse(right.importedAt) - Date.parse(left.importedAt),
  );
}

function getImportChangeHistoryFromHistoryItem(item: WechatSyncHistoryItem) {
  const history = item.character.profile?.wechatSyncImport?.changeHistory ?? [];
  const seen = new Set<string>();
  const records: WechatImportChangeRecordLike[] = [];

  for (const record of history) {
    if (seen.has(record.id)) {
      continue;
    }
    seen.add(record.id);
    records.push(record);
  }

  return records.sort(
    (left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt),
  );
}

function buildChangeRecordVersionPath(record: WechatImportChangeRecordLike) {
  const previousVersion =
    record.previousVersion && record.previousVersion > 0
      ? `v${record.previousVersion}`
      : "无上一版";
  if (record.mode === "snapshot_restore") {
    return `${previousVersion} -> 快照 v${record.restoredFromVersion ?? "?"} -> v${record.toVersion}`;
  }
  return `${previousVersion} -> v${record.toVersion}`;
}

function isWechatSyncRecordLinkedToVersion(
  record: WechatImportChangeRecordLike,
  version: number,
) {
  return (
    record.toVersion === version ||
    record.previousVersion === version ||
    record.restoredFromVersion === version
  );
}

type WechatSyncViewState = {
  historySearch: string;
  historyStatusFilter: "all" | "active" | "attention" | "removed";
  selectedHistoryCharacterId: string | null;
  auditSearch: string;
  auditModeFilter: "all" | "preview_import" | "snapshot_restore";
  auditExpandedRecordId: string | null;
  linkedAuditVersion: number | null;
};

type WechatSyncAnnotationFilter = "all" | "annotated" | "unannotated";

type WechatSyncAnnotationTemplateScope = "all" | "record" | "snapshot";

type WechatSyncAnnotationTemplate = {
  id: string;
  label: string;
  content: string;
  source: "default" | "custom";
  isPinned: boolean;
  scope: WechatSyncAnnotationTemplateScope;
};

type WechatSyncAnnotationTemplateImportResult = {
  templates: WechatSyncAnnotationTemplate[];
  changed: boolean;
  addedCount: number;
  updatedCount: number;
  message: string;
};

type WechatSyncAnnotationTemplateImportPreviewStatus =
  | "added"
  | "updated"
  | "unchanged"
  | "skipped";

type WechatSyncAnnotationTemplateImportPreviewField =
  | "label"
  | "content"
  | "scope"
  | "isPinned";

type WechatSyncAnnotationTemplateImportPreviewEntry = {
  key: string;
  status: WechatSyncAnnotationTemplateImportPreviewStatus;
  currentTemplate: WechatSyncAnnotationTemplate | null;
  nextTemplate: WechatSyncAnnotationTemplate;
  changedFields: WechatSyncAnnotationTemplateImportPreviewField[];
};

type WechatSyncAnnotationTemplateImportPreview = {
  nextTemplates: WechatSyncAnnotationTemplate[];
  entries: WechatSyncAnnotationTemplateImportPreviewEntry[];
  changed: boolean;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
  message: string;
};

type WechatSyncAnnotationsState = {
  records: Record<string, string>;
  snapshots: Record<string, string>;
};

function readInitialWechatSyncViewState(): WechatSyncViewState {
  if (typeof window === "undefined") {
    return {
      historySearch: "",
      historyStatusFilter: "all",
      selectedHistoryCharacterId: null,
      auditSearch: "",
      auditModeFilter: "all",
      auditExpandedRecordId: null,
      linkedAuditVersion: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const historyStatus = params.get("historyStatus");
  const auditMode = params.get("auditMode");
  const linkedVersion = params.get("auditVersion");

  return {
    historySearch: params.get("historySearch") ?? "",
    historyStatusFilter:
      historyStatus === "active" ||
      historyStatus === "attention" ||
      historyStatus === "removed"
        ? historyStatus
        : "all",
    selectedHistoryCharacterId: params.get("historyCharacter") || null,
    auditSearch: params.get("auditSearch") ?? "",
    auditModeFilter:
      auditMode === "preview_import" || auditMode === "snapshot_restore"
        ? auditMode
        : "all",
    auditExpandedRecordId: params.get("auditRecord") || null,
    linkedAuditVersion:
      linkedVersion && Number.isFinite(Number(linkedVersion))
        ? Number(linkedVersion)
        : null,
  };
}

function hasWechatSyncViewQueryState() {
  if (typeof window === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return [
    "historySearch",
    "historyStatus",
    "historyCharacter",
    "auditSearch",
    "auditMode",
    "auditRecord",
    "auditVersion",
  ].some((key) => params.has(key));
}

function readSavedWechatSyncLocalViewState(): WechatSyncViewState | null {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(WECHAT_SYNC_LOCAL_VIEW_STATE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return normalizeWechatSyncViewState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveWechatSyncLocalViewState(state: WechatSyncViewState) {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return;
  }
  storage.setItem(
    WECHAT_SYNC_LOCAL_VIEW_STATE_STORAGE_KEY,
    JSON.stringify(state),
  );
}

function normalizeWechatSyncViewState(value: unknown): WechatSyncViewState {
  const record = isRecord(value) ? value : {};
  return {
    historySearch: readString(record.historySearch),
    historyStatusFilter:
      record.historyStatusFilter === "active" ||
      record.historyStatusFilter === "attention" ||
      record.historyStatusFilter === "removed"
        ? record.historyStatusFilter
        : "all",
    selectedHistoryCharacterId: readNullableString(
      record.selectedHistoryCharacterId,
    ),
    auditSearch: readString(record.auditSearch),
    auditModeFilter:
      record.auditModeFilter === "preview_import" ||
      record.auditModeFilter === "snapshot_restore"
        ? record.auditModeFilter
        : "all",
    auditExpandedRecordId: readNullableString(record.auditExpandedRecordId),
    linkedAuditVersion:
      typeof record.linkedAuditVersion === "number" &&
      Number.isFinite(record.linkedAuditVersion)
        ? record.linkedAuditVersion
        : null,
  };
}

function readWechatSyncAnnotationsState(): WechatSyncAnnotationsState {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return { records: {}, snapshots: {} };
  }
  const raw = storage.getItem(WECHAT_SYNC_ANNOTATIONS_STORAGE_KEY);
  if (!raw) {
    return { records: {}, snapshots: {} };
  }
  try {
    const parsed = JSON.parse(raw);
    const record = isRecord(parsed) ? parsed : {};
    return {
      records: normalizeWechatSyncAnnotationMap(record.records),
      snapshots: normalizeWechatSyncAnnotationMap(record.snapshots),
    };
  } catch {
    return { records: {}, snapshots: {} };
  }
}

function persistWechatSyncAnnotationsState(state: WechatSyncAnnotationsState) {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return;
  }
  storage.setItem(WECHAT_SYNC_ANNOTATIONS_STORAGE_KEY, JSON.stringify(state));
}

function readWechatSyncAnnotationTemplates() {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES;
  }
  const raw = storage.getItem(WECHAT_SYNC_ANNOTATION_TEMPLATES_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES;
  }
  try {
    const parsed = JSON.parse(raw);
    const record = isRecord(parsed) ? parsed : null;
    const customTemplates = record
      ? normalizeWechatSyncAnnotationTemplates(record.customTemplates)
      : normalizeWechatSyncAnnotationTemplates(parsed);
    const pinnedTemplateIds = record
      ? readStringArray(record.pinnedTemplateIds)
      : [];
    return hydrateWechatSyncAnnotationTemplates(
      customTemplates,
      new Set(pinnedTemplateIds),
    );
  } catch {
    return DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES;
  }
}

function persistWechatSyncAnnotationTemplates(
  templates: WechatSyncAnnotationTemplate[],
) {
  const storage = getWechatSyncBrowserStorage();
  if (!storage) {
    return;
  }
  const customTemplates = templates
    .filter((template) => template.source === "custom")
    .map((template) => ({
      id: template.id,
      label: template.label,
      content: template.content,
      scope: template.scope,
    }));
  const pinnedTemplateIds = templates
    .filter((template) => template.isPinned)
    .map((template) => template.id);
  storage.setItem(
    WECHAT_SYNC_ANNOTATION_TEMPLATES_STORAGE_KEY,
    JSON.stringify({
      customTemplates,
      pinnedTemplateIds,
    }),
  );
}

function normalizeWechatSyncAnnotationMap(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, readString(entry)])
      .filter(([, entry]) => entry.length > 0),
  );
}

function normalizeWechatSyncAnnotationTemplates(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry.id);
      const label = readString(entry.label);
      const content = readString(entry.content);
      const scope = normalizeWechatSyncAnnotationTemplateScope(entry.scope);
      if (!id || !label || !content) {
        return null;
      }
      return {
        id,
        label,
        content,
        source: "custom" as const,
        isPinned: false,
        scope,
      };
    })
    .filter(Boolean) as WechatSyncAnnotationTemplate[];
}

function hydrateWechatSyncAnnotationTemplates(
  customTemplates: WechatSyncAnnotationTemplate[],
  pinnedTemplateIds: Set<string>,
) {
  return [
    ...DEFAULT_WECHAT_SYNC_ANNOTATION_TEMPLATES.map((template) => ({
      ...template,
      isPinned: pinnedTemplateIds.has(template.id),
    })),
    ...customTemplates.map((template) => ({
      ...template,
      isPinned: pinnedTemplateIds.has(template.id),
    })),
  ];
}

function sortWechatSyncAnnotationTemplates(
  templates: WechatSyncAnnotationTemplate[],
) {
  return [...templates].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }
    if (left.source !== right.source) {
      return left.source === "default" ? -1 : 1;
    }
    return left.label.localeCompare(right.label, "zh-Hans-CN");
  });
}

function filterWechatSyncAnnotationTemplatesByScope(
  templates: WechatSyncAnnotationTemplate[],
  scope: "record" | "snapshot",
) {
  return templates.filter(
    (template) => template.scope === "all" || template.scope === scope,
  );
}

function normalizeWechatSyncAnnotationTemplateScope(
  value: unknown,
): WechatSyncAnnotationTemplateScope {
  return value === "record" || value === "snapshot" ? value : "all";
}

function formatWechatSyncAnnotationTemplateScopeLabel(
  scope: WechatSyncAnnotationTemplateScope,
) {
  switch (scope) {
    case "record":
      return "记录批注";
    case "snapshot":
      return "版本批注";
    default:
      return "通用";
  }
}

function formatWechatSyncAnnotationTemplateScopeDescription(
  scope: WechatSyncAnnotationTemplateScope,
) {
  switch (scope) {
    case "record":
      return "只会出现在记录批注和记录批量套用区。";
    case "snapshot":
      return "只会出现在版本批注和版本批量套用区。";
    default:
      return "会同时出现在记录批注和版本批注场景。";
  }
}

function buildWechatSyncAnnotationTemplateExportPayload(
  templates: WechatSyncAnnotationTemplate[],
) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: templates.map((template) => ({
      id: template.id,
      label: template.label,
      content: template.content,
      source: template.source,
      isPinned: template.isPinned,
      scope: template.scope,
    })),
  };
}

function downloadWechatSyncAnnotationTemplateExport(
  templates: WechatSyncAnnotationTemplate[],
) {
  downloadWechatSyncAuditFile(
    `wechat-sync-annotation-templates-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(
      buildWechatSyncAnnotationTemplateExportPayload(templates),
      null,
      2,
    ),
    "application/json",
  );
}

function mergeWechatSyncAnnotationTemplateImportPayload(
  currentTemplates: WechatSyncAnnotationTemplate[],
  raw: string,
): WechatSyncAnnotationTemplateImportResult {
  const preview = buildWechatSyncAnnotationTemplateImportPreview(
    currentTemplates,
    raw,
  );
  if (!preview.entries.length) {
    return {
      templates: preview.nextTemplates,
      changed: false,
      addedCount: 0,
      updatedCount: 0,
      message: "导入 JSON 里没有可用模板。",
    };
  }
  return {
    templates: preview.nextTemplates,
    changed: preview.changed,
    addedCount: preview.addedCount,
    updatedCount: preview.updatedCount,
    message: preview.changed
      ? `已导入模板：新增 ${preview.addedCount} 条，更新 ${preview.updatedCount} 条${
          preview.skippedCount
            ? `，跳过 ${preview.skippedCount} 条未命中的默认模板`
            : ""
        }。`
      : preview.skippedCount
        ? `导入完成，没有可生效变更；已跳过 ${preview.skippedCount} 条未命中的默认模板。`
        : "导入完成，但没有需要变更的模板。",
  };
}

function buildWechatSyncAnnotationTemplateImportPreview(
  currentTemplates: WechatSyncAnnotationTemplate[],
  raw: string,
): WechatSyncAnnotationTemplateImportPreview {
  const importedTemplates = parseWechatSyncAnnotationTemplateImportPayload(raw);
  if (!importedTemplates.length) {
    return {
      nextTemplates: sortWechatSyncAnnotationTemplates(currentTemplates),
      entries: [],
      changed: false,
      addedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      skippedCount: 0,
      message: "导入 JSON 里没有可用模板。",
    };
  }

  const nextTemplates = [...currentTemplates];
  const entries: WechatSyncAnnotationTemplateImportPreviewEntry[] = [];
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;

  importedTemplates.forEach((importedTemplate, index) => {
    const existingIndex = findMatchingWechatSyncAnnotationTemplateIndex(
      nextTemplates,
      importedTemplate,
    );

    if (existingIndex >= 0) {
      const currentTemplate = nextTemplates[existingIndex];
      const nextTemplate = buildWechatSyncAnnotationTemplateImportMergeTarget(
        currentTemplate,
        importedTemplate,
      );
      const changedFields = diffWechatSyncAnnotationTemplateImportFields(
        currentTemplate,
        nextTemplate,
      );
      const status = changedFields.length ? "updated" : "unchanged";
      if (changedFields.length) {
        nextTemplates[existingIndex] = nextTemplate;
        updatedCount += 1;
      } else {
        unchangedCount += 1;
      }
      entries.push({
        key: `${importedTemplate.id}-${index}`,
        status,
        currentTemplate,
        nextTemplate,
        changedFields,
      });
      return;
    }

    if (importedTemplate.source === "default") {
      skippedCount += 1;
      entries.push({
        key: `${importedTemplate.id}-${index}`,
        status: "skipped",
        currentTemplate: null,
        nextTemplate: importedTemplate,
        changedFields: [],
      });
      return;
    }

    nextTemplates.push(importedTemplate);
    addedCount += 1;
    entries.push({
      key: `${importedTemplate.id}-${index}`,
      status: "added",
      currentTemplate: null,
      nextTemplate: importedTemplate,
      changedFields: [],
    });
  });

  const changed = addedCount > 0 || updatedCount > 0;
  const summaryParts = [
    `新增 ${addedCount} 条`,
    `更新 ${updatedCount} 条`,
    `无变化 ${unchangedCount} 条`,
  ];
  if (skippedCount > 0) {
    summaryParts.push(`跳过 ${skippedCount} 条未命中的默认模板`);
  }

  return {
    nextTemplates: sortWechatSyncAnnotationTemplates(nextTemplates),
    entries,
    changed,
    addedCount,
    updatedCount,
    unchangedCount,
    skippedCount,
    message: `本次导入预览：${summaryParts.join("，")}。`,
  };
}

function findMatchingWechatSyncAnnotationTemplateIndex(
  templates: WechatSyncAnnotationTemplate[],
  importedTemplate: WechatSyncAnnotationTemplate,
) {
  return templates.findIndex((template) =>
    template.id === importedTemplate.id
      ? true
      : template.source === "custom" &&
        importedTemplate.source === "custom" &&
        normalizeWechatSyncAnnotationTemplateMatchText(template.label) ===
          normalizeWechatSyncAnnotationTemplateMatchText(
            importedTemplate.label,
          ) &&
        normalizeWechatSyncAnnotationTemplateMatchText(template.content) ===
          normalizeWechatSyncAnnotationTemplateMatchText(
            importedTemplate.content,
          ),
  );
}

function buildWechatSyncAnnotationTemplateImportMergeTarget(
  currentTemplate: WechatSyncAnnotationTemplate,
  importedTemplate: WechatSyncAnnotationTemplate,
) {
  return {
    ...currentTemplate,
    label:
      importedTemplate.source === "custom"
        ? importedTemplate.label
        : currentTemplate.label,
    content:
      importedTemplate.source === "custom"
        ? importedTemplate.content
        : currentTemplate.content,
    isPinned: importedTemplate.isPinned,
    scope: importedTemplate.scope,
  };
}

function diffWechatSyncAnnotationTemplateImportFields(
  currentTemplate: WechatSyncAnnotationTemplate,
  nextTemplate: WechatSyncAnnotationTemplate,
): WechatSyncAnnotationTemplateImportPreviewField[] {
  const changedFields: WechatSyncAnnotationTemplateImportPreviewField[] = [];
  if (currentTemplate.label !== nextTemplate.label) {
    changedFields.push("label");
  }
  if (currentTemplate.content !== nextTemplate.content) {
    changedFields.push("content");
  }
  if (currentTemplate.scope !== nextTemplate.scope) {
    changedFields.push("scope");
  }
  if (currentTemplate.isPinned !== nextTemplate.isPinned) {
    changedFields.push("isPinned");
  }
  return changedFields;
}

function normalizeWechatSyncAnnotationTemplateMatchText(value: string) {
  return value.trim().toLowerCase();
}

function formatWechatSyncAnnotationTemplateImportStatusLabel(
  status: WechatSyncAnnotationTemplateImportPreviewStatus,
) {
  switch (status) {
    case "added":
      return "将新增";
    case "updated":
      return "将更新";
    case "unchanged":
      return "无变化";
    default:
      return "将跳过";
  }
}

function resolveWechatSyncAnnotationTemplateImportStatusTone(
  status: WechatSyncAnnotationTemplateImportPreviewStatus,
) {
  switch (status) {
    case "added":
      return "healthy" as const;
    case "updated":
      return "warning" as const;
    case "unchanged":
      return "muted" as const;
    default:
      return "warning" as const;
  }
}

function formatWechatSyncAnnotationTemplateImportFieldLabel(
  field: WechatSyncAnnotationTemplateImportPreviewField,
) {
  switch (field) {
    case "label":
      return "标签";
    case "content":
      return "内容";
    case "scope":
      return "作用域";
    default:
      return "置顶状态";
  }
}

function formatWechatSyncAnnotationTemplatePinnedLabel(isPinned: boolean) {
  return isPinned ? "已置顶" : "未置顶";
}

function formatWechatSyncAnnotationTemplateImportStatusDescription(
  entry: WechatSyncAnnotationTemplateImportPreviewEntry,
) {
  switch (entry.status) {
    case "added":
      return "这条自定义模板会追加到当前模板列表。";
    case "updated":
      return `会覆盖当前模板的 ${entry.changedFields
        .map(formatWechatSyncAnnotationTemplateImportFieldLabel)
        .join("、")}。`;
    case "unchanged":
      return "当前模板已经与导入内容一致，不会产生实际更新。";
    default:
      return "这条默认模板没有命中当前列表中的默认模板，本次导入会直接跳过。";
  }
}

function parseWechatSyncAnnotationTemplateImportPayload(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("模板导入 JSON 解析失败，请检查格式。");
  }

  const record = isRecord(parsed) ? parsed : null;
  const templateEntries = record ? record.templates : parsed;
  if (!Array.isArray(templateEntries)) {
    throw new Error("模板导入 JSON 缺少 templates 数组。");
  }

  return normalizeWechatSyncAnnotationTemplateImportEntries(templateEntries);
}

function normalizeWechatSyncAnnotationTemplateImportEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry.id) || createWechatSyncAnnotationTemplateId();
      const label = readString(entry.label);
      const content = readString(entry.content);
      const source =
        entry.source === "default" || entry.source === "custom"
          ? entry.source
          : "custom";
      const isPinned = Boolean(entry.isPinned);
      const scope = normalizeWechatSyncAnnotationTemplateScope(entry.scope);
      if (!label || !content) {
        return null;
      }
      return {
        id,
        label,
        content,
        source,
        isPinned,
        scope,
      } satisfies WechatSyncAnnotationTemplate;
    })
    .filter(Boolean) as WechatSyncAnnotationTemplate[];
}

function syncWechatSyncViewStateToUrl(state: WechatSyncViewState) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  setWechatSyncQueryParam(params, "historySearch", state.historySearch || null);
  setWechatSyncQueryParam(
    params,
    "historyStatus",
    state.historyStatusFilter === "all" ? null : state.historyStatusFilter,
  );
  setWechatSyncQueryParam(
    params,
    "historyCharacter",
    state.selectedHistoryCharacterId,
  );
  setWechatSyncQueryParam(params, "auditSearch", state.auditSearch || null);
  setWechatSyncQueryParam(
    params,
    "auditMode",
    state.auditModeFilter === "all" ? null : state.auditModeFilter,
  );
  setWechatSyncQueryParam(params, "auditRecord", state.auditExpandedRecordId);
  setWechatSyncQueryParam(
    params,
    "auditVersion",
    state.linkedAuditVersion === null ? null : String(state.linkedAuditVersion),
  );
  const next = params.toString();
  const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
}

function buildWechatSyncAuditShareUrl(state: WechatSyncViewState) {
  if (typeof window === "undefined") {
    return "";
  }
  const params = new URLSearchParams();
  setWechatSyncQueryParam(params, "historySearch", state.historySearch || null);
  setWechatSyncQueryParam(
    params,
    "historyStatus",
    state.historyStatusFilter === "all" ? null : state.historyStatusFilter,
  );
  setWechatSyncQueryParam(
    params,
    "historyCharacter",
    state.selectedHistoryCharacterId,
  );
  setWechatSyncQueryParam(params, "auditSearch", state.auditSearch || null);
  setWechatSyncQueryParam(
    params,
    "auditMode",
    state.auditModeFilter === "all" ? null : state.auditModeFilter,
  );
  setWechatSyncQueryParam(params, "auditRecord", state.auditExpandedRecordId);
  setWechatSyncQueryParam(
    params,
    "auditVersion",
    state.linkedAuditVersion === null ? null : String(state.linkedAuditVersion),
  );
  const next = params.toString();
  return `${window.location.origin}${window.location.pathname}${next ? `?${next}` : ""}`;
}

function setWechatSyncQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value === null || value.trim() === "") {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

function getWechatSyncBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildImportChangeRecordKeyword(
  record: WechatImportChangeRecordLike,
  annotation = "",
) {
  return [
    record.summary,
    annotation,
    buildChangeRecordVersionPath(record),
    record.mode === "snapshot_restore" ? "历史版本恢复" : "预览重新导入",
    ...record.changedFields,
    ...(record.diffs ?? []).flatMap((diff) => [
      diff.label,
      diff.previousValue,
      diff.nextValue,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function hasWechatSyncAnnotation(value: string | null | undefined) {
  return (value?.trim().length ?? 0) > 0;
}

function matchesWechatSyncAnnotationFilter(
  value: string | null | undefined,
  filter: WechatSyncAnnotationFilter,
) {
  if (filter === "all") {
    return true;
  }
  return filter === "annotated"
    ? hasWechatSyncAnnotation(value)
    : !hasWechatSyncAnnotation(value);
}

function resolveWechatSyncSnapshotAnnotation(
  annotations: Record<string, string>,
  snapshot: WechatImportSnapshotLike,
  characterId: string | null | undefined,
) {
  return (
    annotations[
      buildWechatSyncSnapshotAnnotationKey(snapshot, characterId ?? null)
    ] ?? ""
  );
}

function formatWechatSyncAnnotationTemplateContent(
  template: WechatSyncAnnotationTemplate,
) {
  return template.content.trim() === template.label.trim()
    ? `【${template.label.trim()}】`
    : `【${template.label.trim()}】${template.content.trim()}`;
}

function appendWechatSyncAnnotationTemplate(
  currentValue: string,
  template: WechatSyncAnnotationTemplate,
) {
  const normalizedCurrent = currentValue.trim();
  const nextLine = formatWechatSyncAnnotationTemplateContent(template);
  if (!nextLine.trim()) {
    return normalizedCurrent;
  }
  if (normalizedCurrent.includes(nextLine)) {
    return normalizedCurrent;
  }
  return normalizedCurrent ? `${normalizedCurrent}\n${nextLine}` : nextLine;
}

function createWechatSyncAnnotationTemplateId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type WechatSyncAuditExportOptions = {
  recordAnnotations?: Record<string, string>;
  snapshotAnnotations?: Record<string, string>;
};

type WechatSyncAnnotationSummaryEntry =
  | {
      key: string;
      kind: "record";
      title: string;
      subtitle: string;
      meta: string;
      note: string;
      record: WechatImportChangeRecordLike;
    }
  | {
      key: string;
      kind: "snapshot";
      title: string;
      subtitle: string;
      meta: string;
      note: string;
      snapshot: WechatImportSnapshotLike;
    };

function resolveReplaySnapshotForChangeRecord(
  record: WechatImportChangeRecordLike,
  availableSnapshots: WechatImportSnapshotLike[],
) {
  if (record.resultSnapshot) {
    return record.resultSnapshot;
  }

  return (
    availableSnapshots.find(
      (snapshot) =>
        snapshot.version === record.toVersion &&
        snapshot.importedAt === record.recordedAt,
    ) ??
    availableSnapshots.find(
      (snapshot) => snapshot.version === record.toVersion,
    ) ??
    null
  );
}

function buildImportChangeDiffHeadings(record: WechatImportChangeRecordLike) {
  if (record.mode === "snapshot_restore") {
    return {
      title: "恢复前 / 恢复后完整 diff",
      previous:
        record.previousVersion && record.previousVersion > 0
          ? `恢复前 v${record.previousVersion}`
          : "恢复前为空",
      next: `恢复后 v${record.toVersion}`,
    };
  }

  return {
    title: "上一版 / 当前版完整 diff",
    previous:
      record.previousVersion && record.previousVersion > 0
        ? `上一版 v${record.previousVersion}`
        : "导入前为空",
    next: `当前版 v${record.toVersion}`,
  };
}

function downloadWechatSyncChangeExport(
  characterId: string,
  characterName: string,
  records: WechatImportChangeRecordLike[],
  availableSnapshots: WechatImportSnapshotLike[],
  options: WechatSyncAuditExportOptions = {},
) {
  const payload = {
    exportedAt: new Date().toISOString(),
    characterName,
    recordCount: records.length,
    records: records.map((record) => {
      const replaySnapshot = resolveReplaySnapshotForChangeRecord(
        record,
        availableSnapshots,
      );
      return {
        ...record,
        localAnnotation: options.recordAnnotations?.[record.id] ?? "",
        replaySnapshot,
        replaySnapshotAnnotation:
          replaySnapshot && options.snapshotAnnotations
            ? resolveWechatSyncSnapshotAnnotation(
                options.snapshotAnnotations,
                replaySnapshot,
                characterId,
              )
            : "",
      };
    }),
  };
  downloadWechatSyncAuditFile(
    `${sanitizeWechatSyncExportFileName(characterName)}-wechat-sync-audit-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function downloadWechatSyncChangeMarkdownExport(
  characterId: string,
  characterName: string,
  records: WechatImportChangeRecordLike[],
  availableSnapshots: WechatImportSnapshotLike[],
  options: WechatSyncAuditExportOptions = {},
) {
  downloadWechatSyncAuditFile(
    `${sanitizeWechatSyncExportFileName(characterName)}-wechat-sync-audit-${new Date().toISOString().slice(0, 10)}.md`,
    buildWechatSyncChangeMarkdownReport(
      characterId,
      characterName,
      records,
      availableSnapshots,
      options,
    ),
    "text/markdown;charset=utf-8",
  );
}

function buildWechatSyncChangeMarkdownReport(
  characterId: string,
  characterName: string,
  records: WechatImportChangeRecordLike[],
  availableSnapshots: WechatImportSnapshotLike[],
  options: WechatSyncAuditExportOptions = {},
) {
  const lines = [
    `# 微信同步审计报告：${characterName}`,
    "",
    `- 导出时间：${formatDateTime(new Date().toISOString())}`,
    `- 记录数量：${records.length}`,
    "",
  ];

  if (!records.length) {
    lines.push("当前没有可导出的审计记录。");
    return lines.join("\n");
  }

  records.forEach((record, index) => {
    const replaySnapshot = resolveReplaySnapshotForChangeRecord(
      record,
      availableSnapshots,
    );
    const note = options.recordAnnotations?.[record.id] ?? "";
    const replaySnapshotAnnotation =
      replaySnapshot && options.snapshotAnnotations
        ? resolveWechatSyncSnapshotAnnotation(
            options.snapshotAnnotations,
            replaySnapshot,
            characterId,
          )
        : "";
    const diffHeadings = buildImportChangeDiffHeadings(record);

    lines.push(
      `## ${index + 1}. v${record.toVersion} · ${
        record.mode === "snapshot_restore" ? "历史版本恢复" : "预览重新导入"
      }`,
      "",
      `- 记录时间：${formatDateTime(record.recordedAt)}`,
      `- 版本轨迹：${buildChangeRecordVersionPath(record)}`,
      `- 摘要：${record.summary}`,
      `- 可回放：${replaySnapshot ? "是" : "否"}`,
    );

    if (replaySnapshot) {
      lines.push(
        `- 回放快照：v${replaySnapshot.version} · ${formatDateTime(
          replaySnapshot.importedAt,
        )}`,
      );
    }

    if (hasWechatSyncAnnotation(note)) {
      lines.push(`- 本地批注：${note}`);
    }
    if (hasWechatSyncAnnotation(replaySnapshotAnnotation)) {
      lines.push(`- 回放快照批注：${replaySnapshotAnnotation}`);
    }

    lines.push("");

    if (record.changedFields.length) {
      lines.push("### 变更字段", "");
      record.changedFields.forEach((field) => {
        lines.push(`- ${field}`);
      });
      lines.push("");
    }

    if (record.diffs?.length) {
      lines.push(`### ${diffHeadings.title}`, "");
      lines.push(
        `| 字段 | ${diffHeadings.previous} | ${diffHeadings.next} | 状态 |`,
      );
      lines.push("| --- | --- | --- | --- |");
      record.diffs.forEach((diff) => {
        lines.push(
          `| ${escapeMarkdownTableCell(diff.label)} | ${escapeMarkdownTableCell(
            diff.previousValue,
          )} | ${escapeMarkdownTableCell(
            diff.nextValue,
          )} | ${diff.changed ? "有变化" : "一致"} |`,
        );
      });
      lines.push("");
    } else {
      lines.push(
        "### 完整 diff",
        "",
        "这条旧记录创建时系统还未持久化字段级 diff。",
        "",
      );
    }
  });

  return lines.join("\n");
}

function buildWechatSyncAnnotationSummaryEntries(
  characterId: string,
  records: WechatImportChangeRecordLike[],
  snapshots: WechatImportSnapshotLike[],
  recordAnnotations: Record<string, string>,
  snapshotAnnotations: Record<string, string>,
) {
  const recordEntries: Array<
    WechatSyncAnnotationSummaryEntry & { recordedAtValue: string }
  > = records
    .map((record) => {
      const note = recordAnnotations[record.id] ?? "";
      if (!hasWechatSyncAnnotation(note)) {
        return null;
      }
      return {
        key: `record:${record.id}`,
        kind: "record" as const,
        title: `v${record.toVersion} · ${
          record.mode === "snapshot_restore" ? "历史版本恢复" : "预览重新导入"
        }`,
        subtitle: `版本轨迹：${buildChangeRecordVersionPath(record)}`,
        meta: `记录时间：${formatDateTime(record.recordedAt)} · 摘要：${record.summary}`,
        note,
        record,
        recordedAtValue: record.recordedAt,
      };
    })
    .filter(Boolean) as Array<
    WechatSyncAnnotationSummaryEntry & { recordedAtValue: string }
  >;

  const snapshotEntries: Array<
    WechatSyncAnnotationSummaryEntry & { recordedAtValue: string }
  > = snapshots
    .map((snapshot) => {
      const note = resolveWechatSyncSnapshotAnnotation(
        snapshotAnnotations,
        snapshot,
        characterId,
      );
      if (!hasWechatSyncAnnotation(note)) {
        return null;
      }
      return {
        key: `snapshot:${snapshot.version}:${snapshot.importedAt}`,
        kind: "snapshot" as const,
        title: `v${snapshot.version} · 版本批注`,
        subtitle: `关系：${snapshot.draftCharacter.relationship || "暂无"} · 角色名：${
          snapshot.draftCharacter.name || snapshot.contact.displayName
        }`,
        meta: `导入时间：${formatDateTime(snapshot.importedAt)} · 朋友圈种子：${snapshot.seededMomentCount} 条`,
        note,
        snapshot,
        recordedAtValue: snapshot.importedAt,
      };
    })
    .filter(Boolean) as Array<
    WechatSyncAnnotationSummaryEntry & { recordedAtValue: string }
  >;

  return [...recordEntries, ...snapshotEntries]
    .sort(
      (left, right) =>
        Date.parse(right.recordedAtValue) - Date.parse(left.recordedAtValue),
    )
    .map((entry) => {
      const { recordedAtValue, ...rest } = entry;
      void recordedAtValue;
      return rest;
    });
}

function buildWechatSyncAnnotationSummaryKeyword(
  entry: WechatSyncAnnotationSummaryEntry,
) {
  return [entry.title, entry.subtitle, entry.meta, entry.note]
    .join(" ")
    .toLowerCase();
}

function downloadWechatSyncSnapshotNotesMarkdownExport(
  characterName: string,
  snapshots: WechatImportSnapshotLike[],
  annotations: Record<string, string>,
  characterId: string | null | undefined,
) {
  downloadWechatSyncAuditFile(
    `${sanitizeWechatSyncExportFileName(characterName)}-wechat-sync-snapshot-notes-${new Date().toISOString().slice(0, 10)}.md`,
    buildWechatSyncSnapshotNotesMarkdownReport(
      characterName,
      snapshots,
      annotations,
      characterId,
    ),
    "text/markdown;charset=utf-8",
  );
}

function buildWechatSyncSnapshotNotesMarkdownReport(
  characterName: string,
  snapshots: WechatImportSnapshotLike[],
  annotations: Record<string, string>,
  characterId: string | null | undefined,
) {
  const lines = [
    `# 微信同步版本批注报告：${characterName}`,
    "",
    `- 导出时间：${formatDateTime(new Date().toISOString())}`,
    `- 版本数量：${snapshots.length}`,
    "",
  ];

  if (!snapshots.length) {
    lines.push("当前没有可导出的版本卡。");
    return lines.join("\n");
  }

  snapshots.forEach((snapshot, index) => {
    const note = resolveWechatSyncSnapshotAnnotation(
      annotations,
      snapshot,
      characterId,
    );
    lines.push(
      `## ${index + 1}. v${snapshot.version}`,
      "",
      `- 导入时间：${formatDateTime(snapshot.importedAt)}`,
      `- 角色名：${
        snapshot.draftCharacter.name || snapshot.contact.displayName
      }`,
      `- 关系：${snapshot.draftCharacter.relationship || "暂无"}`,
      `- 标签：${
        snapshot.contact.tags.length ? snapshot.contact.tags.join("、") : "暂无"
      }`,
      `- 朋友圈种子：${snapshot.seededMomentCount} 条`,
      `- 本地批注：${note || "暂无"}`,
      "",
    );
  });

  return lines.join("\n");
}

function downloadWechatSyncAnnotationSummaryMarkdownExport(
  characterName: string,
  entries: WechatSyncAnnotationSummaryEntry[],
) {
  downloadWechatSyncAuditFile(
    `${sanitizeWechatSyncExportFileName(characterName)}-wechat-sync-annotation-summary-${new Date().toISOString().slice(0, 10)}.md`,
    buildWechatSyncAnnotationSummaryMarkdownReport(characterName, entries),
    "text/markdown;charset=utf-8",
  );
}

function buildWechatSyncAnnotationSummaryMarkdownReport(
  characterName: string,
  entries: WechatSyncAnnotationSummaryEntry[],
) {
  const lines = [
    `# 微信同步批注汇总：${characterName}`,
    "",
    `- 导出时间：${formatDateTime(new Date().toISOString())}`,
    `- 批注数量：${entries.length}`,
    "",
  ];

  if (!entries.length) {
    lines.push("当前没有可导出的本地批注。");
    return lines.join("\n");
  }

  entries.forEach((entry, index) => {
    lines.push(
      `## ${index + 1}. ${entry.title}`,
      "",
      `- 类型：${entry.kind === "record" ? "记录批注" : "版本批注"}`,
      `- 摘要：${entry.subtitle}`,
      `- 元信息：${entry.meta}`,
      "",
      "### 批注内容",
      "",
      entry.note,
      "",
    );
  });

  return lines.join("\n");
}

function downloadWechatSyncAuditFile(
  fileName: string,
  content: string,
  contentType: string,
) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function copyWechatSyncAuditText(content: string, promptLabel: string) {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(content);
    return true;
  }
  window.prompt(promptLabel, content);
  return true;
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br />");
}

function sanitizeWechatSyncExportFileName(value: string) {
  const normalized = value.trim().replace(/\s+/g, "-");
  const safe = normalized.replace(/[^a-zA-Z0-9\-_一-龥]+/g, "-");
  return safe || "wechat-sync-character";
}

function buildContactBundleFromImportSnapshot(
  snapshot: WechatImportSnapshotLike,
): WechatSyncContactBundle {
  return {
    username: snapshot.contact.username,
    displayName: snapshot.contact.displayName,
    nickname: snapshot.contact.nickname ?? null,
    remarkName: snapshot.contact.remarkName ?? null,
    region: snapshot.contact.region ?? null,
    source: snapshot.contact.source ?? null,
    tags: [...snapshot.contact.tags],
    isGroup: snapshot.contact.isGroup,
    messageCount: snapshot.contact.messageCount,
    ownerMessageCount: snapshot.contact.ownerMessageCount,
    contactMessageCount: snapshot.contact.contactMessageCount,
    latestMessageAt: snapshot.contact.latestMessageAt ?? null,
    chatSummary: snapshot.contact.chatSummary ?? null,
    topicKeywords: [...snapshot.contact.topicKeywords],
    sampleMessages: snapshot.contact.sampleMessages.map((item) => ({
      timestamp: item.timestamp,
      text: item.text,
      sender: item.sender ?? null,
      typeLabel: item.typeLabel ?? null,
      direction: item.direction ?? "unknown",
    })),
    momentHighlights: snapshot.contact.momentHighlights.map((item) => ({
      postedAt: item.postedAt ?? null,
      text: item.text,
      location: item.location ?? null,
      mediaHint: item.mediaHint ?? null,
    })),
  };
}

function buildPreviewItemFromImportSnapshot(
  snapshot: WechatImportSnapshotLike,
): WechatSyncPreviewItem {
  const contact = buildContactBundleFromImportSnapshot(snapshot);
  const name =
    snapshot.draftCharacter.name.trim() ||
    contact.remarkName?.trim() ||
    contact.nickname?.trim() ||
    contact.displayName;
  const relationship =
    snapshot.draftCharacter.relationship.trim() ||
    `${name} 是你现实微信里的熟人朋友，你们已经有真实聊天记录。`;
  const bio =
    snapshot.draftCharacter.bio.trim() ||
    contact.chatSummary?.trim() ||
    `${name} 是从微信导入快照恢复的熟人朋友。`;
  const expertDomains =
    snapshot.draftCharacter.expertDomains.length > 0
      ? [...snapshot.draftCharacter.expertDomains]
      : inferContactDomains(contact);
  const memorySummary =
    snapshot.draftCharacter.memorySummary.trim() ||
    contact.chatSummary?.trim() ||
    `${name} 和你保持着稳定的微信联系，彼此已经有明确的熟人语境。`;

  return {
    contact,
    confidence: "high",
    warnings: [`已从导入快照 v${snapshot.version} 恢复，可直接再导入。`],
    draftCharacter: {
      name,
      relationship,
      bio,
      sourceType: "wechat_import",
      sourceKey: buildWechatSourceKey(contact.username),
      expertDomains,
      profile: {
        characterId: "",
        name,
        relationship,
        expertDomains,
        traits: {
          speechPatterns: [],
          catchphrases: [],
          topicsOfInterest: [...contact.topicKeywords],
          emotionalTone: "grounded",
          responseLength: "medium",
          emojiUsage: "occasional",
        },
        memorySummary,
      },
    },
  };
}

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

  return (
    previewItems.find(
      (previewItem) =>
        previewItem.draftCharacter.sourceKey === item.character.sourceKey,
    ) ?? null
  );
}

function buildHistoryPreviewDiffs(
  item: WechatSyncHistoryItem,
  previewItem: WechatSyncPreviewItem,
) {
  return [
    createHistoryPreviewDiff(
      "角色名",
      item.character.name,
      previewItem.draftCharacter.name?.trim() ||
        previewItem.contact.displayName,
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
  return buildHistoryPreviewDiffs(item, previewItem).some(
    (diff) => diff.changed,
  );
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

function buildHistorySnapshotDiffs(
  item: WechatSyncHistoryItem,
  snapshot: WechatImportSnapshotLike,
) {
  return [
    createHistoryPreviewDiff(
      "角色名",
      item.character.name,
      snapshot.draftCharacter.name || snapshot.contact.displayName,
    ),
    createHistoryPreviewDiff(
      "关系定位",
      item.character.relationship,
      snapshot.draftCharacter.relationship || "暂无",
    ),
    createHistoryPreviewDiff(
      "角色简介",
      item.character.bio,
      snapshot.draftCharacter.bio || "暂无",
    ),
    createHistoryPreviewDiff(
      "领域标签",
      item.character.expertDomains.join("、"),
      snapshot.draftCharacter.expertDomains.join("、"),
    ),
    createHistoryPreviewDiff(
      "记忆摘要",
      item.character.profile?.memorySummary || "暂无",
      snapshot.draftCharacter.memorySummary || "暂无",
    ),
    createHistoryPreviewDiff(
      "微信备注/显示名",
      item.remarkName?.trim() || item.character.name,
      snapshot.contact.remarkName?.trim() ||
        snapshot.contact.nickname?.trim() ||
        snapshot.contact.displayName,
    ),
    createHistoryPreviewDiff(
      "地区",
      item.region?.trim() || "暂无",
      snapshot.contact.region?.trim() || "暂无",
    ),
    createHistoryPreviewDiff(
      "联系人标签",
      item.tags.join("、"),
      snapshot.contact.tags.join("、"),
    ),
    createHistoryPreviewDiff(
      "聊天摘要",
      item.character.profile?.wechatSyncImport?.currentSnapshot?.contact
        .chatSummary || "暂无",
      snapshot.contact.chatSummary || "暂无",
    ),
  ];
}

function summarizeChangedDiffs(diffs: HistoryDiffCardValue[]) {
  if (!diffs.length) {
    return "和当前线上角色一致，无需恢复。";
  }

  const labels = diffs.map((diff) => diff.label);
  if (labels.length <= 3) {
    return labels.join("、");
  }
  return `${labels.slice(0, 3).join("、")}，另 ${labels.length - 3} 项`;
}

function buildSnapshotMutationKey(
  characterId: string,
  snapshot?: WechatImportSnapshotLike | null,
) {
  if (!snapshot) {
    return characterId;
  }
  return `${characterId}:${snapshot.version}:${snapshot.importedAt}`;
}

function buildWechatSyncSnapshotAnnotationKey(
  snapshot: WechatImportSnapshotLike,
  characterId: string | null,
) {
  return buildSnapshotMutationKey(characterId ?? "rollback-guide", snapshot);
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
    item.draftCharacter.expertDomains?.filter(
      (entry) => entry.trim().length > 0,
    ) ?? [];
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
  const expertDomains = draft.expertDomains?.filter(
    (entry) => entry.trim().length > 0,
  ).length
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
          expertDomains: profile.expertDomains?.filter(
            (entry) => entry.trim().length > 0,
          ).length
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
  return inferred.length
    ? Array.from(new Set(inferred)).slice(0, 6)
    : ["general"];
}
