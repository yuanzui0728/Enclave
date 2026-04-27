import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { CloudApiErrorResponse } from "@yinjie/contracts";
import {
  localizeCloudApiError,
  resolveCloudApiLocaleFromRequest,
} from "./cloud-api-i18n";

type HttpExceptionResponseBody = {
  error?: string;
  errorCode?: string;
  message?: string | string[];
  params?: CloudApiErrorResponse["params"];
  statusCode?: number;
};

@Catch()
export class CloudApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest();
    const requestId =
      typeof response.getHeader === "function"
        ? String(response.getHeader("X-Request-Id") ?? "").trim()
        : "";
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionBody =
      exception instanceof HttpException ? exception.getResponse() : null;
    const normalizedBody = normalizeExceptionBody(exceptionBody);
    const locale = resolveCloudApiLocaleFromRequest(request);
    const localized = localizeCloudApiError({
      errorCode: normalizedBody.errorCode,
      locale,
      messages: normalizeExceptionMessages(normalizedBody),
      statusCode,
    });
    const payload: CloudApiErrorResponse = {
      statusCode,
      errorCode: localized.errorCode,
      message: localized.message,
      ...(normalizedBody.params || localized.params
        ? { params: normalizedBody.params ?? localized.params }
        : {}),
      ...(requestId ? { requestId } : {}),
    };

    response.status(statusCode).json(payload);
  }
}

function normalizeExceptionBody(
  body: string | object | null,
): HttpExceptionResponseBody {
  if (typeof body === "string") {
    return { message: body };
  }

  if (body && typeof body === "object") {
    return body as HttpExceptionResponseBody;
  }

  return {};
}

function normalizeExceptionMessages(body: HttpExceptionResponseBody) {
  if (Array.isArray(body.message)) {
    return body.message.filter((message) => message.trim());
  }

  if (typeof body.message === "string" && body.message.trim()) {
    return [body.message.trim()];
  }

  if (typeof body.error === "string" && body.error.trim()) {
    return [body.error.trim()];
  }

  return [];
}
