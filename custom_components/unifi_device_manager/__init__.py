"""The UniFi Device Manager integration.

Adds a sidebar page for managing the devices the UniFi Network integration
imports: each of its device trackers, the device it belongs to, and whether
it's online (available) or offline (unavailable). It reads Home
Assistant's registries and states only; it never changes anything.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .panel import async_register_panel, async_remove_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up UniFi Device Manager from a config entry."""
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    async_remove_panel(hass)
    return True
