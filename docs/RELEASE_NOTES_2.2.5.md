## Matter All-in-One 2.2.5

Fixes a Robotina RVC start failure observed in Apple Home: serializing the full Matter command context raised a BigInt error before Home Assistant received `vacuum.start`. It also avoids an unavailable dock button, reads the linked Electricity Left battery sensor and reports confirmed full-charge or charging states.

The existing pairing is retained. Home Assistant rejected `vacuum.locate` for the observed Robotina entity; sound location requires a supported device command and is not claimed as fixed. Physical movement and Apple Home battery presentation must be checked after installation.
