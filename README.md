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
| **Device** | The device the tracker belongs to (links to its device page), with manufacturer, model and UniFi site; `—` when the tracker isn't linked to a device |
| **Tracker name** | The `device_tracker` entity's name (click for Home Assistant's entity dialog) |
| **Entity ID** | The `device_tracker` entity ID |
| **Status** | **Online** while the tracker is available, **Offline** while it's `unavailable` (or `unknown`), **Disabled** when the entity is disabled; with its state (e.g. `home`, `not_home`) and since when |

- Tabs: **All**, **Online**, **Offline** and **Disabled**, each with a
  count; the **Devices** button shows the number offline in red.
- Live: status follows Home Assistant's states as they change, and
  trackers added, renamed or removed appear straight away.
- Filter by device, tracker name, entity ID, manufacturer, model, site or
  state (press `/` to jump to the filter); sort by any column.
- Export what's shown as CSV or Markdown.
- The tab, filter and sort are remembered in the browser.
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
