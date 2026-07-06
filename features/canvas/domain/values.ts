export const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export const asText = (value: unknown) => typeof value === "string" ? value : "";
