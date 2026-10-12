"""The UniFi Network integration's devices and services, for the panel.

Devices: one record per device_tracker entity the UniFi integration has
registered (network clients and UniFi's own devices alike), with the device
it belongs to, if any. A tracker is online while its state is anything but
unavailable or unknown; disabled trackers have no state and are marked as
such.

Most disabled trackers are disabled by Home Assistant itself, not by
anyone: UniFi reports a tracker for every client it knows, and Home
Assistant's device_tracker platform only enables the ones whose MAC address
belongs to a device it already has (see
homeassistant/components/device_tracker/config_entry.py). They have no
device, so they don't show among the integration's devices.

Devices can be renamed to their tracker's name
(async_rename_devices_to_trackers), which sets the name you'd otherwise
set on the device's page (name_by_user), and their names put back
(async_set_device_names) for Undo.

Services: the devices UniFi registers as services rather than hardware
(Home Assistant's DeviceEntryType.SERVICE: the UniFi Network application,
its WLANs and DPI groups), with their enabled entities, whose availability
the panel follows.
"""
from __future__ import annotations

from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
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


def _is_service(device: dr.DeviceEntry | None) -> bool:
    return device is not None and device.entry_type == dr.DeviceEntryType.SERVICE


def _device_name(device: dr.DeviceEntry | None) -> str | None:
    return (device.name_by_user or device.name) if device else None


def _tracker_name(entry: er.RegistryEntry, device_name: str | None) -> str:
    # The tracker's own name, without the device's name that Home
    # Assistant puts in front of it in the friendly name.
    return entry.name or entry.original_name or device_name or entry.entity_id


def _is_unifi_tracker(entry: er.RegistryEntry | None) -> bool:
    return entry is not None and entry.domain == TRACKER_DOMAIN and entry.platform == UNIFI_DOMAIN


@callback
def async_unifi_trackers(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Every UniFi device tracker not on a service, as plain data."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    records: list[dict[str, Any]] = []
    for entry in ent_reg.entities.values():
        if not _is_unifi_tracker(entry):
            continue
        device = dev_reg.async_get(entry.device_id) if entry.device_id else None
        if _is_service(device):
            continue
        device_name = _device_name(device)
        state = hass.states.get(entry.entity_id)
        disabled = entry.disabled_by is not None
        records.append(
            {
                "entity_id": entry.entity_id,
                "entity_name": _tracker_name(entry, device_name),
                "device_id": device.id if device else None,
                "device_name": device_name,
                "disabled": disabled,
                "disabled_by": entry.disabled_by.value if entry.disabled_by else None,
                "state": state.state if state else None,
                "status": tracker_status(state.state if state else None, disabled),
            }
        )
    records.sort(key=lambda r: ((r["device_name"] or r["entity_name"]).casefold(), r["entity_id"]))
    return records


@callback
def async_unifi_services(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Every device UniFi registers as a service, as plain data."""
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    records: list[dict[str, Any]] = []
    for entry in hass.config_entries.async_entries(UNIFI_DOMAIN):
        for device in dr.async_entries_for_config_entry(dev_reg, entry.entry_id):
            if not _is_service(device) or any(r["device_id"] == device.id for r in records):
                continue
            entities = er.async_entries_for_device(ent_reg, device.id, include_disabled_entities=True)
            records.append(
                {
                    "device_id": device.id,
                    "name": _device_name(device) or device.id,
                    "model": device.model,
                    "entity_ids": sorted(e.entity_id for e in entities if not e.disabled_by),
                    "disabled_entities": sum(1 for e in entities if e.disabled_by),
                }
            )
    records.sort(key=lambda r: (r["name"].casefold(), r["device_id"]))
    return records


@callback
def async_rename_devices_to_trackers(
    hass: HomeAssistant, entity_ids: list[str]
) -> tuple[list[dict[str, Any]], int]:
    """Name each tracker's device after the tracker.

    Returns the devices renamed, each with the name it had before
    ({"device_id", "name_by_user"}, for Undo), and how many trackers were
    skipped: not UniFi's, with no device, already named so, or on a device
    another selected tracker has renamed.
    """
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)
    changes: list[dict[str, Any]] = []
    skipped = 0
    for entity_id in entity_ids:
        entry = ent_reg.async_get(entity_id)
        device = (
            dev_reg.async_get(entry.device_id)
            if _is_unifi_tracker(entry) and entry.device_id
            else None
        )
        if device is None or any(c["device_id"] == device.id for c in changes):
            skipped += 1
            continue
        name = _tracker_name(entry, _device_name(device))
        if name == _device_name(device):
            skipped += 1
            continue
        changes.append({"device_id": device.id, "name_by_user": device.name_by_user})
        dev_reg.async_update_device(device.id, name_by_user=name)
    return changes, skipped


@callback
def async_set_device_names(hass: HomeAssistant, names: list[dict[str, Any]]) -> int:
    """Set UniFi devices' names ({"device_id", "name_by_user"}; None for
    the integration's own name), e.g. back to what they were. Returns how
    many were changed; devices that aren't UniFi's are left alone."""
    dev_reg = dr.async_get(hass)
    unifi_entries = {e.entry_id for e in hass.config_entries.async_entries(UNIFI_DOMAIN)}
    changed = 0
    for item in names:
        device = dev_reg.async_get(item["device_id"])
        if device is None or not (device.config_entries & unifi_entries):
            continue
        dev_reg.async_update_device(device.id, name_by_user=item["name_by_user"])
        changed += 1
    return changed
