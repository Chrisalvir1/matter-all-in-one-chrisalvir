# Comedero Michi: playback audit, 2026-10-12 22:29–22:31 Costa Rica

Supervisor live terminal confirms Matter All-in-One started, installed/latest
2.1.13, update_available false. No update or restart performed.

User reports unplayable recordings, Live View startup over five seconds, and
stale snapshots. Screenshot shows black playback and “Resumen no disponible”.

## Runtime evidence

- 22:24:13.667: snapshot `safety-cached-fallback`, 22350 bytes, 1801 ms.
- 22:24:13.903: standalone HKSV reader paused for Live View.
- 22:24:20.265: HAP START; callback success at 22:24:20.671. Approximately
  6.36 seconds from pause to FFmpeg START. Callback is not proof of playback.
- 22:24:21.816: standalone HKSV reader resumed after Live View ended.
- 22:24:24.617: FFmpeg could not identify H.264 pixel format, source reported
  640×360; suggested increasing analyzeduration 100000 / probesize 65536.
- 22:24:24.621: initialization segment received, 1266 bytes. Initialization
  alone does not establish valid SPS/PPS or decodable media.
- 22:26:56.726: local movement and HKSV event.
- 22:26:56.957: Home Hub closed recording with reason 5, initSent true,
  fragmentsSent 1.
- 22:27:02.517: next recording closed with reason 5, initSent true,
  fragmentsSent 2.
- 22:30:51.600: a later HAP START appeared after Live View was paused;
  callback success was logged at 22:30:58.176, then an fMP4 fragment at
  22:31:02.721. Chris confirmed the stream takes about 10 seconds to open.
  The logs therefore support a long path to usable video, even though HAP
  START itself is not a first-frame measurement.

No ACK or playable saved clip established by this audit. Earlier normal close
with ten fragments is not evidence that Apple saved a playable clip.

## Code findings requiring a tested correction

- Snapshot `finish()` resets lastSnapshotTime and persists the buffer even when
  serving cached fallback. Persisted image load assigns current time rather
  than file modification time. Active sessions always receive the old buffer.
- Omni Live View startup probes a signed source for up to 4 seconds, then
  requests a different signed URL for actual playback. This can contribute to
  latency; the measured runtime interval does not isolate each phase yet.
- Standalone prebuffer copies H.264 with an extremely short probe, unlike a
  source-specific SPS/PPS readiness check. Need inspect actual init/media before
  assigning this warning as the cause of Apple's rejection.
- Fragment parser accepts a track without first-sample flags as keyframed and
  does not distinguish audio from video tracks. Need a real fMP4 fixture to
  validate random access and timeline continuity.
- Verification currently may mark normal close as verified without an ACK.
  Keep transport acceptance distinct from a saved playable clip.

## Pending

Inspect actual Omni WebSocket request/response without printing/persisting
signed URLs; obtain Core traceback context (the initial filtered read showed
only two Traceback headings); inspect SPS/PPS, avcC, fragment sample flags and
timestamps; measure startup phases; obtain a current Live View reproduction
and a playable saved recording in Apple Home after any eventual fix.

## 2.1.14 candidate

Local changes add a 2 MiB / 3 s input probe for Omni HKSV, regular fMP4 cuts
using the negotiated fragment duration on the prebuffer path, preserve actual
snapshot mtimes and avoid repeated signed-stream probing when audio capabilities
are already known. Local validation: 650 tests / 68 files passed, TypeScript
backend and frontend checks/build passed, changelog check passed. This candidate
has not been published or installed; Apple Home playback, a recent snapshot,
HKSV ACK and a saved playable clip remain to verify on hardware.

URLs and tokens omitted from this report.
