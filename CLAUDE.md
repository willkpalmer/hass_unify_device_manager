# Working in this repository

## Always commit completed changes

When a change is complete, commit it (with a clear, descriptive message) and
push it to the working branch straight away. Don't leave finished work
uncommitted in the working tree.

## Check changes before committing

Run the tests (`pytest`, see `requirements_test.txt`; CI runs them on
every push) and, for panel changes, `node --check` each file in
`custom_components/unifi_device_manager/frontend/` and look at the page in
a browser. The panel is plain JavaScript modules with no build step:
`unifi-device-manager-panel.js` loads the others with its own `?v=` query,
and each module imports the ones it needs the same way, so they're never
mixed across versions.

## Look and feel

The panel matches WP Log Doctor's (github.com/willkpalmer/hass_logdoctor):
the same header, view buttons, card with tabs, toolbar, table, chips and
phone layout (`frontend/udm-style.js` follows its `ld-style.js`). Keep new
screens consistent with it.

## Only release when asked

Don't create a release unless the user explicitly asks for one. Until
then, finished changes are committed and pushed to the working branch
only: don't bump `"version"` in
`custom_components/unifi_device_manager/manifest.json` and don't merge into
`main` (`.github/workflows/release.yml` creates a `v<version>` release
(e.g. `v0.1.0`), which HACS offers as an update, whenever `main` carries a
version that hasn't been released yet).

When the user asks for a release: bump `"version"` once for everything
since the last release (semantic versioning: patch for fixes only, minor
if there are features), commit, merge the working branch into `main` and
push, then confirm the release exists. The first release is `v0.1.0`, the
version the manifest starts at, so it needs no bump.
