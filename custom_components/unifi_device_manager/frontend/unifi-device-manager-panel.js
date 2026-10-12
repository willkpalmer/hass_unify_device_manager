// WP UniFi Device Manager - sidebar panel.
//
// Web components with no build step and no external libraries, in the
// same style as WP Log Doctor, in a few modules loaded by this one (each
// with this file's ?v= version, so a new release is never mixed with a
// cached old module):
//
//   udm-util.js   shared constants and helpers
//   udm-style.js  the page's styles and markup
//   udm-panel.js  <unifi-device-manager-panel>: the device list
//
// The Devices page lists every device tracker the UniFi Network
// integration has imported: the device it belongs to, the tracker's name
// and entity ID, and whether it's online (available) or offline
// (unavailable), with All, Online, Offline and Disabled tabs. The list
// comes over the WebSocket (unifi_device_manager/devices/subscribe) and
// again whenever the registries change; online/offline follows the states
// Home Assistant sends the panel, so it's always live.
//
// The page itself doesn't scroll: the header, tabs, toolbar and column
// headings stay put and only the list scrolls.

const V = new URL(import.meta.url).search;
const { UnifiDeviceManagerPanel } = await import(`./udm-panel.js${V}`);

if (!customElements.get("unifi-device-manager-panel")) {
  customElements.define("unifi-device-manager-panel", UnifiDeviceManagerPanel);
}
