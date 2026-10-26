## Matter All-in-One 2.2.4

Fixes Robotina's Matter RVC initialization failure when Home Assistant reports `chargego` as the current cleaning selector state. The selected state is not itself a clean mode, so the add-on now falls back to the first supported Matter clean mode rather than advertising unsupported `currentMode=1` while only modes 2, 3, and 4 exist.

- Uses an advertised clean mode whenever the HA selector value has no matching RVC mode.
- Refuses to place a destroyed or unready endpoint in the published-device inventory after Matterbridge registration.
- Adds an integration regression test using Robotina's current selector state (`chargego`) and options (`standby`, `random`, `wall_follow`, `spiral`, `chargego`).
- Preserves existing Matter fabrics and paired accessories. No reset or recommissioning is required or performed.

Verification still requires installing the image and confirming in Apple Home that Robotina is displayed as a robotic vacuum and that its controls work. A passing build, Matter pairing, or endpoint log alone does not establish that result.
