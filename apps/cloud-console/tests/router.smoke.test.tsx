import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { installCloudAdminApiMock, renderRoute } from "./test-helpers";

describe("cloud-console router smoke", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    installCloudAdminApiMock();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the dashboard route", async () => {
    renderRoute("/");

    expect(await screen.findByText("Fleet Dashboard")).toBeTruthy();
    expect(await screen.findByText("Attention Queue")).toBeTruthy();
    expect(await screen.findByText("Ready worlds")).toBeTruthy();
    expect(
      (await screen.findByRole("link", { name: "Requests" })).getAttribute(
        "href",
      ),
    ).toBe("/requests");
    expect(
      (await screen.findByRole("link", { name: "Worlds" })).getAttribute(
        "href",
      ),
    ).toBe("/worlds");
    expect((await screen.findByRole("link", { name: "Jobs" })).getAttribute("href")).toBe(
      "/jobs",
    );
    expect(
      (await screen.findByRole("link", { name: "Sessions" })).getAttribute(
        "href",
      ),
    ).toBe("/sessions");
    expect(
      (await screen.findByRole("link", { name: "Waiting Sync" })).getAttribute(
        "href",
      ),
    ).toBe("/waiting-sync");
  });

  it("renders the cloud console default locale in Simplified Chinese", async () => {
    renderRoute("/", { locale: null });

    expect(await screen.findByText("舰队仪表盘")).toBeTruthy();
    expect(await screen.findByText("关注队列")).toBeTruthy();
    expect(await screen.findByText("就绪世界")).toBeTruthy();
    expect(
      (await screen.findByRole("link", { name: "申请" })).getAttribute("href"),
    ).toBe("/requests");
  });

  it("switches cloud console copy across English, Japanese, and Korean", async () => {
    renderRoute("/", { locale: "zh-CN" });

    expect(await screen.findByText("舰队仪表盘")).toBeTruthy();

    const languageSelect = await screen.findByLabelText("界面语言");

    fireEvent.change(languageSelect, { target: { value: "en-US" } });
    expect(await screen.findByText("Fleet Dashboard")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Requests" })).toBeTruthy();

    fireEvent.change(languageSelect, { target: { value: "ja-JP" } });
    expect(await screen.findByText("フリートダッシュボード")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "申請" })).toBeTruthy();

    fireEvent.change(languageSelect, { target: { value: "ko-KR" } });
    expect(await screen.findByText("플릿 대시보드")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "요청" })).toBeTruthy();
  });

  it("uses the persisted cloud console locale preference", async () => {
    renderRoute("/", { locale: "ko-KR" });

    expect(await screen.findByText("플릿 대시보드")).toBeTruthy();
    expect(await screen.findByText("관심 큐")).toBeTruthy();
  });

  it("navigates through compact request and world nav links", async () => {
    renderRoute("/");

    fireEvent.click(await screen.findByRole("link", { name: "Requests" }));
    expect(await screen.findByText("World requests")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Worlds" }));
    expect(await screen.findByText("Managed worlds")).toBeTruthy();
  });

  it("renders the requests route", async () => {
    renderRoute("/requests");

    expect(await screen.findByText("World requests")).toBeTruthy();
    expect(await screen.findByText("Mock Request World")).toBeTruthy();
  });

  it("renders the request detail route", async () => {
    renderRoute("/requests/request-1");

    expect(await screen.findByText("Request guidance")).toBeTruthy();
    expect(await screen.findAllByText("Mock Request World")).toBeTruthy();
  });

  it("renders the worlds route", async () => {
    renderRoute("/worlds");

    expect(await screen.findByText("Managed worlds")).toBeTruthy();
    expect(await screen.findAllByText("Mock World")).toBeTruthy();
  });

  it("renders the world detail route", async () => {
    renderRoute("/worlds/world-1");

    expect(await screen.findByText("Lifecycle summary")).toBeTruthy();
    expect(await screen.findAllByText("Mock World")).toBeTruthy();
    expect(await screen.findByText("Bootstrap package")).toBeTruthy();
  });

  it("renders the jobs route", async () => {
    renderRoute("/jobs");

    expect(await screen.findByText("Lifecycle jobs")).toBeTruthy();
    expect(await screen.findByText("resumed")).toBeTruthy();
  });

  it("renders the admin sessions route", async () => {
    renderRoute("/sessions");

    expect(await screen.findByText("Admin sessions")).toBeTruthy();
    expect(await screen.findByText("Current")).toBeTruthy();
    expect(
      (
        await screen.findByRole("link", { name: "Open sessions permalink" })
      ).getAttribute("href"),
    ).toBe("/sessions");
  });

  it("renders the waiting session sync route", async () => {
    renderRoute("/waiting-sync");

    expect(await screen.findByText("Waiting session sync")).toBeTruthy();
    expect(await screen.findByText("Batch actions")).toBeTruthy();
  });
});
