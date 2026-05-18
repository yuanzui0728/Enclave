import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmCropId, FarmEventView } from "@yinjie/contracts";
import { FARM_CROP_CATALOG } from "@yinjie/contracts";
import { useFarmEvents } from "../use-farm-state";

const t = translateRuntimeMessage;

interface EventLogPanelProps {
  limit?: number;
}

export function EventLogPanel({ limit = 20 }: EventLogPanelProps) {
  const eventsQuery = useFarmEvents({ limit });

  return (
    <section className="rounded-2xl border border-white/60 bg-white/75 p-3 shadow-md backdrop-blur-md">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-stone-700">{t(msg`事件流`)}</h2>
        <span className="text-[11px] text-stone-400">
          {eventsQuery.data?.length ?? 0} {t(msg`条`)}
        </span>
      </header>
      {eventsQuery.isLoading && (
        <p className="py-4 text-center text-xs text-stone-400">{t(msg`加载中……`)}</p>
      )}
      {eventsQuery.error && (
        <p className="py-4 text-center text-xs text-rose-600">
          {t(msg`事件流加载失败：`)}{(eventsQuery.error as Error).message}
        </p>
      )}
      {eventsQuery.data && eventsQuery.data.length === 0 && (
        <p className="py-4 text-center text-xs text-stone-400">
          {t(msg`世界还没有动静。`)}
        </p>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto text-[11px] text-stone-500">
        {eventsQuery.data?.map((event) => (
          <li
            key={event.id}
            className="flex items-baseline gap-2 rounded-md bg-stone-50 px-2 py-1"
          >
            <span className="shrink-0 text-stone-400">
              {new Date(event.createdAt).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="flex-1">{summarize(event)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summarize(event: FarmEventView): string {
  const cropName = event.cropId
    ? FARM_CROP_CATALOG[event.cropId as FarmCropId]?.nameZh ?? event.cropId
    : "";
  const target = event.targetType === "owner" ? t(msg`你`) : "";
  switch (event.kind) {
    case "plant":
      return `${event.actorName} ${t(msg`种了`)} ${cropName}`;
    case "harvest":
      return `${event.actorName} ${t(msg`收了一茬`)}${cropName ? "（" + cropName + "）" : ""}`;
    case "steal":
      return target
        ? `${event.actorName} ${t(msg`顺走了你家的`)} ${cropName}`
        : `${event.actorName} ${t(msg`顺走了`)} ${cropName}`;
    case "water":
      return `${event.actorName} ${t(msg`浇了水`)}`;
    case "weed":
      return `${event.actorName} ${t(msg`除了草`)}`;
    case "debug":
      return `${event.actorName} ${t(msg`除了虫`)}`;
    case "buy":
      return `${event.actorName} ${t(msg`买了种子`)}`;
    case "sell":
      return `${event.actorName} ${t(msg`卖了`)} ${cropName || t(msg`作物`)}`;
    case "level_up":
      return `${event.actorName} ${t(msg`升到 Lv.`)}${(event.payload?.level as number) ?? "?"}`;
    case "incident_broadcast":
      return `${event.actorName} ${t(msg`的小道消息已派发`)}`;
    case "intimacy_change":
      return `${event.actorName} ${t(msg`与对方好感度变化`)} ${event.intimacyDelta ?? ""}`;
    case "fertilize":
      return `${event.actorName} ${t(msg`施了肥`)}${cropName ? "（" + cropName + "）" : ""}`;
    case "pesticide":
      return `${event.actorName} ${t(msg`喷了农药`)}${cropName ? "（" + cropName + "）" : ""}`;
    case "uproot":
      return `${event.actorName} ${t(msg`铲掉了`)} ${cropName || t(msg`作物`)}`;
    case "dog_buy":
      return `${event.actorName} ${t(msg`买了一条看家狗`)}`;
    case "dog_upgrade":
      return `${event.actorName} ${t(msg`升级了看家狗 Lv.`)}${(event.payload?.level as number) ?? "?"}`;
    case "dog_feed":
      return `${event.actorName} ${t(msg`喂了狗`)}`;
    case "decorate":
      return `${event.actorName} ${t(msg`摆了一件装饰`)}`;
    default:
      return `${event.actorName} ${event.kind}`;
  }
}
