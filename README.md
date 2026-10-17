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
| **UniFi alias** | UniFi's current name for it, live from your gateway: the alias set in the UniFi Network app, or (in grey) the client's hostname when there's no alias |
| **Entity ID** | The `device_tracker` entity ID |
| **Status** | **Online** while the tracker is available, **Offline** while it's `unavailable` (or `unknown`), **Disabled** when the entity is disabled |

Tabs: **All**, **Online**, **Offline**, **Disabled**, **Name differs** and
**Alias differs**, each with a count. **Name differs** lists the trackers that aren't disabled
(online or offline) whose device's name isn't exactly the tracker's name:
the ones that may need renaming (see below). Trackers with no device aren't
listed there, as there's no device to rename. **Alias differs** lists the
trackers that aren't disabled whose device name or tracker name isn't
UniFi's current alias.

### UniFi aliases

The UniFi Network integration copies a client's alias into the tracker's
name only when it loads the tracker, and into the device's name only when
the device is first created, so both drift once you change an alias in
UniFi. The **UniFi alias** column reads the current names from the UniFi
integration's own connection to your gateway (checked every 30 seconds
while the page is open), so there's nothing to set up. That connection
isn't an official Home Assistant API: if a Home Assistant update changes
it, the column shows `—` (and the Alias differs tab says why) until this
integration is updated, and everything else keeps working.

- **Rename device to UniFi alias** names each selected tracker's device
  after its current UniFi alias, with Undo, like *Rename device to tracker
  name*.
- **Reload UniFi** reloads the UniFi Network integration, which renames
  the trackers after UniFi's current names (trackers you've renamed
  yourself keep your names). Their trackers are briefly unavailable while
  it reloads.

### Selecting trackers and renaming their devices

Tick trackers to select them: shift-click selects a range, the box in the
heading selects everything shown, and Escape clears the selection.
**Rename device to tracker name** then names each selected tracker's
device after the tracker (its name in the *Tracker name* column), as if
you'd renamed the device on its own page. Trackers with no device, and
devices already named so, are left alone. **Undo** puts the old names back
for a few seconds afterwards. **Export** saves just the selected trackers
when any are selected.

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
