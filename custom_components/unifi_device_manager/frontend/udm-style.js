// WP UniFi Device Manager panel - the page's styles and markup (see
// unifi-device-manager-panel.js for how the modules fit together). The
// look follows WP Log Doctor's panel.

export const STYLE = `
:host {
  /* Fills the window; only the list scrolls, so everything above it and
     the column headings stay in view. */
  display: flex; flex-direction: column;
  height: 100vh; height: 100dvh;
  background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121);
  font-family: var(--paper-font-body1_-_font-family, var(--ha-font-family-body, Roboto, sans-serif));
  font-size: 14px;
}
* { box-sizing: border-box; }
.header {
  display: flex; align-items: center; gap: 8px;
  height: var(--header-height, 56px); padding: 0 16px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff);
  flex: none;
}
.header h1 { font-size: 20px; font-weight: 400; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.header .version { font-size: 13px; opacity: 0.8; margin-left: 4px; }
.header .summary { font-size: 13px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
.menu-btn { display: none; background: none; border: 0; color: inherit; font-size: 22px; cursor: pointer; padding: 4px 8px; }
:host([narrow]) .menu-btn { display: inline-block; }
.content {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
  width: 100%; max-width: 1400px; margin: 0 auto; padding: 16px;
}
.views { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; flex: none; }
.view {
  font: inherit; font-weight: 500; padding: 8px 16px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
}
.view.active { background: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
/* Offline trackers, on the view button and the tabs: shown when there are
   any, red on the button. */
.view .count, .tab .count {
  display: inline-block; min-width: 20px; margin-left: 4px; padding: 0 6px; border-radius: 10px;
  font-size: 12px; font-weight: 600; line-height: 18px; text-align: center;
  background: rgba(127, 127, 127, 0.18); color: inherit;
}
.view .count:empty, .tab .count:empty { display: none; }
.view .count.alert { background: var(--error-color, #db4437); color: #fff; }
.card {
  background: var(--card-background-color, #fff);
  border-radius: var(--ha-card-border-radius, 12px);
  border: 1px solid var(--divider-color, #e0e0e0);
  overflow: hidden;
  flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.card > .tabs, .card > .toolbar, .card > .footer { flex: none; }
.tabs { display: flex; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.tab {
  flex: 0 0 auto; padding: 12px 20px; background: none; border: 0;
  border-bottom: 2px solid transparent; color: var(--secondary-text-color, #727272);
  font: inherit; font-weight: 500; cursor: pointer;
}
.tab.active { color: var(--primary-color, #03a9f4); border-bottom-color: var(--primary-color, #03a9f4); }
.tab:focus-visible, .view:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: -2px; }
/* What the current tab holds. */
.hint { padding: 8px 16px 0; color: var(--secondary-text-color, #727272); font-size: 12px; flex: none; }
.hint:empty { display: none; }
/* Export: a small menu. */
.export { position: relative; }
.export summary { list-style: none; }
.export summary::-webkit-details-marker { display: none; }
.export .menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 3; display: grid; min-width: 220px;
  background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); overflow: hidden;
}
.export .menu button {
  font: inherit; text-align: left; padding: 10px 14px; border: 0; background: none; cursor: pointer; color: var(--primary-text-color, #212121);
}
.export .menu button:hover, .export .menu button:focus-visible { background: var(--secondary-background-color, #f5f5f5); }
.export .menu .sub { padding: 6px 14px 8px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; }
.toolbar input[type=search], .toolbar select {
  font: inherit; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--divider-color, #ccc);
  background: var(--secondary-background-color, #f5f5f5); color: inherit;
}
.toolbar input[type=search] { flex: 1 1 220px; min-width: 160px; }
.spacer { flex: 1 1 auto; }
.action {
  font: inherit; font-weight: 500; padding: 8px 14px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--primary-color, #03a9f4); background: var(--primary-color, #03a9f4);
  color: var(--text-primary-color, #fff);
}
.action.secondary { background: transparent; color: var(--primary-color, #03a9f4); }
.action:disabled { opacity: 0.4; cursor: default; }
.export summary.action { display: inline-block; user-select: none; }
.export[open] summary.action { background: rgba(3, 169, 244, 0.08); }
/* Undo, after an action. */
.snackbar {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 5;
  display: none; align-items: center; gap: 16px; max-width: calc(100vw - 32px);
  padding: 10px 12px 10px 16px; border-radius: 8px;
  background: var(--primary-text-color, #323232); color: var(--primary-background-color, #fff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.snackbar.open { display: flex; }
.snackbar button {
  font: inherit; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
  border: 0; background: none; color: var(--primary-color, #03a9f4); padding: 6px 8px;
}
.action[hidden] { display: none; }
.table-wrap { flex: 0 1 auto; min-height: 0; overflow: auto; }
thead th {
  position: sticky; top: 0; z-index: 1;
  background: var(--card-background-color, #fff);
  box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
}
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th, td { text-align: left; padding: 8px 12px; border-top: 1px solid var(--divider-color, #e0e0e0); vertical-align: top; }
th { font-weight: 500; color: var(--secondary-text-color, #727272); white-space: nowrap; user-select: none; }
th.sortable { cursor: pointer; }
th.sortable:hover { color: var(--primary-text-color, #212121); }
th .arrow { display: inline-block; width: 1em; }
td.check, th.check { width: 36px; padding-right: 0; }
td.when { white-space: nowrap; font-variant-numeric: tabular-nums; }
td.entity-id { word-break: break-all; min-width: 160px; font-family: var(--code-font-family, monospace); font-size: 13px; }
td.name { min-width: 160px; word-break: break-word; }
/* UniFi has no alias for it: its hostname (or model), in grey. */
.fallback { color: var(--secondary-text-color, #727272); font-style: italic; }
tbody tr.row:hover { background: var(--secondary-background-color, rgba(0,0,0,0.03)); }
tbody tr.row.selected { background: rgba(3, 169, 244, 0.1); }
input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color, #03a9f4); }
a { color: var(--primary-color, #03a9f4); text-decoration: none; }
a:hover { text-decoration: underline; }
.sub { color: var(--secondary-text-color, #727272); font-size: 12px; }
.chip {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  padding: 1px 7px; border-radius: 10px; margin-right: 6px; text-transform: uppercase; white-space: nowrap;
}
.chip.online { background: rgba(76, 175, 80, 0.15); color: var(--success-color, #43a047); }
.chip.offline { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
.chip.disabled, .chip.none { background: rgba(127, 127, 127, 0.15); color: var(--secondary-text-color, #727272); }
.empty, .status { padding: 32px 16px; text-align: center; color: var(--secondary-text-color, #727272); }
.status:empty { display: none; }
.footer { padding: 8px 16px 12px; color: var(--secondary-text-color, #727272); font-size: 12px; }
.label { display: none; }

/* Phones: one card per entry; the column headers become sort buttons. */
@media (max-width: 700px) {
  .content { padding: 8px; }
  table, thead, tbody { display: block; }
  thead tr {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px;
    padding: 6px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  thead {
    position: sticky; top: 0; z-index: 1; background: var(--card-background-color, #fff);
    box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
  }
  thead th { border: 0; padding: 6px 2px; position: static; box-shadow: none; }
  tbody tr.row {
    display: grid; grid-template-columns: 1fr; row-gap: 3px;
    padding: 10px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  tbody tr.row.selectable { grid-template-columns: 30px 1fr; column-gap: 10px; }
  tbody tr.row td { border: 0; padding: 0; min-width: 0; text-align: left; }
  tbody tr.row.selectable td { grid-column: 2; }
  tbody tr.row.selectable td.check { grid-column: 1; grid-row: 1 / span 8; }
  tbody tr.row td.no-device { display: none; }
  tbody tr.row td.when { font-size: 12px; color: var(--secondary-text-color, #727272); }
  /* The tabs scroll sideways rather than run off the card. */
  .tabs { overflow-x: auto; scrollbar-width: none; }
  .tab { white-space: nowrap; padding: 12px 14px; }
  .label { display: inline; }
  .header .summary { max-width: 45%; font-size: 12px; }
}

/* Too short for a fixed top part (e.g. a phone held sideways): the whole
   page scrolls instead. */
@media (max-height: 520px) {
  :host { height: auto; min-height: 100vh; display: block; }
  .content, .card { display: block; }
  .table-wrap { overflow: visible; overflow-x: auto; }
  thead, thead th { position: static; }
}
`;

export const TEMPLATE = `
<div class="header">
  <button class="menu-btn" title="Menu" aria-label="Menu" data-action="menu">&#9776;</button>
  <h1>UniFi Device Manager <span class="version" data-el="version"></span></h1>
  <span class="summary" data-el="summary"></span>
</div>
<div class="content">
  <nav class="views" aria-label="Pages">
    <button class="view" data-view="devices">Devices<span class="count" data-view-count="devices"></span></button>
    <button class="view" data-view="services">Services<span class="count" data-view-count="services"></span></button>
  </nav>
  <div class="card">
    <div class="tabs" role="tablist" data-el="tabs"></div>
    <div class="hint" data-el="hint"></div>
    <div class="toolbar">
      <input type="search" data-el="filter" aria-label="Filter" title="Filter (press / to jump here)">
      <span class="spacer"></span>
      <button class="action" data-action="rename" data-el="rename" disabled
        title="Name each selected tracker's device after the tracker (the name shown under Tracker name)">Rename device to tracker name</button>
      <button class="action" data-action="rename-alias" data-el="rename-alias" disabled
        title="Name each selected tracker's device after its current name in UniFi (the name shown under UniFi alias)">Rename device to UniFi alias</button>
      <button class="action secondary" data-action="reload-unifi" data-el="reload-unifi"
        title="Reload the UniFi Network integration: the trackers are renamed after UniFi's current names (trackers you've renamed yourself keep your names)">Reload UniFi</button>
      <details class="export" data-el="export">
        <summary class="action secondary" role="button" title="Save the entries shown (or just the selected ones) as a file">Export</summary>
        <div class="menu">
          <div class="sub" data-el="export-what"></div>
          <button data-action="export-csv">CSV (spreadsheet)</button>
          <button data-action="export-md">Markdown (GitHub, forums)</button>
        </div>
      </details>
    </div>
    <div class="table-wrap" data-el="scroll">
      <table>
        <thead><tr data-el="head"></tr></thead>
        <tbody data-el="body"></tbody>
      </table>
      <div class="status" data-el="status">Loading…</div>
    </div>
    <div class="footer" data-el="footer"></div>
  </div>
</div>
<div class="snackbar" data-el="snackbar" role="status" aria-live="polite">
  <span data-el="snack-text"></span>
  <button data-action="undo">Undo</button>
</div>
`;
