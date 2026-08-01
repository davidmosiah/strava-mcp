import { applyPrivacy } from "./privacy.js";
import type { PrivacyMode } from "../types.js";

export interface CollectionResult {
  records: unknown[];
  next_page?: number;
  pages_fetched: number;
}

/**
 * Shape the payload every `strava_list_*` tool returns.
 *
 * Extracted from the tool handler so `scripts/demo-contract-test.mjs` can build
 * the exact envelope an agent receives without live OAuth. A gate that
 * re-implemented this shape would only prove the gate agrees with itself.
 */
export function buildCollectionOutput(endpoint: string, result: CollectionResult, mode: PrivacyMode) {
  const redacted = applyPrivacy(endpoint, { records: result.records }, mode) as { records: unknown[] };
  return {
    endpoint,
    privacy_mode: mode,
    count: redacted.records.length,
    records: redacted.records,
    next_page: result.next_page,
    has_more: Boolean(result.next_page),
    pages_fetched: result.pages_fetched
  };
}
