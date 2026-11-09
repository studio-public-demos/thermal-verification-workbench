"use strict";
/*
 * Bill-of-materials import (client-side).
 *
 * Parses a CSV bill of materials and maps columns to the device model used by
 * the IEC 60890 engine. Column names are matched flexibly (case-insensitive,
 * common synonyms, unit suffixes stripped) so a user can feed their own export
 * format with minimal editing.
 *
 * Excel (.xlsx) import is handled in the UI layer via the SheetJS library,
 * which hands rows to parseRows() here.
 */

const NAME_KEYS = new Set(["name", "description", "item", "component", "device", "designation"]);
const QTY_KEYS = new Set(["qty", "quantity", "count", "nos", "no", "pcs"]);
const LOSS_KEYS = new Set(["power loss", "loss", "power loss w", "watts", "w", "heat", "heat dissipation", "dissipation", "pv", "power dissipation"]);
const REF_KEYS = new Set(["ref", "reference", "part", "part no", "part number", "catalog", "mpn", "order no"]);

function normalize(header) {
  let h = String(header).trim().toLowerCase();
  if (h.includes("(")) h = h.split("(")[0];
  for (const ch of ["_", "-", "/", ".", ":"]) h = h.split(ch).join(" ");
  return h.replace(/\s+/g, " ").trim();
}

function matches(header, keys) {
  const h = normalize(header);
  if (keys.has(h)) return true;
  const squashed = h.replace(/\s+/g, "");
  for (const k of keys) {
    if (squashed === k.replace(/\s+/g, "").replace(/_/g, "")) return true;
  }
  if (keys === LOSS_KEYS && (h.includes("loss") || h.includes("watt") || ["w", "pv", "heat", "dissipation"].includes(h))) return true;
  return false;
}

function resolveColumns(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    if (!("name" in map) && matches(h, NAME_KEYS)) map.name = idx;
    else if (!("qty" in map) && matches(h, QTY_KEYS)) map.qty = idx;
    else if (!("loss" in map) && matches(h, LOSS_KEYS)) map.loss = idx;
    else if (!("ref" in map) && matches(h, REF_KEYS)) map.ref = idx;
  });
  return map;
}

function toFloat(v) {
  if (v == null) return 0;
  let s = String(v).trim().replace(/,/g, "").toLowerCase().replace(/w/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : 1;
}

export function parseRows(headers, rows) {
  const warnings = [];
  const cols = resolveColumns(headers);
  if (!("name" in cols)) {
    throw new Error("Could not find a component name/description column. Expected one of: name, description, item, component, device.");
  }
  if (!("loss" in cols)) {
    warnings.push("No power-loss (watts) column detected. Devices imported with 0 W; enter power-loss values before calculating.");
  }

  const devices = [];
  for (const row of rows) {
    if (!row.some((c) => String(c).trim())) continue;
    const name = (cols.name < row.length ? String(row[cols.name]) : "").trim();
    if (!name) continue;
    const qty = "qty" in cols && cols.qty < row.length ? toInt(row[cols.qty]) : 1;
    const loss = "loss" in cols && cols.loss < row.length ? toFloat(row[cols.loss]) : 0;
    const ref = "ref" in cols && cols.ref < row.length ? String(row[cols.ref]).trim() : "";
    devices.push({ name, quantity: qty, power_loss_w: loss, source: loss > 0 ? "datasheet" : "user", reference: ref });
  }
  if (devices.length === 0) throw new Error("No usable rows found in the bill of materials.");
  return { devices, warnings };
}

/** Minimal, dependency-free CSV parser (handles quoted fields and commas). */
export function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* ignore */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) throw new Error("Empty CSV.");
  const headers = rows[0];
  return parseRows(headers, rows.slice(1));
}
