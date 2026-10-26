## Matter All-in-One 2.2.1

This release fixes Robotina's Matter RVC advertisement for Apple Home:

- The final Matter Descriptor now advertises only the Robotic Vacuum Cleaner device type (`0x0074`). The PowerSource cluster stays available for battery and charging telemetry without advertising a second device type that made Apple Home display a generic composite accessory.
- Existing pinned vacuum identities keep the optional RVC Clean Mode cluster with a valid list of at least two modes. New vacuums without enough HA clean-mode options continue to omit that optional cluster.
- A real Matterbridge ServerNode validation test verifies the final descriptor, retained PowerSource cluster, and initialization of a pinned RVC identity.

After installing this version, verify that Apple Home updates Robotina's representation and that its vacuum controls work with the existing fabric. This release does not require resetting or recommissioning the accessory.
