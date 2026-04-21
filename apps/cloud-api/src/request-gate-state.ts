import type {
  CloudWorldRequestStatus,
  WorldAccessPhase,
  WorldAccessSessionStatus,
} from "@yinjie/contracts";

export type RequestGateFailureCode =
  | "request_pending"
  | "request_disabled"
  | "request_rejected";

export const REQUEST_GATE_FAILURE_CODE_BY_STATUS = {
  pending: "request_pending",
  disabled: "request_disabled",
  rejected: "request_rejected",
} as const satisfies Record<
  "pending" | "disabled" | "rejected",
  RequestGateFailureCode
>;

export const REQUEST_GATE_FAILURE_CODES = Object.values(
  REQUEST_GATE_FAILURE_CODE_BY_STATUS,
) as RequestGateFailureCode[];

export type RequestGateState = {
  accessStatus: WorldAccessSessionStatus;
  accessPhase: WorldAccessPhase;
  displayStatus: string;
  retryAfterSeconds: number;
  estimatedWaitSeconds: number | null;
  failureCode: RequestGateFailureCode;
  placeholderHealthStatus: "creating" | "disabled" | "failed";
  failureReason: string;
};

export function getRequestGateState(
  status: CloudWorldRequestStatus,
  note?: string | null,
): RequestGateState {
  const normalizedNote = note?.trim();

  switch (status) {
    case "pending":
      return {
        accessStatus: "pending",
        accessPhase: "creating",
        displayStatus: "世界申请审核中。",
        retryAfterSeconds: 5,
        estimatedWaitSeconds: null,
        failureCode: REQUEST_GATE_FAILURE_CODE_BY_STATUS.pending,
        placeholderHealthStatus: "creating",
        failureReason: normalizedNote || "管理员审核通过后才会开始创建世界。",
      };
    case "disabled":
      return {
        accessStatus: "disabled",
        accessPhase: "disabled",
        displayStatus: "世界当前已被停用。",
        retryAfterSeconds: 0,
        estimatedWaitSeconds: null,
        failureCode: REQUEST_GATE_FAILURE_CODE_BY_STATUS.disabled,
        placeholderHealthStatus: "disabled",
        failureReason: normalizedNote || "该世界当前已被停用，暂时无法进入。",
      };
    case "rejected":
    default:
      return {
        accessStatus: "failed",
        accessPhase: "failed",
        displayStatus: "世界申请未通过。",
        retryAfterSeconds: 0,
        estimatedWaitSeconds: null,
        failureCode: REQUEST_GATE_FAILURE_CODE_BY_STATUS.rejected,
        placeholderHealthStatus: "failed",
        failureReason: normalizedNote || "世界申请未通过，暂时无法进入。",
      };
  }
}

export function isRequestGateFailureCode(
  value?: string | null,
): value is RequestGateFailureCode {
  return value ? REQUEST_GATE_FAILURE_CODES.includes(value as RequestGateFailureCode) : false;
}
