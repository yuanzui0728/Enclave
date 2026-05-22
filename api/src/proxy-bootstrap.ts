// 必须最早 import：在任何 fetch / OpenAI client 初始化之前把 undici 的全局 dispatcher
// 挂上 ProxyAgent。否则 Node 24 的原生 fetch 不读 HTTPS_PROXY env var，
// 走不上本机 v2ray/clash 出墙代理，会撞 GFW（n1n.ai / openai.com / 大量 LLM 网关）。
//
// 触发条件：HTTPS_PROXY env var 存在。生产 / 不需要代理的环境 env 不设即 no-op。
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

if (proxyUrl?.trim()) {
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl.trim()));
    // eslint-disable-next-line no-console
    console.log(
      `[proxy-bootstrap] undici global dispatcher → ${proxyUrl.trim()}`,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[proxy-bootstrap] failed to wire ProxyAgent: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
