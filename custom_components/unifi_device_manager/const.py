"""Constants for the UniFi Device Manager integration."""
from __future__ import annotations

DOMAIN = "unifi_device_manager"
TITLE = "WP UniFi Device Manager"

# The integration whose devices are managed: Home Assistant's own UniFi
# Network integration.
UNIFI_DOMAIN = "unifi"

DATA_PANEL_STATIC_REGISTERED = f"{DOMAIN}_panel_static_registered"

PANEL_URL_PATH = "unifi-devices"
PANEL_TITLE = "UniFi Devices"
PANEL_ICON = "mdi:access-point-network"
PANEL_ELEMENT = "unifi-device-manager-panel"
PANEL_STATIC_URL = "/unifi_device_manager_static"
PANEL_MODULE_FILE = "unifi-device-manager-panel.js"
