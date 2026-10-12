"""The UniFi Network integration's device trackers, for the panel.

One record per device_tracker entity the UniFi integration has registered
(network clients and UniFi's own devices alike), with the device it belongs
to, if any. A tracker is online while its state is anything but unavailable
or unknown; disabled trackers have no state and are marked as such.
"""
from __future__ import annotations

from typing import Any

from homeassistant.const import ATTR_FRIENDLY_NAME, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import UNIFI_DOMAIN

TRACKER_DOMAIN = "device_tracker"

STATUS_ONLINE = "online"
STATUS_OFFLINE = "offline"
STATUS_DISABLED = "disabled"

OFFLINE_STATES = (STATE_UNAVAILABLE, STATE_UNKNOWN)


def tracker_status(state: str | None, disabled: bool) -> str:
    """Online, offline or disabled, from a tracker's state."""
    if disabled:
        return STATUS_DISABLED
    if state is None or state in OFFLINE_STATES:
        return STATUS_OFFLINE
    return STATUS_ONLINE


@callback
def async_unifi_trackers(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Every UniFi device tracker, as plain data for the panel."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    sites = {
        entry.entry_id: entry.title
        for entry in hass.config_entries.async_entries(UNIFI_DOMAIN)
    }
    records: list[dict[str, Any]] = []
    for entry in ent_reg.entities.values():
        if entry.domain != TRACKER_DOMAIN or entry.platform != UNIFI_DOMAIN:
            continue
        device = dev_reg.async_get(entry.device_id) if entry.device_id else None
        device_name = (device.name_by_user or device.name) if device else None
        state = hass.states.get(entry.entity_id)
        entity_name = (
            (state.attributes.get(ATTR_FRIENDLY_NAME) if state else None)
            or entry.name
            or entry.original_name
            or device_name
            or entry.entity_id
        )
        disabled = entry.disabled_by is not None
        records.append(
            {
                "entity_id": entry.entity_id,
                "entity_name": entity_name,
                "device_id": entry.device_id,
                "device_name": device_name,
                "manufacturer": device.manufacturer if device else None,
                "model": device.model if device else None,
                "site": sites.get(entry.config_entry_id),
                "disabled": disabled,
                "state": state.state if state else None,
                "last_changed": state.last_changed.isoformat() if state else None,
                "status": tracker_status(state.state if state else None, disabled),
            }
        )
    records.sort(key=lambda r: ((r["device_name"] or r["entity_name"]).casefold(), r["entity_id"]))
    return records
