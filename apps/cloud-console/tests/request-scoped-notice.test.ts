import { describe, expect, it, vi } from "vitest";
import {
  createBooleanOutcomeNotice,
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../src/lib/request-scoped-notice";

describe("request scoped notice", () => {
  it("normalizes request ids when showing notices", () => {
    const showNotice = vi.fn();

    showRequestScopedNotice(
      showNotice,
      createRequestScopedNotice("Saved.", "success"),
    );
    showRequestScopedNotice(
      showNotice,
      createRequestScopedNotice("Updated.", "warning", "req-123"),
    );

    expect(showNotice).toHaveBeenNthCalledWith(1, "Saved.", "success", {
      requestId: null,
    });
    expect(showNotice).toHaveBeenNthCalledWith(2, "Updated.", "warning", {
      requestId: "req-123",
    });
  });

  it("builds boolean outcome notices with stable success and failure tones", () => {
    expect(
      createBooleanOutcomeNotice({
        requestId: "req-1",
        succeeded: true,
        successMessage: "Downloaded.",
        failureMessage: "Download failed.",
      }),
    ).toEqual({
      message: "Downloaded.",
      tone: "success",
      requestId: "req-1",
    });

    expect(
      createBooleanOutcomeNotice({
        succeeded: false,
        successMessage: "Downloaded.",
        failureMessage: "Download failed.",
      }),
    ).toEqual({
      message: "Download failed.",
      tone: "warning",
      requestId: undefined,
    });
  });
});
