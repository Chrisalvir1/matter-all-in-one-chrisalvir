## Matter All-in-One 2.2.4

Fixes Robotina's Matter RVC initialization failure when Home Assistant reports `chargego` as the current cleaning selector state. The selected state is not itself a clean mode, so the add-on now falls back to the first supported Matter clean mode rather than advertising unsupported `currentMode=1` while only modes 2, 3, and 4 exist.

- Uses an advertised clean mode whenever the HA selector value has no matching RVC mode.
- Refuses to place a destroyed or unready endpoint in the published-device inventory after Matterbridge registration.
- Adds an integration regression test using Robotina's current selector state (`chargego`) and options (`standby`, `random`, `wall_follow`, `spiral`, `chargego`).
- Preserves existing Matter fabrics and paired accessories. No reset or recommissioning is required or performed.

Post-install verification on Home Assistant and Apple Home confirmed the add-on is started on 2.2.4, the existing paired inventory is restored (192 devices, 30 paired), and Robotina's Casa control sheet exposes the native vacuum control and clean-mode choices. The physical `Inicio` action was not sent, so motor operation was not tested. No reset or recommissioning was performed.
