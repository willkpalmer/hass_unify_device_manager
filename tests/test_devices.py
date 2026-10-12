"""The UniFi device trackers listed on the panel (devices.py)."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry, ConfigEntryDisabler
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from custom_components.unifi_device_manager.devices import (
    STATUS_DISABLED,
    STATUS_OFFLINE,
    STATUS_ONLINE,
    async_unifi_services,
    async_unifi_trackers,
    tracker_status,
)


def _unifi_entry(hass) -> ConfigEntry:
    entry = ConfigEntry(
        domain="unifi",
        title="Home site",
        data={},
        source="user",
        version=1,
        minor_version=1,
        options={},
        unique_id="site",
        discovery_keys={},
        subentries_data=None,
    )
    hass.config_entries._entries[entry.entry_id] = entry
    return entry


def test_tracker_status():
    assert tracker_status("home", False) == STATUS_ONLINE
    assert tracker_status("not_home", False) == STATUS_ONLINE
    assert tracker_status("unavailable", False) == STATUS_OFFLINE
    assert tracker_status("unknown", False) == STATUS_OFFLINE
    assert tracker_status(None, False) == STATUS_OFFLINE
    assert tracker_status(None, True) == STATUS_DISABLED


async def test_lists_only_unifi_trackers(hass):
    entry = _unifi_entry(hass)
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    device = dev_reg.async_get_or_create(
        config_entry_id=entry.entry_id,
        connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:dd:ee:ff")},
        name="Office AP",
        manufacturer="Ubiquiti Networks",
        model="U6-Lite",
    )
    ent_reg.async_get_or_create(
        "device_tracker", "unifi", "ap", config_entry=entry, device_id=device.id,
        original_name="Office AP", suggested_object_id="office_ap",
    )
    ent_reg.async_get_or_create(
        "device_tracker", "unifi", "phone", config_entry=entry,
        original_name="Phone", suggested_object_id="phone",
    )
    ent_reg.async_get_or_create(
        "device_tracker", "unifi", "old", config_entry=entry,
        original_name="Old laptop", suggested_object_id="old_laptop",
        disabled_by=er.RegistryEntryDisabler.USER,
    )
    # Not UniFi's, and not a tracker: left out.
    ent_reg.async_get_or_create("device_tracker", "mobile_app", "x", suggested_object_id="other")
    ent_reg.async_get_or_create("sensor", "unifi", "rx", config_entry=entry, suggested_object_id="rx")

    hass.states.async_set("device_tracker.office_ap", "home", {"friendly_name": "Office AP"})
    hass.states.async_set("device_tracker.phone", "unavailable", {"friendly_name": "Phone"})

    records = {r["entity_id"]: r for r in async_unifi_trackers(hass)}
    assert set(records) == {
        "device_tracker.office_ap", "device_tracker.phone", "device_tracker.old_laptop",
    }
    ap = records["device_tracker.office_ap"]
    assert ap["status"] == STATUS_ONLINE
    assert ap["device_id"] == device.id
    assert ap["device_name"] == "Office AP"
    # The tracker's own name, not the friendly name with the device's in front.
    assert ap["entity_name"] == "Office AP"
    assert records["device_tracker.phone"]["status"] == STATUS_OFFLINE
    assert records["device_tracker.phone"]["device_id"] is None
    old = records["device_tracker.old_laptop"]
    assert old["status"] == STATUS_DISABLED
    assert old["entity_name"] == "Old laptop"
    assert old["disabled_by"] == "user"


async def test_services_listed_apart(hass):
    entry = _unifi_entry(hass)
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    wlan = dev_reg.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("unifi", "wlan1")},
        name="Home WiFi",
        model="UniFi WLAN",
        entry_type=dr.DeviceEntryType.SERVICE,
    )
    ent_reg.async_get_or_create(
        "switch", "unifi", "wlan1", config_entry=entry, device_id=wlan.id,
        suggested_object_id="home_wifi",
    )
    ent_reg.async_get_or_create(
        "image", "unifi", "wlan1_qr", config_entry=entry, device_id=wlan.id,
        suggested_object_id="home_wifi_qr", disabled_by=er.RegistryEntryDisabler.INTEGRATION,
    )
    # A tracker on a service is listed with the service, not as a device.
    ent_reg.async_get_or_create(
        "device_tracker", "unifi", "svc", config_entry=entry, device_id=wlan.id,
        suggested_object_id="svc",
    )
    dev_reg.async_get_or_create(
        config_entry_id=entry.entry_id,
        connections={(dr.CONNECTION_NETWORK_MAC, "aa:bb:cc:dd:ee:01")},
        name="Switch",
    )

    assert async_unifi_trackers(hass) == []
    services = async_unifi_services(hass)
    assert len(services) == 1
    assert services[0]["name"] == "Home WiFi"
    assert services[0]["model"] == "UniFi WLAN"
    assert services[0]["entity_ids"] == ["device_tracker.svc", "switch.home_wifi"]
    assert services[0]["disabled_entities"] == 1


def test_modules_import():
    # The panel, WebSocket commands and config flow load without errors.
    from custom_components.unifi_device_manager import config_flow, panel, websocket_api  # noqa: F401


async def test_rename_devices_to_trackers(hass):
    from custom_components.unifi_device_manager.devices import (
        async_rename_devices_to_trackers,
        async_set_device_names,
    )

    entry = _unifi_entry(hass)
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)

    def device(mac, name, name_by_user=None):
        d = dev_reg.async_get_or_create(
            config_entry_id=entry.entry_id,
            connections={(dr.CONNECTION_NETWORK_MAC, mac)},
            name=name,
        )
        return dev_reg.async_update_device(d.id, name_by_user=name_by_user) if name_by_user else d

    def tracker(uid, device_id, original_name):
        return ent_reg.async_get_or_create(
            "device_tracker", "unifi", uid, config_entry=entry, device_id=device_id,
            original_name=original_name, suggested_object_id=uid,
        ).entity_id

    phone = device("aa:00:00:00:00:01", "Pixel-10", name_by_user="Old name")
    tv = device("aa:00:00:00:00:02", "Living room TV")
    phone_tracker = tracker("phone", phone.id, "Will's Pixel")
    tv_tracker = tracker("tv", tv.id, "Living room TV")  # already named so
    no_device = tracker("loose", None, "Loose client")

    changes, skipped = async_rename_devices_to_trackers(
        hass, [phone_tracker, tv_tracker, no_device, "light.not_a_tracker"]
    )
    assert changes == [{"device_id": phone.id, "name_by_user": "Old name"}]
    assert skipped == 3
    assert dev_reg.async_get(phone.id).name_by_user == "Will's Pixel"
    assert dev_reg.async_get(tv.id).name_by_user is None

    # Undo.
    assert async_set_device_names(hass, changes) == 1
    assert dev_reg.async_get(phone.id).name_by_user == "Old name"
