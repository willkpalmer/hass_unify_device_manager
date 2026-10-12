"""WebSocket commands for the UniFi Device Manager sidebar panel.

unifi_device_manager/devices/subscribe sends the UniFi device trackers
(see devices.py) straight away ({"records"}) and again whenever the entity
or device registry changes, so trackers added, renamed or removed appear
live. The panel follows each tracker's state (online or offline) from the
states Home Assistant already sends it.

Admin-only, like the panel itself.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED

from .devices import TRACKER_DOMAIN, async_unifi_trackers

WS_SUBSCRIBE = "unifi_device_manager/devices/subscribe"


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_subscribe)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_SUBSCRIBE})
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    @callback
    def _send() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"records": async_unifi_trackers(hass)})
        )

    @callback
    def _entity_changed(event: Event) -> None:
        if event.data.get("entity_id", "").startswith(f"{TRACKER_DOMAIN}."):
            _send()

    @callback
    def _device_changed(event: Event) -> None:
        _send()

    unsubs = [
        hass.bus.async_listen(EVENT_ENTITY_REGISTRY_UPDATED, _entity_changed),
        hass.bus.async_listen(EVENT_DEVICE_REGISTRY_UPDATED, _device_changed),
    ]

    @callback
    def _unsubscribe() -> None:
        for unsub in unsubs:
            unsub()

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    _send()
