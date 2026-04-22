import { describe, expect, it, vi } from "vitest";
import {
  createAdminSessionArtifactDownloadNotice,
  createAdminSessionDownloadNotice,
  withDownloadedJsonFile,
  withDownloadedTextFile,
} from "../src/lib/admin-session-download";
import { downloadJsonFile, downloadTextFile } from "../src/lib/download";

vi.mock("../src/lib/download", () => ({
  downloadJsonFile: vi.fn(),
  downloadTextFile: vi.fn(),
}));

describe("admin session download helpers", () => {
  it("creates request-scoped notices for success and browser download fallback states", () => {
    expect(
      createAdminSessionDownloadNotice({
        requestId: "req-download",
        downloaded: true,
        successMessage: "Downloaded snapshot.",
        failureMessage: "Snapshot is ready, but download failed.",
      }),
    ).toEqual({
      message: "Downloaded snapshot.",
      tone: "success",
      requestId: "req-download",
    });

    expect(
      createAdminSessionDownloadNotice({
        downloaded: false,
        successMessage: "Downloaded snapshot.",
        failureMessage: "Snapshot is ready, but download failed.",
      }),
    ).toEqual({
      message: "Snapshot is ready, but download failed.",
      tone: "warning",
      requestId: undefined,
    });
  });

  it("builds preset artifact download notices for shared admin-session copy", () => {
    expect(
      createAdminSessionArtifactDownloadNotice({
        kind: "admin-session-audit-snapshot",
        requestId: "req-audit",
        downloaded: true,
        totalSessions: 2,
      }),
    ).toEqual({
      message: "Downloaded admin session audit snapshot for 2 session(s).",
      tone: "success",
      requestId: "req-audit",
    });

    expect(
      createAdminSessionArtifactDownloadNotice({
        kind: "risk-snapshot",
        downloaded: false,
        totalGroups: 3,
        totalSessions: 7,
      }),
    ).toEqual({
      message:
        "Risk snapshot is ready, but this browser could not start the download.",
      tone: "warning",
      requestId: undefined,
    });

    expect(
      createAdminSessionArtifactDownloadNotice({
        kind: "risk-timeline-csv",
        downloaded: true,
        pointCount: 5,
        view: "weekly",
      }),
    ).toEqual({
      message: "Downloaded weekly risk timeline CSV for 5 point(s).",
      tone: "success",
      requestId: undefined,
    });
  });

  it("annotates JSON download payloads with download outcomes", () => {
    vi.mocked(downloadJsonFile).mockReturnValueOnce(true);

    expect(
      withDownloadedJsonFile(
        {
          requestId: "req-json",
          snapshot: { totalSessions: 2 },
        },
        "snapshot.json",
        { totalSessions: 2 },
      ),
    ).toEqual({
      requestId: "req-json",
      snapshot: { totalSessions: 2 },
      downloaded: true,
    });
    expect(downloadJsonFile).toHaveBeenCalledWith("snapshot.json", {
      totalSessions: 2,
    });
  });

  it("annotates text download payloads with download outcomes", () => {
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);

    expect(
      withDownloadedTextFile(
        {
          requestId: "req-csv",
          totalSessions: 3,
        },
        "snapshot.csv",
        "id,total\n1,3",
        "text/csv;charset=utf-8",
      ),
    ).toEqual({
      requestId: "req-csv",
      totalSessions: 3,
      downloaded: false,
    });
    expect(downloadTextFile).toHaveBeenCalledWith(
      "snapshot.csv",
      "id,total\n1,3",
      "text/csv;charset=utf-8",
    );
  });
});
