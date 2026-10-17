"""WebSocket commands for the UniFi Device Manager sidebar panel.

unifi_device_manager/devices/subscribe sends the UniFi device trackers and
services (see devices.py) straight away ({"trackers", "services"}) and
again shortly after the entity or device registry changes, so trackers and
services added, renamed or removed appear live. The panel follows each
one's state (online or offline) from the states Home Assistant already
sends it.

Each tracker carries UniFi's current name for it (its alias, see
aliases.py), checked every ALIAS_CHECK_INTERVAL and sent again when one
changes; "aliases" says whether they could be read at all.

unifi_device_manager/devices/rename_to_tracker and
unifi_device_manager/devices/rename_to_alias name the devices of the given
trackers after the trackers or after UniFi's names for them, and
unifi_device_manager/devices/set_names sets device names back (the panel's
Undo). unifi_device_manager/devices/reload_unifi reloads the UniFi
integration, which renames the trackers after UniFi's current names.

Admin-only, like the panel itself.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED
from homeassistant.helpers.event import async_call_later, async_track_time_interval

from .aliases import async_unifi_aliases
from .const import UNIFI_DOMAIN
from .devices import (
    async_rename_devices_to_aliases,
    async_rename_devices_to_trackers,
    async_set_device_names,
    async_unifi_services,
    async_unifi_trackers,
)

WS_SUBSCRIBE = "unifi_device_manager/devices/subscribe"
WS_RENAME_TO_TRACKER = "unifi_device_manager/devices/rename_to_tracker"
WS_RENAME_TO_ALIAS = "unifi_device_manager/devices/rename_to_alias"
WS_SET_NAMES = "unifi_device_manager/devices/set_names"
WS_RELOAD_UNIFI = "unifi_device_manager/devices/reload_unifi"

# How often UniFi's names are checked for changes while the panel is open.
ALIAS_CHECK_INTERVAL = timedelta(seconds=30)

# Registry changes come in bursts (e.g. while UniFi sets up): one update
# for each burst, this long after it starts.
_DEBOUNCE_SECONDS = 1


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_rename_to_tracker)
    websocket_api.async_register_command(hass, websocket_rename_to_alias)
    websocket_api.async_register_command(hass, websocket_set_names)
    websocket_api.async_register_command(hass, websocket_reload_unifi)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_SUBSCRIBE})
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    last_aliases: list = [None]

    @callback
    def _send() -> None:
        last_aliases[0] = async_unifi_aliases(hass)
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {
                    "trackers": async_unifi_trackers(hass),
                    "services": async_unifi_services(hass),
                    "aliases": last_aliases[0] is not None,
                },
            )
        )

    @callback
    def _check_aliases(_now: Any) -> None:
        if async_unifi_aliases(hass) != last_aliases[0]:
            _send()

    pending: list = []

    @callback
    def _send_later(_now: Any) -> None:
        pending.clear()
        _send()

    @callback
    def _registry_changed(event: Event) -> None:
        if not pending:
            pending.append(async_call_later(hass, _DEBOUNCE_SECONDS, _send_later))

    unsubs = [
        hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, _registry_changed),
        hass.bus.async_listen(EVENT_DEVICE_REGISTRY_UPDATED, _registry_changed),
        async_track_time_interval(hass, _check_aliases, ALIAS_CHECK_INTERVAL),
    ]

    @callback
    def _unsubscribe() -> None:
        for unsub in unsubs + pending:
            unsub()

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    _send()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_RENAME_TO_TRACKER,
        vol.Required("entity_ids"): vol.All([str], vol.Length(max=10_000)),
    }
)
@callback
def websocket_rename_to_tracker(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    changes, skipped = async_rename_devices_to_trackers(hass, msg["entity_ids"])
    connection.send_result(msg["id"], {"renamed": len(changes), "skipped": skipped, "undo": changes})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_RENAME_TO_ALIAS,
        vol.Required("entity_ids"): vol.All([str], vol.Length(max=10_000)),
    }
)
@callback
def websocket_rename_to_alias(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    changes, skipped = async_rename_devices_to_aliases(hass, msg["entity_ids"])
    connection.send_result(msg["id"], {"renamed": len(changes), "skipped": skipped, "undo": changes})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SET_NAMES,
        vol.Required("names"): vol.All(
            [{vol.Required("device_id"): str, vol.Required("name_by_user"): vol.Any(str, None)}],
            vol.Length(max=10_000),
        ),
    }
)
@callback
def websocket_set_names(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    connection.send_result(msg["id"], {"count": async_set_device_names(hass, msg["names"])})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_RELOAD_UNIFI})
@websocket_api.async_response
async def websocket_reload_unifi(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    entries = [
        e for e in hass.config_entries.async_entries(UNIFI_DOMAIN) if not e.disabled_by
    ]
    for entry in entries:
        await hass.config_entries.async_reload(entry.entry_id)
    connection.send_result(msg["id"], {"count": len(entries)})
