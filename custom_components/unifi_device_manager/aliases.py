"""The names UniFi itself has for each tracker, live from the gateway.

The UniFi Network integration copies a client's name ("alias", as set in
the UniFi Network app, or else its hostname) into the tracker's name only
when the tracker is loaded, and into the device's name only when the device
is first created, so both drift from UniFi once an alias changes. This
reads the current names from the integration's own connection to the
gateway: its UnifiHub (the config entry's runtime_data) and the aiounifi
client and device lists it keeps up to date.

That's the UniFi integration's internal state, not an API Home Assistant
promises to keep, so every lookup is guarded: if it changes shape, the
aliases are simply unknown (None) and the rest of the panel carries on.
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import UNIFI_DOMAIN

_LOGGER = logging.getLogger(__name__)

SOURCE_ALIAS = "alias"
SOURCE_HOSTNAME = "hostname"
SOURCE_MODEL = "model"


def _client_name(client: Any) -> tuple[str, str] | None:
    # As the integration names a client tracker: its alias, else hostname.
    if name := getattr(client, "name", ""):
        return name, SOURCE_ALIAS
    if hostname := getattr(client, "hostname", ""):
        return hostname, SOURCE_HOSTNAME
    return None


def _device_name(device: Any) -> tuple[str, str] | None:
    # As the integration names a UniFi device's tracker: its name, else model.
    if name := getattr(device, "name", ""):
        return name, SOURCE_ALIAS
    if model := getattr(device, "model", ""):
        return model, SOURCE_MODEL
    return None


@callback
def async_unifi_aliases(hass: HomeAssistant) -> dict[str, dict[str, str]] | None:
    """UniFi's current name for each UniFi tracker, by entity ID:
    {"alias": name, "source": "alias" | "hostname" | "model"}.

    None when the names can't be read at all (UniFi not loaded, or its
    internals have changed); trackers UniFi doesn't know are left out.
    """
    ent_reg = er.async_get(hass)
    aliases: dict[str, dict[str, str]] = {}
    readable = False
    for entry in hass.config_entries.async_entries(UNIFI_DOMAIN):
        if entry.state is not ConfigEntryState.LOADED:
            continue
        try:
            hub = entry.runtime_data
            api = hub.api
            site = hub.site
            sources = (
                (api.clients, _client_name),
                (api.clients_all, _client_name),
                (api.devices, _device_name),
            )
            for tracker in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
                if tracker.domain != "device_tracker" or not tracker.unique_id:
                    continue
                # Client trackers' unique IDs are "<site>-<mac>"; UniFi
                # devices' are just "<mac>".
                mac = tracker.unique_id.removeprefix(f"{site}-")
                for handler, name_of in sources:
                    if (obj := handler.get(mac)) is not None and (found := name_of(obj)):
                        aliases[tracker.entity_id] = {"alias": found[0], "source": found[1]}
                        break
            readable = True
        except Exception:  # noqa: BLE001 - the UniFi integration's internals
            _LOGGER.debug("Couldn't read UniFi's names for %s", entry.title, exc_info=True)
    return aliases if readable else None
