// WP UniFi Device Manager panel - the main element,
// <unifi-device-manager-panel>: the device list (see
// unifi-device-manager-panel.js for how the modules fit together).

const V = new URL(import.meta.url).search;
// The version loaded, from the ?v= every module is loaded with (panel.py).
const VERSION = new URLSearchParams(V).get("v") || "";
const {
  VIEW_STATE_KEY, WS, downloadFile, loadJSON, num, saveJSON, statusOf, toCSV, toMarkdown,
  upgradeProperties,
} = await import(`./udm-util.js${V}`);
const { STYLE, TEMPLATE } = await import(`./udm-style.js${V}`);

const TABS = ["all", "online", "offline", "disabled"];
const TAB_HINTS = {
  all: "Every device tracker the UniFi Network integration has imported.",
  online: "Trackers that are available: the device is known to UniFi and reporting.",
  offline: "Trackers that are unavailable (or unknown): UniFi isn't reporting them.",
  disabled: "Trackers disabled in Home Assistant; they have no state until enabled again.",
};
// Status sorts offline first, then online, then disabled.
const STATUS_RANK = { offline: 0, online: 1, disabled: 2 };
const STATUS_LABELS = { online: "Online", offline: "Offline", disabled: "Disabled" };

// The columns: what each shows and how it sorts.
const COLUMNS = [
  { key: "device", label: "Device", sortable: true },
  { key: "entity_name", label: "Tracker name", sortable: true },
  { key: "entity_id", label: "Entity ID", sortable: true },
  { key: "status", label: "Status", sortable: true },
];
const DEFAULT_SORT = { key: "device", dir: 1 };

export class UnifiDeviceManagerPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._panel = null;
    this._records = [];
    this._loaded = false;
    this._error = null;
    this._unsub = null;
    this._subscribing = false;
    // The trackers' states as last rendered, to re-render only when one
    // of them changes (hass is set on every state change anywhere).
    this._stateKey = "";
    // The search, tab and sort, as left last time.
    const saved = loadJSON(VIEW_STATE_KEY, {});
    this._filter = typeof saved.filter === "string" ? saved.filter : "";
    this._tab = TABS.includes(saved.tab) ? saved.tab : "all";
    this._sort = COLUMNS.some((c) => c.key === saved.sort?.key)
      ? { key: saved.sort.key, dir: saved.sort.dir === -1 ? -1 : 1 }
      : { ...DEFAULT_SORT };
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this._el("version").textContent = VERSION ? `v${VERSION}` : "";
    this._el("filter").value = this._filter;
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
      this._filter = ev.target.value;
      this._saveViewState();
      this._render();
    });
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
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._formatters();
    if (this.isConnected) this._subscribe();
    // Online/offline follows the states Home Assistant sends.
    const key = this._records.map((r) => {
      const s = hass.states[r.entity_id];
      return s ? `${s.state}|${s.last_changed}|${s.attributes.friendly_name || ""}` : "";
    }).join("\n");
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
    window.addEventListener("keydown", this._onWindowKey);
    if (this._hass) this._subscribe();
    this._render();
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this._onWindowKey);
    this._unsubscribe();
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

  // The whole list, again after every registry change.
  _onMessage(msg) {
    if (!msg.records) return;
    this._records = msg.records;
    this._loaded = true;
    this._stateKey = "";
    this._render();
  }

  // A tracker as shown: its name and status from the live state when
  // there is one, otherwise as the integration last sent them.
  _row(r) {
    const s = this._hass?.states?.[r.entity_id];
    return {
      ...r,
      entity_name: s?.attributes?.friendly_name || r.entity_name,
      device: r.device_name || "",
      state: s ? s.state : r.state,
      last_changed: s ? s.last_changed : r.last_changed,
      status: this._hass ? statusOf(r, s) : r.status,
    };
  }

  _rows() {
    return this._records.map((r) => this._row(r));
  }

  _shown(rows) {
    const q = this._filter.trim().toLowerCase();
    const shown = rows.filter((r) => (this._tab === "all" || r.status === this._tab)
      && (!q || [r.device, r.entity_name, r.entity_id, r.manufacturer, r.model, r.site, r.state]
        .some((v) => v && String(v).toLowerCase().includes(q))));
    const { key, dir } = this._sort;
    // Trackers with no device sort after the rest.
    const value = (r) => (key === "status" ? STATUS_RANK[r.status]
      : key === "device" && !r.device ? "\uffff" : String(r[key] || "").toLowerCase());
    return shown.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
    });
  }

  _saveViewState() {
    saveJSON(VIEW_STATE_KEY, { filter: this._filter, tab: this._tab, sort: this._sort });
  }

  // -- formatting -----------------------------------------------------

  _formatters() {
    // Shown in Home Assistant's time zone.
    const timeZone = this._hass?.config?.time_zone || undefined;
    const make = (locale, opts) => {
      try { return new Intl.DateTimeFormat(locale, { ...opts, timeZone }); }
      catch (_err) { return new Intl.DateTimeFormat(locale, opts); }
    };
    this._fmtDate = make("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
    this._fmtTime = make("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }

  _dateTime(iso) {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime()) || !this._fmtDate) return "";
    return `${this._fmtDate.format(d)} ${this._fmtTime.format(d)}`;
  }

  // -- rendering ------------------------------------------------------

  _render() {
    const rows = this._rows();
    const counts = { all: rows.length, online: 0, offline: 0, disabled: 0 };
    for (const r of rows) counts[r.status] += 1;

    const viewCount = this._el("view-count");
    viewCount.textContent = counts.offline ? num(counts.offline) : "";
    viewCount.classList.toggle("alert", counts.offline > 0);
    viewCount.title = counts.offline ? `${num(counts.offline)} offline` : "";
    for (const tab of TABS) {
      this.shadowRoot.querySelector(`[data-tab-count="${tab}"]`).textContent = this._loaded ? num(counts[tab]) : "";
      const button = this.shadowRoot.querySelector(`[data-tab="${tab}"]`);
      button.classList.toggle("active", tab === this._tab);
      button.setAttribute("aria-selected", String(tab === this._tab));
    }
    this._el("hint").textContent = TAB_HINTS[this._tab];
    this._el("summary").textContent = this._loaded
      ? `${num(counts.online)} online · ${num(counts.offline)} offline`
      : "";

    this._renderHead();
    const shown = this._shown(rows);
    this._shownRows = shown;
    const body = this._el("body");
    body.textContent = "";
    for (const r of shown) body.appendChild(this._renderRow(r));

    const status = this._el("status");
    if (this._error) status.textContent = this._error;
    else if (!this._loaded) status.textContent = "Loading…";
    else if (!this._records.length) status.textContent = "No UniFi device trackers found. Is the UniFi Network integration set up?";
    else if (!shown.length) status.textContent = this._filter ? "Nothing matches the filter." : "None here.";
    else status.textContent = "";

    this._el("export-what").textContent = `${num(shown.length)} tracker${shown.length === 1 ? "" : "s"} shown`;
    this._el("footer").textContent = this._loaded
      ? `Showing ${num(shown.length)} of ${num(rows.length)} UniFi device trackers`
      : "";
  }

  _renderHead() {
    const head = this._el("head");
    head.textContent = "";
    for (const col of COLUMNS) {
      const th = document.createElement("th");
      th.textContent = col.label;
      if (col.sortable) {
        th.classList.add("sortable");
        th.dataset.sort = col.key;
        th.tabIndex = 0;
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = this._sort.key === col.key ? (this._sort.dir === 1 ? "▲" : "▼") : "";
        th.appendChild(arrow);
        th.setAttribute("aria-sort", this._sort.key === col.key ? (this._sort.dir === 1 ? "ascending" : "descending") : "none");
      }
      head.appendChild(th);
    }
  }

  _renderRow(r) {
    const tr = document.createElement("tr");
    tr.className = "row";

    // Device: links to Home Assistant's device page.
    const tdDevice = document.createElement("td");
    tdDevice.className = "name";
    if (r.device_id) {
      const a = document.createElement("a");
      a.href = `/config/devices/device/${encodeURIComponent(r.device_id)}`;
      a.dataset.nav = "";
      a.textContent = r.device || "(unnamed device)";
      a.title = "Open the device's page";
      tdDevice.appendChild(a);
    } else {
      tdDevice.classList.add("no-device");
      tdDevice.textContent = "—";
      tdDevice.title = "This tracker isn't linked to a device";
    }
    const details = [r.manufacturer, r.model, r.site].filter(Boolean).join(" · ");
    if (details) {
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = details;
      tdDevice.appendChild(sub);
    }
    tr.appendChild(tdDevice);

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

    // Status, with the tracker's state and since when.
    const tdStatus = document.createElement("td");
    tdStatus.className = "when";
    const chip = document.createElement("span");
    chip.className = `chip ${r.status}`;
    chip.textContent = STATUS_LABELS[r.status];
    tdStatus.appendChild(chip);
    if (r.status !== "disabled") {
      const sub = document.createElement("div");
      sub.className = "sub";
      const since = this._dateTime(r.last_changed);
      sub.textContent = [r.state, since && `since ${since}`].filter(Boolean).join(" · ");
      tdStatus.appendChild(sub);
    }
    tr.appendChild(tdStatus);
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
      // Opens a page of Home Assistant's, as its own links do.
      history.pushState(null, "", link.getAttribute("href"));
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    const tab = find("tab");
    if (tab) {
      this._tab = tab.dataset.tab;
      this._saveViewState();
      this._el("scroll").scrollTop = 0;
      this._render();
      return;
    }
    const sort = find("sort");
    if (sort) {
      const key = sort.dataset.sort;
      this._sort = this._sort.key === key ? { key, dir: -this._sort.dir } : { key, dir: 1 };
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
    const header = ["Device", "Manufacturer", "Model", "Site", "Tracker name", "Entity ID", "Status", "State", "Since"];
    const body = (this._shownRows || []).map((r) => [
      r.device, r.manufacturer, r.model, r.site, r.entity_name, r.entity_id,
      STATUS_LABELS[r.status], r.state, this._dateTime(r.last_changed),
    ]);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const name = `unifi-devices-${this._tab}-${stamp}`;
    if (format === "csv") downloadFile(`${name}.csv`, toCSV(header, body), "text/csv;charset=utf-8");
    else downloadFile(`${name}.md`, toMarkdown(`UniFi devices (${this._tab}, ${stamp})`, header, body), "text/markdown;charset=utf-8");
  }
}
