# HomeKit 4K HAP compatibility package

This package uses the Apache-2.0 Camera.UI Secure Video fork of
`@homebridge/hap-nodejs`, pinned to
`seydx/HAP-NodeJS@f844d293d62d843d7c7d5e9363bb606fd841ee00` (merge commit
`Merge branch 'secure-video' into camera.ui`). The fork adds HAP service
definitions, TLV codecs, `SecureVideoController`, WebRTC/Multi-Tier RTP
delegates, Secure Video credentials, HDS snapshots and CMAF ingest. It is the
same HAP API consumed by the official Camera.UI HomeKit plugin. This adoption
provides protocol contracts and runtime support; it does not by itself make
HomeKit 4K's WebRTC, SFrame, recording, or Apple interoperability complete.

HomeKit 4K maintains a local patch to `src/lib/util/hapCrypto.ts`. The module
keeps HAP's pair-setup, pair-verify, Data Stream and EventedHTTP callers, nonce
counters, zero-left-padding for short nonces, little-endian frame-length AAD,
0x400-byte framing and 16-byte authentication tags. It routes the existing
seal/open calls through one provider abstraction. `NATIVE` uses `node:crypto`;
`PORTABLE` uses the RFC 8439 ChaCha20-Poly1305 IETF primitive from
`@noble/ciphers`; authentication failures still throw before plaintext is
returned.

`scripts/build-vendored-hap.mjs` deterministically transpiles the maintained
TypeScript crypto source and copies the runtime distribution into Camera.UI
bundle assets. The package is pinned as a local dependency, avoiding mutable
post-install edits to `node_modules`.

HomeKit 4K patches the vendored CMAF ingest client to send DASH-IF Interface 1
init and media boxes unchanged over the provisioned mTLS connection. The
previous implementation wrapped each MP4 object in an external IV/ciphertext/
tag envelope while retaining an MP4 content type; production logs showed the
publishing point rejecting the resulting init with HTTP 400. The CMAF delegate
supplies Opus audio and HEVC video. Apple Home acceptance remains an empirical
gate and is not claimed by this patch or its local tests.

Upstream HAP copyright and Apache-2.0 `LICENSE` are retained. The portable
provider dependency retains its own MIT license. See `docs/security.md` for the
provider selection and audit limitations.
