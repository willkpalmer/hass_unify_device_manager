// WP UniFi Device Manager panel - shared constants and helpers (see
// unifi-device-manager-panel.js for how the modules fit together).

export const WS = {
  SUBSCRIBE: "unifi_device_manager/devices/subscribe",
};

// Where the page's search, tab and sort are remembered, per browser.
export const VIEW_STATE_KEY = "unifi_device_manager.view_state";

// A tracker is offline while unavailable or unknown (devices.py).
export const OFFLINE_STATES = ["unavailable", "unknown"];

// Online, offline or disabled, from the tracker's current state.
export function statusOf(record, stateObj) {
  if (record.disabled) return "disabled";
  const state = stateObj ? stateObj.state : null;
  return state == null || OFFLINE_STATES.includes(state) ? "offline" : "online";
}

// localStorage, which can be unavailable (private windows, blocked
// storage): reads fall back, writes are skipped.
export function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    // Not remembered; it still works for this visit.
  }
}

// Offers text as a file to save.
export function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV with a header row; every cell quoted.
export function toCSV(header, rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

// A Markdown table; "|" and line breaks in cells are escaped.
export function toMarkdown(title, header, rows) {
  const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const lines = [`# ${title}`, "", `| ${header.map(cell).join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
  for (const row of rows) lines.push(`| ${row.map(cell).join(" | ")} |`);
  return lines.join("\n") + "\n";
}

// "1,234" with the browser's grouping.
export function num(n) {
  return Number(n || 0).toLocaleString();
}

// Home Assistant can create a panel's element, and set its hass, narrow and
// panel, before the element's code has finished loading (the modules load
// one after another). Those values then sit on the element itself and hide
// the class's setters, so it would never hear about them: move them over.
export function upgradeProperties(element, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(element, name)) {
      const value = element[name];
      delete element[name];
      element[name] = value;
    }
  }
}
