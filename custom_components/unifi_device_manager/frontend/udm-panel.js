// WP UniFi Device Manager panel - the main element,
// <unifi-device-manager-panel>: the Devices and Services lists, and
// renaming devices after their trackers (see
// unifi-device-manager-panel.js for how the modules fit together).

const V = new URL(import.meta.url).search;
// The version loaded, from the ?v= every module is loaded with (panel.py).
const VERSION = new URLSearchParams(V).get("v") || "";
const {
  SCROLL_KEY, VIEW_STATE_KEY, WS, downloadFile, loadJSON, loadSession, num, saveJSON,
  saveSession, serviceStatus, toCSV, toMarkdown, trackerStatus, upgradeProperties,
} = await import(`./udm-util.js${V}`);
const { STYLE, TEMPLATE } = await import(`./udm-style.js${V}`);

// How long Undo is offered after an action.
const UNDO_MS = 8000;
// Which entries each tab shows: by default, those with the tab's status.
const TAB_FILTERS = {
  all: () => true,
  // A device named differently from its tracker (trackers with no device
  // can't be renamed).
  renamable: (r) => !r.disabled && !!r.device_id && r.device !== r.entity_name,
  // UniFi's current name isn't the device's or the tracker's.
  aliasdiffers: (r) => !r.disabled && !!r.alias
    && ((!!r.device_id && r.device !== r.alias) || r.entity_name !== r.alias),
};
const ALIAS_SOURCES = {
  hostname: "No alias set in UniFi: this is the client's hostname",
  model: "No name set in UniFi: this is the device's model",
};
function inTab(tab, r) {
  return TAB_FILTERS[tab] ? TAB_FILTERS[tab](r) : r.status === tab;
}

const STATUS_LABELS = { online: "Online", offline: "Offline", disabled: "Disabled", none: "No entities" };
// Status sorts offline first.
const STATUS_RANK = { offline: 0, online: 1, none: 2, disabled: 3 };
const DISABLED_BY = {
  integration: "Disabled by Home Assistant: no device in Home Assistant has this tracker's MAC address",
  user: "Disabled by you",
  config_entry: "Disabled because the UniFi integration entry is disabled",
  device: "Disabled because its device is disabled",
  hass: "Disabled by Home Assistant",
};

// The two pages: what each lists and how.
const VIEWS = {
  devices: {
    title: "UniFi devices",
    footerNoun: "UniFi device trackers",
    list: "trackers",
    filterPlaceholder: "Filter by device, tracker name, alias or entity ID",
    noun: ["tracker", "trackers"],
    empty: "No UniFi device trackers found. Is the UniFi Network integration set up?",
    status: trackerStatus,
    tabs: {
      all: ["All", "Every device tracker the UniFi Network integration has imported (UniFi's services are on the Services page)."],
      online: ["Online", "Trackers that are available: UniFi is reporting the device."],
      offline: ["Offline", "Trackers that are unavailable (or unknown): UniFi isn't reporting the device."],
      disabled: ["Disabled", "Trackers disabled in Home Assistant. UniFi reports a tracker for every client it has seen, and Home Assistant only enables the ones whose MAC address belongs to a device it already has, so most of these are clients no integration has added as a device. They have no device, so they're not among the integration's devices, and Settings → Entities only lists them with its \"Show disabled entities\" filter on."],
      renamable: ["Name differs", "Trackers that aren't disabled (online or offline) whose device's name isn't the same as the tracker's name: the ones that may need renaming. Select them and use Rename device to tracker name."],
      aliasdiffers: ["Alias differs", "Trackers that aren't disabled whose device's name or tracker name isn't UniFi's current name for them (the alias set in the UniFi Network app, or its hostname when there isn't one). Rename device to UniFi alias fixes the device name; Reload UniFi updates the tracker names."],
    },
    columns: [
      { key: "device", label: "Device" },
      { key: "entity_name", label: "Tracker name" },
      { key: "alias", label: "UniFi alias" },
      { key: "entity_id", label: "Entity ID" },
      { key: "status", label: "Status" },
    ],
    defaultSort: { key: "device", dir: 1 },
    searchKeys: ["device", "entity_name", "alias", "entity_id"],
    // Trackers can be selected, by entity ID.
    selectable: true,
  },
  services: {
    title: "UniFi services",
    footerNoun: "UniFi services",
    list: "services",
    filterPlaceholder: "Filter by service or type",
    noun: ["service", "services"],
    empty: "No UniFi services found. Is the UniFi Network integration set up?",
    status: serviceStatus,
    tabs: {
      all: ["All", "What the UniFi Network integration adds as services rather than devices: the UniFi Network application, its WLANs and DPI groups. A service is online while any of its entities is available."],
      online: ["Online", "Services with at least one available entity."],
      offline: ["Offline", "Services whose entities are all unavailable."],
    },
    columns: [
      { key: "name", label: "Service" },
      { key: "model", label: "Type" },
      { key: "entities", label: "Entities" },
      { key: "status", label: "Status" },
    ],
    defaultSort: { key: "name", dir: 1 },
    searchKeys: ["name", "model"],
  },
};

export class UnifiDeviceManagerPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._panel = null;
    this._data = { trackers: [], services: [] };
    this._loaded = false;
    // Whether UniFi's names (aliases) can be read (the list says).
    this._aliases = true;
    this._error = null;
    this._unsub = null;
    this._subscribing = false;
    // The states of the entities listed, as last rendered, to re-render
    // only when one of them changes (hass is set on every state change
    // anywhere).
    this._stateKey = "";
    // Each view's search, tab and sort, as left last time.
    const saved = loadJSON(VIEW_STATE_KEY, {});
    this._view = VIEWS[saved.view] ? saved.view : "devices";
    this._state = {};
    for (const [name, view] of Object.entries(VIEWS)) {
      const was = saved[name] || {};
      this._state[name] = {
        filter: typeof was.filter === "string" ? was.filter : "",
        tab: view.tabs[was.tab] ? was.tab : "all",
        sort: view.columns.some((c) => c.key === was.sort?.key)
          ? { key: was.sort.key, dir: was.sort.dir === -1 ? -1 : 1 }
          : { ...view.defaultSort },
        selected: new Set(),
        // Where a shift-click selects from.
        anchor: null,
      };
    }
    // Where each list was scrolled to, kept for when the page is opened
    // again (e.g. Back after opening a device).
    this._scroll = loadSession(SCROLL_KEY, {});
    this._restoreScroll = true;
    this._undo = null;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this._el("version").textContent = VERSION ? `v${VERSION}` : "";
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    // Column headings sort with the keyboard too.
    this.shadowRoot.addEventListener("keydown", (ev) => {
      const th = ev.composedPath()[0];
      if ((ev.key === "Enter" || ev.key === " ") && th.dataset?.sort !== undefined) {
        ev.preventDefault();
        th.click();
      }
    });
    this._el("filter").addEventListener("input", (ev) => {
      this._st().filter = ev.target.value;
      this._saveViewState();
      this._render();
    });
    this._el("scroll").addEventListener("scroll", () => {
      // Not while the list is still loading: it starts at the top.
      if (this._restoreScroll) return;
      this._scroll[this._view] = this._el("scroll").scrollTop;
      saveSession(SCROLL_KEY, this._scroll);
    }, { passive: true });
    this._onHash = () => this._applyHash();
    // "/" jumps to the filter, Escape clears the selection, from anywhere
    // on the page (not while typing).
    this._onWindowKey = (ev) => {
      if (!this.isConnected || this.hidden || ev.defaultPrevented) return;
      const typing = ev.composedPath().some((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "/") {
        ev.preventDefault();
        this._el("filter").focus();
      } else if (ev.key === "Escape" && this._st().selected.size) {
        this._st().selected.clear();
        this._render();
      }
    };
    this._syncControls();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this.isConnected) this._subscribe();
    // Online/offline follows the states Home Assistant sends.
    const ids = this._data.trackers.map((r) => r.entity_id)
      .concat(...this._data.services.map((r) => r.entity_ids));
    const key = ids.map((id) => hass.states[id]?.state ?? "").join("\n");
    if (first || key !== this._stateKey) {
      this._stateKey = key;
      this._render();
    }
  }

  get hass() { return this._hass; }

  set narrow(value) {
    this._narrow = value;
    this.toggleAttribute("narrow", !!value);
  }

  get narrow() { return this._narrow; }

  set panel(value) { this._panel = value; }

  get panel() { return this._panel; }

  connectedCallback() {
    upgradeProperties(this, ["hass", "narrow", "panel", "route"]);
    window.addEventListener("hashchange", this._onHash);
    window.addEventListener("keydown", this._onWindowKey);
    // Back where the list was, once it's there again.
    this._restoreScroll = true;
    this._applyHash();
    if (this._hass) this._subscribe();
    this._render();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    window.removeEventListener("keydown", this._onWindowKey);
    this._unsubscribe();
  }

  _st(name = this._view) { return this._state[name]; }

  _applyHash() {
    const hash = window.location.hash.replace("#", "");
    if (VIEWS[hash] && hash !== this._view) {
      this._view = hash;
      this._saveViewState();
      this._syncControls();
      this._render();
    }
  }

  _setView(view) {
    if (!VIEWS[view] || view === this._view) return;
    this._view = view;
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}#${view}`);
    this._saveViewState();
    this._syncControls();
    this._render();
    this._el("scroll").scrollTop = this._scroll[view] || 0;
  }

  _syncControls() {
    const view = VIEWS[this._view];
    const filter = this._el("filter");
    filter.placeholder = view.filterPlaceholder;
    filter.value = this._st().filter;
    const tabs = this._el("tabs");
    tabs.textContent = "";
    for (const [name, [label]] of Object.entries(view.tabs)) {
      const button = document.createElement("button");
      button.className = "tab";
      button.setAttribute("role", "tab");
      button.dataset.tab = name;
      button.textContent = label;
      const count = document.createElement("span");
      count.className = "count";
      count.dataset.tabCount = name;
      button.appendChild(count);
      tabs.appendChild(button);
    }
  }

  // -- data -----------------------------------------------------------

  async _subscribe() {
    if (this._unsub || this._subscribing || !this._hass) return;
    this._subscribing = true;
    try {
      this._unsub = await this._hass.connection.subscribeMessage(
        (msg) => this._onMessage(msg),
        { type: WS.SUBSCRIBE },
      );
      this._error = null;
    } catch (err) {
      this._error = `Couldn't load: ${err.message || err.code || err}`;
      this._render();
    } finally {
      this._subscribing = false;
    }
  }

  _unsubscribe() {
    if (this._unsub) {
      try { this._unsub(); } catch (_err) { /* connection already gone */ }
      this._unsub = null;
    }
  }

  // Both lists, again after every registry change.
  _onMessage(msg) {
    if (!msg.trackers) return;
    this._data = { trackers: msg.trackers, services: msg.services || [] };
    // Whether UniFi's names (aliases) could be read at all.
    this._aliases = msg.aliases !== false;
    this._loaded = true;
    this._stateKey = "";
    // Trackers no longer there can't stay selected.
    const ids = new Set(this._data.trackers.map((r) => r.entity_id));
    for (const id of this._st("devices").selected) if (!ids.has(id)) this._st("devices").selected.delete(id);
    this._render();
  }

  // The records of a view as shown, with their live status.
  _rows(name = this._view) {
    const view = VIEWS[name];
    const states = this._hass?.states || {};
    return this._data[view.list].map((r) => ({
      ...r,
      device: r.device_name || "",
      entities: r.entity_ids ? r.entity_ids.length : 0,
      status: view.status(r, states),
    }));
  }

  _shown(rows) {
    const view = VIEWS[this._view];
    const st = this._st();
    const q = st.filter.trim().toLowerCase();
    const shown = rows.filter((r) => inTab(st.tab, r)
      && (!q || view.searchKeys.some((k) => r[k] && String(r[k]).toLowerCase().includes(q))));
    const { key, dir } = st.sort;
    // Trackers with no device sort after the rest.
    const value = (r) => (key === "status" ? STATUS_RANK[r.status]
      : key === "entities" ? r.entities
        : key === "device" && !r.device ? "￿" : String(r[key] || "").toLowerCase());
    const id = (r) => r.entity_id || r.device_id;
    return shown.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0;
    });
  }

  _saveViewState() {
    const saved = { view: this._view };
    for (const [name, st] of Object.entries(this._state)) {
      saved[name] = { filter: st.filter, tab: st.tab, sort: st.sort };
    }
    saveJSON(VIEW_STATE_KEY, saved);
  }

  // The selected entries that are shown (actions only apply to those).
  _selectedShown() {
    const selected = this._st().selected;
    return (this._shownRows || []).filter((r) => selected.has(r.entity_id));
  }

  // -- rendering ------------------------------------------------------

  _render() {
    const view = VIEWS[this._view];
    const st = this._st();

    for (const name of Object.keys(VIEWS)) {
      this.shadowRoot.querySelector(`[data-view="${name}"]`).classList.toggle("active", name === this._view);
      const offline = this._rows(name).filter((r) => r.status === "offline").length;
      const count = this.shadowRoot.querySelector(`[data-view-count="${name}"]`);
      count.textContent = offline ? num(offline) : "";
      count.classList.toggle("alert", offline > 0);
      count.title = offline ? `${num(offline)} offline` : "";
    }

    const rows = this._rows();
    const counts = {};
    for (const tab of new Set(["online", "offline", ...Object.keys(view.tabs)])) {
      counts[tab] = rows.filter((r) => inTab(tab, r)).length;
    }
    for (const tab of Object.keys(view.tabs)) {
      this.shadowRoot.querySelector(`[data-tab-count="${tab}"]`).textContent = this._loaded ? num(counts[tab]) : "";
      const button = this.shadowRoot.querySelector(`[data-tab="${tab}"]`);
      button.classList.toggle("active", tab === st.tab);
      button.setAttribute("aria-selected", String(tab === st.tab));
    }
    this._el("hint").textContent = st.tab === "aliasdiffers" && this._loaded && !this._aliases
      ? "UniFi's current names can't be read right now: is the UniFi Network integration loaded? (If it is, a Home Assistant update may have changed how it keeps them, and this needs an update too.)"
      : view.tabs[st.tab][1];
    this._el("summary").textContent = this._loaded
      ? `${num(counts.online || 0)} online · ${num(counts.offline || 0)} offline`
      : "";

    const shown = this._shown(rows);
    this._shownRows = shown;
    this._renderHead();
    const body = this._el("body");
    body.textContent = "";
    for (const r of shown) {
      body.appendChild(this._view === "services" ? this._renderService(r) : this._renderTracker(r));
    }

    const status = this._el("status");
    if (this._error) status.textContent = this._error;
    else if (!this._loaded) status.textContent = "Loading…";
    else if (!rows.length) status.textContent = view.empty;
    else if (!shown.length) status.textContent = st.filter ? "Nothing matches the filter." : "None here.";
    else status.textContent = "";

    const [one, many] = view.noun;
    const selected = view.selectable ? this._selectedShown() : [];
    this._el("export-what").textContent = selected.length
      ? `${num(selected.length)} selected`
      : `${num(shown.length)} ${shown.length === 1 ? one : many} shown`;
    const rename = this._el("rename");
    rename.hidden = !view.selectable;
    const renamable = selected.filter((r) => r.device_id).length;
    rename.disabled = !renamable;
    rename.textContent = renamable > 1 ? `Rename ${num(renamable)} devices to tracker names` : "Rename device to tracker name";
    const renameAlias = this._el("rename-alias");
    renameAlias.hidden = !view.selectable;
    const aliasable = selected.filter((r) => r.device_id && r.alias).length;
    renameAlias.disabled = !aliasable;
    renameAlias.textContent = aliasable > 1 ? `Rename ${num(aliasable)} devices to UniFi aliases` : "Rename device to UniFi alias";
    this._el("reload-unifi").hidden = !view.selectable;
    this._el("footer").textContent = this._loaded
      ? `Showing ${num(shown.length)} of ${num(rows.length)} ${view.footerNoun}${selected.length ? ` · ${num(selected.length)} selected` : ""}`
      : "";

    // Back where the list was (e.g. Back after opening a device).
    if (this._restoreScroll && this._loaded && this.isConnected) {
      this._el("scroll").scrollTop = this._scroll[this._view] || 0;
      this._restoreScroll = false;
    }
  }

  _renderHead() {
    const st = this._st();
    const head = this._el("head");
    head.textContent = "";
    if (VIEWS[this._view].selectable) {
      const th = document.createElement("th");
      th.className = "check";
      const all = document.createElement("input");
      all.type = "checkbox";
      all.dataset.selectAll = "";
      all.title = "Select all shown";
      all.setAttribute("aria-label", "Select all shown");
      const shown = this._shownRows.length;
      const selected = this._selectedShown().length;
      all.checked = shown > 0 && selected === shown;
      all.indeterminate = selected > 0 && selected < shown;
      th.appendChild(all);
      head.appendChild(th);
    }
    for (const col of VIEWS[this._view].columns) {
      const th = document.createElement("th");
      th.textContent = col.label;
      th.classList.add("sortable");
      th.dataset.sort = col.key;
      th.tabIndex = 0;
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = st.sort.key === col.key ? (st.sort.dir === 1 ? "▲" : "▼") : "";
      th.appendChild(arrow);
      th.setAttribute("aria-sort", st.sort.key === col.key ? (st.sort.dir === 1 ? "ascending" : "descending") : "none");
      head.appendChild(th);
    }
  }

  // A link to a device's page in Home Assistant.
  _deviceCell(deviceId, name) {
    const td = document.createElement("td");
    td.className = "name";
    if (deviceId) {
      const a = document.createElement("a");
      a.href = `/config/devices/device/${encodeURIComponent(deviceId)}`;
      a.dataset.nav = "";
      a.textContent = name || "(unnamed device)";
      a.title = "Open the device's page";
      td.appendChild(a);
    } else {
      td.classList.add("no-device");
      td.textContent = "—";
      td.title = "This tracker isn't linked to a device";
    }
    return td;
  }

  _statusCell(r) {
    const td = document.createElement("td");
    td.className = "when";
    const chip = document.createElement("span");
    chip.className = `chip ${r.status}`;
    chip.textContent = STATUS_LABELS[r.status];
    if (r.status === "disabled") chip.title = DISABLED_BY[r.disabled_by] || "Disabled";
    td.appendChild(chip);
    return td;
  }

  _renderTracker(r) {
    const tr = document.createElement("tr");
    const selected = this._st().selected.has(r.entity_id);
    tr.className = `row selectable${selected ? " selected" : ""}`;
    const tdCheck = document.createElement("td");
    tdCheck.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.row = r.entity_id;
    cb.checked = selected;
    cb.setAttribute("aria-label", `Select ${r.entity_name}`);
    cb.title = "Select (shift-click to select a range)";
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);
    tr.appendChild(this._deviceCell(r.device_id, r.device));

    // Tracker name: opens Home Assistant's entity dialog.
    const tdName = document.createElement("td");
    tdName.className = "name";
    const name = document.createElement("a");
    name.href = "#";
    name.dataset.moreInfo = r.entity_id;
    name.textContent = r.entity_name;
    name.title = "Show the tracker's details";
    tdName.appendChild(name);
    tr.appendChild(tdName);

    // UniFi's current name: its alias, or in grey its hostname (or model).
    const tdAlias = document.createElement("td");
    tdAlias.className = "name";
    if (r.alias) {
      tdAlias.textContent = r.alias;
      if (ALIAS_SOURCES[r.alias_source]) {
        tdAlias.classList.add("fallback");
        tdAlias.title = ALIAS_SOURCES[r.alias_source];
      }
    } else {
      tdAlias.textContent = "—";
      tdAlias.title = this._aliases ? "UniFi doesn't know this tracker any more" : "UniFi's names can't be read right now";
    }
    tr.appendChild(tdAlias);

    const tdId = document.createElement("td");
    tdId.className = "entity-id";
    tdId.textContent = r.entity_id;
    tr.appendChild(tdId);

    tr.appendChild(this._statusCell(r));
    return tr;
  }

  _renderService(r) {
    const tr = document.createElement("tr");
    tr.className = "row";
    tr.appendChild(this._deviceCell(r.device_id, r.name));

    const tdModel = document.createElement("td");
    tdModel.textContent = r.model || "";
    tr.appendChild(tdModel);

    const tdEntities = document.createElement("td");
    tdEntities.textContent = num(r.entities);
    if (r.disabled_entities) tdEntities.title = `Plus ${num(r.disabled_entities)} disabled`;
    tr.appendChild(tdEntities);

    tr.appendChild(this._statusCell(r));
    return tr;
  }

  // -- actions --------------------------------------------------------

  _onClick(ev) {
    const path = ev.composedPath();
    const find = (key) => path.find((el) => el.dataset && el.dataset[key] !== undefined);

    const moreInfo = find("moreInfo");
    if (moreInfo) {
      ev.preventDefault();
      // Home Assistant's own entity dialog.
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: moreInfo.dataset.moreInfo }, bubbles: true, composed: true,
      }));
      return;
    }
    const link = find("nav");
    if (link) {
      ev.preventDefault();
      // Where the list is, for Back.
      this._scroll[this._view] = this._el("scroll").scrollTop;
      saveSession(SCROLL_KEY, this._scroll);
      // Opens a page of Home Assistant's, as its own links do.
      history.pushState(null, "", link.getAttribute("href"));
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    const rowCheck = find("row");
    if (rowCheck) {
      this._toggleRow(rowCheck, ev.shiftKey);
      return;
    }
    const selectAll = find("selectAll");
    if (selectAll) {
      const st = this._st();
      for (const r of this._shownRows) {
        if (selectAll.checked) st.selected.add(r.entity_id);
        else st.selected.delete(r.entity_id);
      }
      st.anchor = null;
      this._render();
      return;
    }
    const viewButton = find("view");
    if (viewButton) {
      this._setView(viewButton.dataset.view);
      return;
    }
    const tab = find("tab");
    if (tab) {
      this._st().tab = tab.dataset.tab;
      this._st().selected.clear();
      this._saveViewState();
      this._el("scroll").scrollTop = 0;
      this._render();
      return;
    }
    const sort = find("sort");
    if (sort) {
      const st = this._st();
      const key = sort.dataset.sort;
      st.sort = st.sort.key === key ? { key, dir: -st.sort.dir } : { key, dir: 1 };
      this._saveViewState();
      this._render();
      return;
    }
    const action = find("action")?.dataset.action;
    if (action === "menu") {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    } else if (action === "rename") {
      this._renameDevices(WS.RENAME_TO_TRACKER, "rename", (r) => r.device_id);
    } else if (action === "rename-alias") {
      this._renameDevices(WS.RENAME_TO_ALIAS, "rename-alias", (r) => r.device_id && r.alias);
    } else if (action === "reload-unifi") {
      this._reloadUnifi();
    } else if (action === "undo") {
      this._runUndo();
    } else if (action === "export-csv" || action === "export-md") {
      this._el("export").open = false;
      this._export(action === "export-csv" ? "csv" : "md");
    }
    // Clicking anywhere else closes the Export menu.
    if (!path.includes(this._el("export"))) this._el("export").open = false;
  }

  // A row's checkbox; with shift, every row from the last one clicked
  // takes the same state.
  _toggleRow(cb, shift) {
    const st = this._st();
    const ids = this._shownRows.map((r) => r.entity_id);
    const from = shift && st.anchor ? ids.indexOf(st.anchor) : -1;
    const to = ids.indexOf(cb.dataset.row);
    const range = from >= 0 && to >= 0
      ? ids.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [cb.dataset.row];
    for (const id of range) {
      if (cb.checked) st.selected.add(id);
      else st.selected.delete(id);
    }
    st.anchor = cb.dataset.row;
    this._render();
  }

  // Names the selected trackers' devices (after the trackers, or after
  // UniFi's names for them), then offers Undo (their names as they were)
  // for a few seconds.
  async _renameDevices(type, buttonEl, canRename) {
    const entityIds = this._selectedShown().filter(canRename).map((r) => r.entity_id);
    if (!entityIds.length) return;
    const button = this._el(buttonEl);
    button.disabled = true;
    let result;
    try {
      result = await this._hass.callWS({ type, entity_ids: entityIds });
    } catch (err) {
      alert(`WP UniFi Device Manager: ${err.message || err.code || err}`);
      this._render();
      return;
    }
    this._st().selected.clear();
    this._render();
    const renamed = `Renamed ${num(result.renamed)} device${result.renamed === 1 ? "" : "s"}`;
    const skipped = result.skipped ? ` · ${num(result.skipped)} unchanged` : "";
    this._showUndo(
      `${renamed}${skipped}`,
      result.undo.length ? { type: WS.SET_NAMES, names: result.undo } : null,
    );
  }

  // Reloads the UniFi integration, which names the trackers after UniFi's
  // current names; the list follows once it's back.
  async _reloadUnifi() {
    const button = this._el("reload-unifi");
    button.disabled = true;
    this._showUndo("Reloading UniFi…", null);
    try {
      await this._hass.callWS({ type: WS.RELOAD_UNIFI });
      this._showUndo("UniFi reloaded: tracker names now follow UniFi's names", null);
    } catch (err) {
      this._hideUndo();
      alert(`WP UniFi Device Manager: ${err.message || err.code || err}`);
    } finally {
      button.disabled = false;
    }
  }

  _showUndo(message, undo) {
    clearTimeout(this._undoTimer);
    this._undo = undo;
    this._el("snack-text").textContent = message;
    this.shadowRoot.querySelector('[data-action="undo"]').hidden = !undo;
    this._el("snackbar").classList.add("open");
    this._undoTimer = setTimeout(() => this._hideUndo(), UNDO_MS);
  }

  _hideUndo() {
    clearTimeout(this._undoTimer);
    this._undo = null;
    this._el("snackbar").classList.remove("open");
  }

  async _runUndo() {
    const undo = this._undo;
    this._hideUndo();
    if (!undo) return;
    try {
      await this._hass.callWS(undo);
    } catch (err) {
      alert(`WP UniFi Device Manager: ${err.message || err.code || err}`);
    }
  }

  _export(format) {
    const view = VIEWS[this._view];
    const selected = view.selectable ? this._selectedShown() : [];
    const rows = selected.length ? selected : this._shownRows || [];
    const [header, body] = this._view === "services"
      ? [["Service", "Type", "Entities", "Status"],
        rows.map((r) => [r.name, r.model, r.entities, STATUS_LABELS[r.status]])]
      : [["Device", "Tracker name", "UniFi alias", "Entity ID", "Status"],
        rows.map((r) => [r.device, r.entity_name, r.alias, r.entity_id, STATUS_LABELS[r.status]])];
    const tab = this._st().tab;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const name = `unifi-${this._view}-${tab}-${stamp}`;
    if (format === "csv") downloadFile(`${name}.csv`, toCSV(header, body), "text/csv;charset=utf-8");
    else downloadFile(`${name}.md`, toMarkdown(`${view.title} (${tab}, ${stamp})`, header, body), "text/markdown;charset=utf-8");
  }
}
