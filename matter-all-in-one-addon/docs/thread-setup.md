# Thread Network Setup and Credentials Provisioning

To enable direct connection and diagnostics with Matter Thread-based devices, the plugin provides a manager to set up and sync credentials.

## Setup Instructions

1. Obtain your Thread Active Operational Dataset (credentials) from your Apple Home / Google Home / Home Assistant Thread border router. This dataset contains:
   * Pan ID
   * Extended Pan ID
   * Network Name
   * Channel
   * Master Key

2. Add the dataset parameters in your plugin configuration:
   ```json
   {
     "thread": {
       "networkName": "MyThreadNetwork",
       "panId": 4660,
       "channel": 15,
       "extendedPanId": "deadbeef00c0ffee",
       "masterKey": "00112233445566778899aabbccddeeff"
     }
   }
   ```

3. When starting up, the plugin's `ThreadCredentialsManager` will provision these parameters to the required `ThreadNetworkDiagnostics` clusters on your bridged devices, facilitating local connectivity checks and topology maps.
