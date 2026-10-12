"""WebSocket commands for the UniFi Device Manager sidebar panel.

unifi_device_manager/devices/subscribe sends the UniFi device trackers and
services (see devices.py) straight away ({"trackers", "services"}) and
again shortly after the entity or device registry changes, so trackers and
services added, renamed or removed appear live. The panel follows each
one's state (online or offline) from the states Home Assistant already
sends it.

Admin-only, like the panel itself.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
from homeassistant.helpers.entity_registry import EVENT_ENTITY_REGISTRY_UPDATED
from homeassistant.helpers.event import async_call_later

from .devices import async_unifi_services, async_unifi_trackers

WS_SUBSCRIBE = "unifi_device_manager/devices/subscribe"

# Registry changes come in bursts (e.g. while UniFi sets up): one update
# for each burst, this long after it starts.
_DEBOUNCE_SECONDS = 1


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
            websocket_api.event_message(
                msg["id"],
                {"trackers": async_unifi_trackers(hass), "services": async_unifi_services(hass)},
            )
        )

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
    ]

    @callback
    def _unsubscribe() -> None:
        for unsub in unsubs + pending:
            unsub()

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    _send()
