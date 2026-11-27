/**
 * Owner permanent ban: GASTROFOOD ERP must not sync with Poster POS.
 * Enforced in API and SQL — not merely by hiding UI.
 *
 * Historical poster-sourced rows may remain read-only.
 * Manual file import from Poster requires a separate explicit owner OK
 * (not enabled by this module).
 */

export const POSTER_ERP_SYNC_FORBIDDEN = true as const;

export const POSTER_ERP_SYNC_FORBIDDEN_CODE = "ERP_POSTER_SYNC_FORBIDDEN";

export const POSTER_ERP_SYNC_FORBIDDEN_DETAIL =
  "Poster POS sync is permanently forbidden by owner. GASTROFOOD ERP runs independently of Poster.";

/** Exact + common aliases — keep in sync with SQL erp_is_poster_erp_source. */
const POSTER_SOURCE_ALIASES = new Set([
  "poster",
  "poster_pos",
  "poster-pos",
  "posterpos",
  "joinposter",
  "poster_api",
  "poster-api",
  "poster.api",
  "poster_sync",
  "poster-sync",
]);

export function isPosterErpSource(source: unknown): boolean {
  const s = String(source ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (POSTER_SOURCE_ALIASES.has(s)) return true;
  if (/^poster[_-]/.test(s)) return true;
  if (s.startsWith("poster.")) return true;
  return false;
}

/** True when an action would create/sync/import Poster→ERP data. */
export function wouldSyncPosterToErp(input: {
  source_system?: unknown;
  source?: unknown;
  poster_payload?: unknown;
  live_fetch?: unknown;
  auto_sync?: unknown;
}): boolean {
  if (!POSTER_ERP_SYNC_FORBIDDEN) return false;
  if (isPosterErpSource(input.source_system) || isPosterErpSource(input.source)) return true;
  if (input.poster_payload != null) return true;
  if (input.live_fetch === true || input.auto_sync === true) return true;
  return false;
}
