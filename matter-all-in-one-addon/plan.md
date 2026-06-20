# Plan to redesign the Device UI
1. Modify `index.html`:
   - Rename `entity-modal` to `device-modal`.
   - Update `device-modal` body to have a left section for the list of entities, and a right section for the QR code and Pairing status of the *selected* entity.
2. Modify `script.js`:
   - `buildDeviceCard`: remove the expand chevron and `dc-entities` hidden div. Add a `Configurar` button.
   - `openDeviceModal`: 
     - Render the entities in the left side of the modal.
     - Select the first entity by default.
     - The right side shows the QR, pairing code, and decommission button for the *selected* entity.
   - Handling entity export toggles and type changes from within the modal.
