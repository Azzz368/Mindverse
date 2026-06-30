export class AIProviderError extends Error { constructor(message: string, public readonly code = "AI_PROVIDER_ERROR", public readonly status = 500) { super(message); this.name = "AIProviderError"; } }
export class AIProviderConfigError extends AIProviderError { constructor(message = "302.AI API key is missing. Please set AI_302_API_KEY in your server environment.") { super(message, "AI_PROVIDER_CONFIG_ERROR", 500); this.name = "AIProviderConfigError"; } }
export class AIProviderHTTPError extends AIProviderError { constructor(message: string, status: number, public readonly body?: unknown) { super(message, "AI_PROVIDER_HTTP_ERROR", status); this.name = "AIProviderHTTPError"; } }
export class TokenStarError extends AIProviderError { constructor(message: string, status = 500, public readonly errorCode?: string, public readonly requestId?: string) { super(message, "TOKENSTAR_ERROR", status); this.name = "TokenStarError"; } }
const safeProviderDetail = (message: string) => message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\b(sk|ts)-[A-Za-z0-9_-]+/gi, "[redacted]").replace(/((?:api[_-]?key|token|secret|authorization)\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[redacted]").replace(/^302\.AI request to /i, "").replace(/^302\.AI request failed \(\d+\):\s*/i, "").slice(0, 500);
const TOKENSTAR_CODE_MESSAGES: Record<string, string> = {
  invalid_request: "Request parameter error or invalid JSON. Check model, content, and required fields.",
  invalid_json: "Request body is not valid JSON.",
  unauthorized: "API Key is missing or invalid. Check TOKENSTAR_API_KEY.",
  invalid_virtual_key: "Virtual API key is invalid or expired. Regenerate the key in the TokenStar console.",
  subscription_inactive: "TokenStar subscription is not active. Please activate the plan.",
  subscription_expired: "TokenStar subscription has expired. Please renew.",
  quota_not_configured: "No token quota configured for this account. Please set up a quota in the console.",
  permission_denied: "No permission to access this model or endpoint. Check account plan and model access.",
  not_found: "Task or resource not found. The task ID may be wrong or already expired.",
  daily_quota_exceeded: "Daily quota exceeded. Please try again tomorrow or upgrade the plan.",
  rate_limit_exceeded: "Rate limit exceeded. Reduce request frequency or upgrade the plan.",
  upstream_unavailable: "Upstream model service is temporarily unavailable. Please retry later.",
  service_unavailable: "TokenStar service is temporarily unavailable. Please retry later.",
  service_timeout: "TokenStar service timed out. Please retry later.",
};
export function normalizeAIError(error: unknown) {
  if (error instanceof TokenStarError) {
    const detail = safeProviderDetail(error.message);
    const codeMsg = error.errorCode ? (TOKENSTAR_CODE_MESSAGES[error.errorCode] ?? `Error code: ${error.errorCode}`) : "";
    const reqHint = error.requestId ? ` [requestId: ${error.requestId}]` : "";
    const build = (prefix: string) => `${prefix}${codeMsg ? " " + codeMsg : detail ? " " + detail : ""}${reqHint}`;
    if (error.status === 401) return { message: build("TokenStar rejected the request (401)."), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status === 402) return { message: build("TokenStar account issue (402)."), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status === 403) return { message: build("TokenStar denied the request (403)."), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status === 404) return { message: build("TokenStar resource not found (404)."), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status === 429) return { message: build("TokenStar rate limit reached (429)."), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status === 502 || error.status === 504) return { message: build(`TokenStar upstream error (${error.status}).`), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    if (error.status >= 500) return { message: build(`TokenStar service error (${error.status}).`), code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
    return { message: codeMsg ? `${codeMsg}${reqHint}` : `${detail}${reqHint}`, code: error.code, status: error.status, errorCode: error.errorCode, requestId: error.requestId };
  }
  if (error instanceof AIProviderConfigError) return { message: error.message, code: error.code, status: error.status };
  if (error instanceof AIProviderHTTPError) { const isHKGAI = /HKGAI MaaS/i.test(error.message); const label = isHKGAI ? "HKGAI MaaS" : "302.AI"; if (error.status === 401) return { message: isHKGAI ? "HKGAI MaaS authentication failed. Please check HKGAI_MAAS_API_KEY." : "302.AI authentication failed. Please check AI_302_API_KEY.", code: error.code, status: error.status }; if (error.status === 403) return { message: `${label} denied this endpoint or model. The API key may be valid, but the selected model, voice, or account permission is unavailable. ${safeProviderDetail(error.message)}`, code: error.code, status: error.status }; if (error.status === 402 || error.status === 429) return { message: `${label} request was limited. Please check your balance, quota, or rate limit.`, code: error.code, status: error.status }; if (error.status >= 500) { const detail = safeProviderDetail(error.message); return { message: detail && detail !== "Unknown response" ? `${label} service returned ${error.status}: ${detail}` : `${label} service returned ${error.status}. Please retry later or use the configured default model.`, code: error.code, status: error.status }; } return { message: safeProviderDetail(error.message), code: error.code, status: error.status }; }
  if (error instanceof AIProviderError) return { message: safeProviderDetail(error.message), code: error.code, status: error.status };
  return { message: "AI request failed. Please try again.", code: "AI_PROVIDER_ERROR", status: 500 };
}
