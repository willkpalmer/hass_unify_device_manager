# WP UniFi Device Manager

A Home Assistant custom integration that adds a **UniFi Devices** page to
the sidebar for managing the devices imported by Home Assistant's
[UniFi Network](https://www.home-assistant.io/integrations/unifi/)
integration. Its look and feel matches
[WP Log Doctor](https://github.com/willkpalmer/hass_logdoctor).

It only reads Home Assistant's registries and states; it never changes
anything.

## The Devices page

One row per `device_tracker` entity the UniFi Network integration has
registered (network clients and UniFi's own devices alike):

| Column | What it shows |
|---|---|
| **Device** | The device the tracker belongs to (links to its device page); `—` when the tracker isn't linked to a device |
| **Tracker name** | The tracker's own name, without the device's name in front (click for Home Assistant's entity dialog) |
| **Entity ID** | The `device_tracker` entity ID |
| **Status** | **Online** while the tracker is available, **Offline** while it's `unavailable` (or `unknown`), **Disabled** when the entity is disabled |

Tabs: **All**, **Online**, **Offline** and **Disabled**, each with a count.

### Where disabled trackers come from

UniFi reports a tracker for every client it has seen, and Home Assistant
only enables the ones whose MAC address belongs to a device it already has
(one added by another integration, for example). The rest are created
*disabled by the integration*: they have no device, so they don't show
among the UniFi integration's devices, and **Settings → Entities** only
lists them with its *Show disabled entities* filter on. Hover over a
Disabled chip to see who disabled it.

## The Services page

What the UniFi Network integration adds as services rather than devices
(the UniFi Network application, its WLANs and DPI groups), with their type
and number of entities. A service is **Online** while any of its entities
is available, **Offline** when none is.

## On both pages

- The **Devices** and **Services** buttons show the number offline in red.
- Live: status follows Home Assistant's states as they change, and
  anything added, renamed or removed appears straight away.
- Filter (press `/` to jump to it), sort by any column, and export what's
  shown as CSV or Markdown.
- Each page's tab, filter and sort are remembered in the browser, and
  going Back after opening a device returns to the same place in the list.
- Admins only.

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories** → add
   `https://github.com/willkpalmer/hass_unify_device_manager`, type
   **Integration**.
2. Install **WP UniFi Device Manager** and restart Home Assistant.
3. **Settings → Devices & services → Add integration →
   WP UniFi Device Manager.**

Releases are tagged `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`); HACS offers each
new release as an update.

### Manual

Copy `custom_components/unifi_device_manager` into your Home Assistant
`config/custom_components/` folder, restart, and add the integration as
above.

## Requirements

- Home Assistant 2024.4 or later.
- The UniFi Network integration set up (the page is empty without it).
