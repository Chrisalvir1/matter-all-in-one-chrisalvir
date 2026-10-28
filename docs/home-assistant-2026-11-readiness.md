# Matter All-in-One v2.3.0 — preparación para Home Assistant 2026.11

Release v2.3.0: do **not** install a Home Assistant beta on the primary
instance just to test these changes. Use HA 2026.10 and isolated contract tests;
then verify against 2026.11 in a spare instance before a production HA upgrade.

## Verified user baseline (28 October 2026)

Chrisalvir reports one **Omni Tuya Local** camera exported from Matter All in
One to **Apple Home**, with Live View, motion sensor, audio and recording all
working correctly in the real installation. The camera may use the standalone
HAP/HKSV track; this real-world report does **not** establish that the Matter
camera track has been certified or that multiple cameras work concurrently.
Preserve this working route and the current sensor association behavior until
it is tested on real hardware.

## Phase 1 — compatibility

- Home Assistant's new contextual entity names must never become stable IDs.
  Camera/motion matching uses `entity_id` and `device_id` first, with registry
  names (`name`, `original_name`, device name) as additional search text.
- Existing HAP accessory identities, QR pairing, HKSV state, camera identifiers,
  and signed RTSP URL renewal are intentionally unchanged.
- The direct Omni command remains `omni_tuya_local/camera_stream`; HA's
  `camera/stream` serves only as a fallback if Omni cannot renew its source.

## Phase 2 — camera reliability and telemetry

- Each Omni allocation records attempts, duration, and success/failure counters.
  Signed RTSP URLs, passwords, access tokens, SDP and private stream data are
  never stored in the diagnostic counters.
- Existing tests cover signed URL renewal, failure fallback, HKSV prebuffer
  pause/resume during Live View, and reuse of the active Omni RTSP reader.
- Test physically with one camera first, then simultaneous sessions and multiple
  independent cameras. A pass in Vitest is not proof of Apple Home/iCloud HKSV.

### Production verification checklist

1. Back up the add-on and Home Assistant before installing a test build.
2. On the *test* instance, connect the camera and verify the HAP identity is
   unchanged after a restart.
3. Open/close Apple Home Live View repeatedly; verify audio and motion.
4. Trigger motion during Live View and when closed; verify actual HKSV clips.
5. Simulate loss of the Omni RTSP allocation; verify the fallback and later
   recovery without using an expired signed URL.
6. Check camera names, linked motion entity IDs, and event associations after
   updating the test Home Assistant to 2026.11.
7. Add a second camera; observe stream resources and independent recording.

## Phase 3 — read-only AI diagnosis (opt in)

The add-on can expose a **sanitized** JSON snapshot under
`GET /api/custom/ai/camera-diagnostics`. It is disabled by default. Set
`diagnostics_token` in the add-on options to a random secret of 24+ characters,
or set `MATTER_AIO_DIAGNOSTICS_TOKEN` in a standalone Matterbridge environment.
Supply `Authorization: Bearer <your-token>` through a *trusted local* path.

The response includes camera entity IDs, availability, HAP pairing/publishing
booleans, motion entity ID, audio availability, HKSV status, aggregate Omni RTSP
allocation counters, and bounded Live View state. It excludes stream URLs,
connection credentials, setup codes, identifiers of HAP sessions, SDP, and raw
logs. A 404 response means the feature is disabled; 401 means authentication
failed. No mutating endpoint is added.

This is an input for a **separate** trusted MCP adapter; it is **not** itself an
MCP server or a public ChatGPT endpoint. Home Assistant Ingress authentication
and network isolation must remain in place. Do not expose port 8285 to the
Internet or put the token in a URL, browser query string, or AI prompt.

## Non-goals in this development pass

- No changes to the production RTSP/FFmpeg/HKSV streaming pipeline.
- No automatic remote restart, bridge reset, or other AI-initiated mutation.
- No claim that a Matter 1.5 camera imported into HA automatically supplies an
  RTSP/HAP compatible source; that requires a real compatible camera test.
