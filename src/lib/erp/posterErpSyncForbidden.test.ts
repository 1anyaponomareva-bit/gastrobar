import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POSTER_ERP_SYNC_FORBIDDEN,
  isPosterErpSource,
  wouldSyncPosterToErp,
} from "./posterErpSyncForbidden";

describe("posterErpSyncForbidden", () => {
  it("owner ban is permanent true", () => {
    assert.equal(POSTER_ERP_SYNC_FORBIDDEN, true);
  });

  it("detects poster source and aliases", () => {
    assert.equal(isPosterErpSource("poster"), true);
    assert.equal(isPosterErpSource("Poster"), true);
    assert.equal(isPosterErpSource("poster_pos"), true);
    assert.equal(isPosterErpSource("poster-api"), true);
    assert.equal(isPosterErpSource("joinposter"), true);
    assert.equal(isPosterErpSource("poster.sync"), true);
    assert.equal(isPosterErpSource("poster_import"), true);
    assert.equal(isPosterErpSource("grab"), false);
    assert.equal(isPosterErpSource("manual"), false);
    assert.equal(isPosterErpSource("import"), false);
  });

  it("blocks poster sync/import payloads", () => {
    assert.equal(wouldSyncPosterToErp({ source_system: "poster" }), true);
    assert.equal(wouldSyncPosterToErp({ source: "poster" }), true);
    assert.equal(wouldSyncPosterToErp({ poster_payload: { id: 1 } }), true);
    assert.equal(wouldSyncPosterToErp({ auto_sync: true }), true);
    assert.equal(wouldSyncPosterToErp({ source_system: "manual" }), false);
    assert.equal(wouldSyncPosterToErp({ source_system: "grab" }), false);
  });
});
