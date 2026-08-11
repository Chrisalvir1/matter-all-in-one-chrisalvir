# Changelog

## 1.2.78

- Upgrade runtime and development Matterbridge to 3.10.4; this pulls `@matter/main` 0.17.9.
- Explicitly use `MatterbridgeOnOffServer` for lighting endpoints and `MatterbridgeOnOffServer.with()` for endpoints without the Lighting feature.
- Correct Matter XY scaling to the specification's 1/65536 representation.
- Preserve fractional hue/saturation precision instead of rounding HomeKit selections to whole degrees/percentages.
- Route HomeKit XY commands to each Home Assistant light's native `xy`, `hs`, or `rgb` service payload.
- Mirror standard and enhanced Matter hue attributes and handle the new 3.10.4 hue/saturation step and move forwarding.
- Scope command lockouts per composite child endpoint so one light cannot suppress another light's state feedback.
- Add exhaustive hue round-trip and XY/native-mode regression tests.
