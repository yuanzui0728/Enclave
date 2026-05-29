import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@yinjie/contracts";

// 把会触发真实副作用的依赖换成 spy；clearCloudRuntimeSession 的 mock 仍真正清掉
// 会话 store 的 token，这样才能验证「同帧并发 401」的幂等短路。
const clearCloudRuntimeSession = vi.fn();
const disconnectChatSocket = vi.fn();
const triggerLoginRedirect = vi.fn();

vi.mock("../src/lib/cloud-session", () => ({
  clearCloudRuntimeSession: () => clearCloudRuntimeSession(),
}));
vi.mock("../src/lib/socket", () => ({
  disconnectChatSocket: () => disconnectChatSocket(),
}));
vi.mock("../src/lib/login-redirect", () => ({
  triggerLoginRedirect: () => triggerLoginRedirect(),
}));

const {
  handleApiCloudAuthExpiredError,
  isCloudAuthExpiredError,
} = await import("../src/lib/cloud-auth-expired");
const { useCloudSessionStore } = await import(
  "../src/store/cloud-session-store"
);

function setLoggedIn() {
  useCloudSessionStore.getState().setSession({
    accessToken: "live-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    phone: "10000000000",
    email: null,
    profile: null,
  });
}

beforeEach(() => {
  clearCloudRuntimeSession.mockReset();
  disconnectChatSocket.mockReset();
  triggerLoginRedirect.mockReset();
  // mock 的清会话仍真正清 token，驱动幂等短路。
  clearCloudRuntimeSession.mockImplementation(() => {
    useCloudSessionStore.getState().clearSession();
  });
  useCloudSessionStore.getState().clearSession();
  window.history.pushState({}, "", "/tabs/chat");
});

afterEach(() => {
  useCloudSessionStore.getState().clearSession();
});

describe("isCloudAuthExpiredError", () => {
  it("命中 401 鉴权哨兵 message", () => {
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("Invalid or expired cloud access token.", {
          statusCode: 401,
        }),
      ),
    ).toBe(true);
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("Missing cloud access token.", { statusCode: 401 }),
      ),
    ).toBe(true);
  });

  it("命中 403 账号封禁/注销", () => {
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("This cloud account has been banned.", {
          statusCode: 403,
        }),
      ),
    ).toBe(true);
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("This cloud account has been archived.", {
          statusCode: 403,
        }),
      ),
    ).toBe(true);
  });

  it("不误杀业务 401 / status 与 message 错配 / 非 ApiRequestError", () => {
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("Conversation x not found", { statusCode: 401 }),
      ),
    ).toBe(false);
    // 401 的 message 出现在 403 上不算（反之亦然）。
    expect(
      isCloudAuthExpiredError(
        new ApiRequestError("Invalid or expired cloud access token.", {
          statusCode: 403,
        }),
      ),
    ).toBe(false);
    expect(isCloudAuthExpiredError(new Error("boom"))).toBe(false);
    expect(isCloudAuthExpiredError("nope")).toBe(false);
  });
});

describe("handleApiCloudAuthExpiredError", () => {
  it("鉴权失效 → 断 socket + 清会话 + 跳登录，且并发幂等只跑一次", () => {
    setLoggedIn();
    const err = new ApiRequestError("Invalid or expired cloud access token.", {
      statusCode: 401,
    });

    handleApiCloudAuthExpiredError(err);
    handleApiCloudAuthExpiredError(err); // 同帧第二个并发 fire，token 已清

    expect(disconnectChatSocket).toHaveBeenCalledTimes(1);
    expect(clearCloudRuntimeSession).toHaveBeenCalledTimes(1);
    expect(triggerLoginRedirect).toHaveBeenCalledTimes(1);
    expect(useCloudSessionStore.getState().accessToken).toBeNull();
  });

  it("非鉴权失效错误不触发任何副作用", () => {
    setLoggedIn();
    handleApiCloudAuthExpiredError(
      new ApiRequestError("Conversation x not found", { statusCode: 401 }),
    );
    expect(triggerLoginRedirect).not.toHaveBeenCalled();
    expect(clearCloudRuntimeSession).not.toHaveBeenCalled();
  });

  it("未登录（无 token）时不误跳转", () => {
    handleApiCloudAuthExpiredError(
      new ApiRequestError("Missing cloud access token.", { statusCode: 401 }),
    );
    expect(triggerLoginRedirect).not.toHaveBeenCalled();
  });

  it("已在 /welcome 时不打断登录流程", () => {
    setLoggedIn();
    window.history.pushState({}, "", "/welcome");
    handleApiCloudAuthExpiredError(
      new ApiRequestError("Invalid or expired cloud access token.", {
        statusCode: 401,
      }),
    );
    expect(triggerLoginRedirect).not.toHaveBeenCalled();
    expect(clearCloudRuntimeSession).not.toHaveBeenCalled();
  });
});
