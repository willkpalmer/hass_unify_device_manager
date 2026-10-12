// WP UniFi Device Manager panel - the main element,
// <unifi-device-manager-panel>: the Devices and Services lists (see
// unifi-device-manager-panel.js for how the modules fit together).

const V = new URL(import.meta.url).search;
// The version loaded, from the ?v= every module is loaded with (panel.py).
const VERSION = new URLSearchParams(V).get("v") || "";
const {
  SCROLL_KEY, VIEW_STATE_KEY, WS, downloadFile, loadJSON, loadSession, num, saveJSON,
  saveSession, serviceStatus, toCSV, toMarkdown, trackerStatus, upgradeProperties,
} = await import(`./udm-util.js${V}`);
const { STYLE, TEMPLATE } = await import(`./udm-style.js${V}`);

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
    filterPlaceholder: "Filter by device, tracker name or entity ID",
    noun: ["tracker", "trackers"],
    empty: "No UniFi device trackers found. Is the UniFi Network integration set up?",
    status: trackerStatus,
    tabs: {
      all: ["All", "Every device tracker the UniFi Network integration has imported (UniFi's services are on the Services page)."],
      online: ["Online", "Trackers that are available: UniFi is reporting the device."],
      offline: ["Offline", "Trackers that are unavailable (or unknown): UniFi isn't reporting the device."],
      disabled: ["Disabled", "Trackers disabled in Home Assistant. UniFi reports a tracker for every client it has seen, and Home Assistant only enables the ones whose MAC address belongs to a device it already has, so most of these are clients no integration has added as a device. They have no device, so they're not among the integration's devices, and Settings → Entities only lists them with its \"Show disabled entities\" filter on."],
    },
    columns: [
      { key: "device", label: "Device" },
      { key: "entity_name", label: "Tracker name" },
      { key: "entity_id", label: "Entity ID" },
      { key: "status", label: "Status" },
    ],
    defaultSort: { key: "device", dir: 1 },
    searchKeys: ["device", "entity_name", "entity_id"],
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
      };
    }
    // Where each list was scrolled to, kept for when the page is opened
    // again (e.g. Back after opening a device).
    this._scroll = loadSession(SCROLL_KEY, {});
    this._restoreScroll = true;
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
    // "/" jumps to the filter from anywhere on the page (not while typing).
    this._onWindowKey = (ev) => {
      if (!this.isConnected || this.hidden || ev.defaultPrevented) return;
      const typing = ev.composedPath().some((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "/") {
        ev.preventDefault();
        this._el("filter").focus();
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
    this._loaded = true;
    this._stateKey = "";
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
    const shown = rows.filter((r) => (st.tab === "all" || r.status === st.tab)
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
    saveJSON(VIEW_STATE_KEY, { view: this._view, ...this._state });
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
    const counts = { all: rows.length };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    for (const tab of Object.keys(view.tabs)) {
      this.shadowRoot.querySelector(`[data-tab-count="${tab}"]`).textContent = this._loaded ? num(counts[tab] || 0) : "";
      const button = this.shadowRoot.querySelector(`[data-tab="${tab}"]`);
      button.classList.toggle("active", tab === st.tab);
      button.setAttribute("aria-selected", String(tab === st.tab));
    }
    this._el("hint").textContent = view.tabs[st.tab][1];
    this._el("summary").textContent = this._loaded
      ? `${num(counts.online || 0)} online · ${num(counts.offline || 0)} offline`
      : "";

    this._renderHead();
    const shown = this._shown(rows);
    this._shownRows = shown;
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
    this._el("export-what").textContent = `${num(shown.length)} ${shown.length === 1 ? one : many} shown`;
    this._el("footer").textContent = this._loaded
      ? `Showing ${num(shown.length)} of ${num(rows.length)} ${view.footerNoun}`
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
    tr.className = "row";
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
    const viewButton = find("view");
    if (viewButton) {
      this._setView(viewButton.dataset.view);
      return;
    }
    const tab = find("tab");
    if (tab) {
      this._st().tab = tab.dataset.tab;
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
    } else if (action === "export-csv" || action === "export-md") {
      this._el("export").open = false;
      this._export(action === "export-csv" ? "csv" : "md");
    }
    // Clicking anywhere else closes the Export menu.
    if (!path.includes(this._el("export"))) this._el("export").open = false;
  }

  _export(format) {
    const view = VIEWS[this._view];
    const rows = this._shownRows || [];
    const [header, body] = this._view === "services"
      ? [["Service", "Type", "Entities", "Status"],
        rows.map((r) => [r.name, r.model, r.entities, STATUS_LABELS[r.status]])]
      : [["Device", "Tracker name", "Entity ID", "Status"],
        rows.map((r) => [r.device, r.entity_name, r.entity_id, STATUS_LABELS[r.status]])];
    const tab = this._st().tab;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const name = `unifi-${this._view}-${tab}-${stamp}`;
    if (format === "csv") downloadFile(`${name}.csv`, toCSV(header, body), "text/csv;charset=utf-8");
    else downloadFile(`${name}.md`, toMarkdown(`${view.title} (${tab}, ${stamp})`, header, body), "text/markdown;charset=utf-8");
  }
}
