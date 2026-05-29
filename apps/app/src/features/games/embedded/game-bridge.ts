// embedded_web 游戏 ↔ 宿主 的 postMessage 桥协议 + 注入 iframe 的 in-game SDK。
//
// 安全模型：游戏跑在 sandbox="allow-scripts"（无 allow-same-origin → opaque
// origin）的 iframe 里，CSP connect-src 'none' 封死网络。游戏唯一对外通道就是
// window.YinjieGame（本文件注入的 SDK），它通过 postMessage 请求宿主代办 AI
// 回合 / 列角色 / 上报分数。宿主校验 event.source === iframe.contentWindow
// （opaque origin 下 origin 为 "null"，只能靠 source 身份校验）。

export const BRIDGE_FLAG = "__yinjieGameBridge";
export const BRIDGE_VERSION = 1;

export type GameToHostType =
  | "READY"
  | "LIST_CHARACTERS"
  | "AI_TURN"
  | "REPORT_SCORE"
  | "REQUEST_EXIT";

export type HostToGameType =
  | "INIT"
  | "CHARACTERS"
  | "AI_TURN_RESULT"
  | "AI_TURN_ERROR"
  | "SCORE_ACK"
  | "ERROR";

export interface BridgeEnvelope {
  [BRIDGE_FLAG]: true;
  v: number;
  id: string;
  type: GameToHostType | HostToGameType;
  payload: unknown;
}

export function isBridgeEnvelope(data: unknown): data is BridgeEnvelope {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>)[BRIDGE_FLAG] === true &&
    (data as Record<string, unknown>).v === BRIDGE_VERSION &&
    typeof (data as Record<string, unknown>).type === "string" &&
    typeof (data as Record<string, unknown>).id === "string"
  );
}

// 内联 CSP：default 全关，仅放行内联 script/style + data/blob 资源，connect-src none。
export const GAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; " +
  "base-uri 'none'; form-action 'none'";

// 注入到 iframe 的 window.YinjieGame SDK（与 wiki 预览的 mock 签名一致，但走真桥）。
export const IN_GAME_SDK_SCRIPT = `
<script>
(function(){
  var pending = {};
  var seq = 0;
  var FLAG = ${JSON.stringify(BRIDGE_FLAG)};
  var V = ${BRIDGE_VERSION};
  function send(type, payload){
    var id = "g" + (++seq) + "_" + Date.now();
    var p = new Promise(function(resolve, reject){ pending[id] = { resolve: resolve, reject: reject }; });
    var msg = {}; msg[FLAG]=true; msg.v=V; msg.id=id; msg.type=type; msg.payload=payload||{};
    parent.postMessage(msg, "*");
    return { id: id, promise: p };
  }
  function fire(type, payload){
    var msg = {}; msg[FLAG]=true; msg.v=V; msg.id="evt_"+(++seq); msg.type=type; msg.payload=payload||{};
    parent.postMessage(msg, "*");
  }
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || d[FLAG] !== true || d.v !== V) return;
    var entry = pending[d.id];
    if(!entry) return;
    delete pending[d.id];
    if(d.type === "AI_TURN_ERROR" || d.type === "ERROR"){ entry.reject(d.payload || {}); }
    else { entry.resolve(d.payload); }
  });
  var initResolvers = [];
  var initData = null;
  window.addEventListener("message", function(e){
    var d = e.data;
    if(!d || d[FLAG] !== true || d.type !== "INIT") return;
    initData = d.payload;
    initResolvers.splice(0).forEach(function(r){ r(initData); });
  });
  window.YinjieGame = {
    version: V,
    ready: function(){
      fire("READY", {});
      if(initData) return Promise.resolve(initData);
      return new Promise(function(resolve){ initResolvers.push(resolve); });
    },
    listCharacters: function(){ return send("LIST_CHARACTERS", {}).promise; },
    askCharacter: function(opts){ return send("AI_TURN", opts||{}).promise; },
    reportScore: function(score, detail){ fire("REPORT_SCORE", { score: score, detail: detail||null }); },
    reportState: function(phase, meta){ fire("REPORT_STATE", { phase: phase, meta: meta||null }); },
    exit: function(){ fire("REQUEST_EXIT", {}); }
  };
})();
</script>
`.trim();

/** 合成最终 srcdoc：CSP meta + SDK + 游戏 HTML（尽量早注入，保证 SDK 先于游戏脚本就绪）。 */
export function buildGameSrcDoc(html: string): string {
  const inject = `<meta http-equiv="Content-Security-Policy" content="${GAME_CSP}">\n${IN_GAME_SDK_SCRIPT}`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = (headMatch.index ?? 0) + headMatch[0].length;
    return html.slice(0, idx) + "\n" + inject + html.slice(idx);
  }
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const idx = (htmlMatch.index ?? 0) + htmlMatch[0].length;
    return html.slice(0, idx) + `<head>${inject}</head>` + html.slice(idx);
  }
  return `<!doctype html><html><head>${inject}</head><body>${html}</body></html>`;
}

export function postToGame(
  frame: Window,
  id: string,
  type: HostToGameType,
  payload: unknown,
): void {
  const msg: BridgeEnvelope = {
    [BRIDGE_FLAG]: true,
    v: BRIDGE_VERSION,
    id,
    type,
    payload,
  };
  frame.postMessage(msg, "*");
}
