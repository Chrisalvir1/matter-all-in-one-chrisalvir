## Matter All-in-One 2.2.3

Fixes the Matterbridge plugin load failure found after installing 2.2.2. Matterbridge already bundles and publicly exports the required Matter behavior servers, but rejects `@matter/node` when the add-on declares it as a direct plugin dependency. The RVC descriptor import and the Basic Information updates now use `matterbridge/matter/behaviors`.

- Removed the direct `@matter/node` dependency from the plugin manifest.
- Runtime image validation checks that `DescriptorServer` and `BasicInformationServer` resolve through Matterbridge's public API.
- Preserves existing Matter fabrics and paired devices; no reset or recommissioning is part of this change.
- Verify the plugin is actually enabled, paired accessory inventory is restored, Robotina is represented as an RVC in Apple Home, and its controls work. Until those physical checks pass, Robotina is not considered repaired.
