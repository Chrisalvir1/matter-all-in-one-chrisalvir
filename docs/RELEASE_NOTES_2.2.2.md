## Matter All-in-One 2.2.2

This patch fixes a production packaging error discovered in 2.2.1. The RVC vacuum plugin imports Matter.js `DescriptorServer`, but `@matter/node` had only been present as a development dependency through Matterbridge. The final add-on image omitted it, so Matterbridge safely refused to start the bridge rather than risk modifying registered devices.

- `@matter/node` 0.18.0 is now an explicit production dependency.
- The runtime image build imports the exact descriptor module from the production dependency tree, so a missing package fails before publication.
- The RVC descriptor/battery/mode fixes from 2.2.1 remain included.
- No fabric reset, device removal, or recommissioning is required.

After installation, verify startup, the same paired-device inventory, the final RVC descriptor, and Robotina's representation and controls in Apple Home. Until that physical check passes, the release is not considered verified for Robotina.
