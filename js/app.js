"use strict";

import { InstallationType } from "./engine.js";
import { verify } from "./verification.js";
import { proposeCooling } from "./engine.js";
import { parseCsv, parseRows } from "./bom.js";

const $ = (id) => document.getElementById(id);
const bomBody = () => document.querySelector("#bomTable tbody");

// Sample BOM is embedded so the demo works offline and from any subpath.
const SAMPLE_BOM_CSV = `Reference,Description,Quantity,Power Loss (W)
ETI-CH10x38-gPV-20A,gPV fuse link 20A 1000VDC,32,3.2
TT-DC-SW-400A,DC disconnect switch 400A,1,
TT-SPD-1000V,Surge protection device Type 2,1,8.5
Cu-branch-6mm2,Input copper branch run 6mm2,32,0.3
Cu-output-95mm2,Output copper run 95mm2,2,6.65
TT-MON-16CH,String monitoring electronics,1,3.0
TT-TB-DIN,Terminal block assembly,1,
`;

function esc(s) { return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

function evChip(d) {
  const loss = parseFloat(d.power_loss_w);
  if (!loss || loss <= 0) return `<span class="chip missing">missing</span>`;
  if (d.source === "datasheet") return `<span class="chip published">published</span>`;
  return `<span class="chip assumed">assumed</span>`;
}

function addRow(d = {}) {
  const tr = document.createElement("tr");
  const rid = "r" + (addRow._n = (addRow._n || 0) + 1);
  tr.innerHTML = `
    <td data-label="Reference"><input class="ref" name="${rid}_ref" value="${esc(d.reference || "")}" placeholder="part no" aria-label="reference"></td>
    <td data-label="Description"><input class="name" name="${rid}_name" value="${esc(d.name || "")}" placeholder="description" aria-label="description"></td>
    <td class="num" data-label="Qty"><input class="qty num" name="${rid}_qty" type="number" min="1" value="${d.quantity || 1}" aria-label="quantity"></td>
    <td class="num" data-label="Loss (W)"><input class="loss num" name="${rid}_loss" type="number" step="0.01" value="${d.power_loss_w ?? ""}" placeholder="W" aria-label="power loss watts"></td>
    <td class="evcell" data-label="Evidence">${evChip(d)}</td>
    <td><button class="delrow" title="remove" aria-label="remove row">&times;</button></td>`;
  tr.querySelector(".delrow").onclick = () => tr.remove();
  tr.querySelector(".loss").addEventListener("input", (e) => {
    e.target.closest("tr").querySelector(".evcell").innerHTML =
      evChip({ power_loss_w: parseFloat(e.target.value), source: d.source });
  });
  bomBody().appendChild(tr);
}

function readBom() {
  return [...bomBody().querySelectorAll("tr")].map((tr) => {
    const loss = parseFloat(tr.querySelector(".loss").value) || 0;
    const chip = tr.querySelector(".evcell .chip");
    let source = "user";
    if (chip && chip.classList.contains("published")) source = "datasheet";
    return {
      reference: tr.querySelector(".ref").value.trim(),
      name: tr.querySelector(".name").value.trim(),
      quantity: parseInt(tr.querySelector(".qty").value) || 1,
      power_loss_w: loss, source,
    };
  }).filter((d) => d.name);
}

function showWarnings(list) {
  $("importWarnings").innerHTML = list.map((w) => `<div>&#9888; ${esc(w)}</div>`).join("");
}

function loadDevices(devices, warnings) {
  bomBody().innerHTML = "";
  devices.forEach(addRow);
  showWarnings(warnings || []);
}

// ---- file import (CSV native, XLSX via SheetJS if available) --------------
$("bomFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      if (typeof XLSX === "undefined") {
        showWarnings(["Excel support did not load (offline?). Export the BOM to CSV and upload that instead."]);
        return;
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
      if (!aoa.length) throw new Error("Empty worksheet.");
      const { devices, warnings } = parseRows(aoa[0].map(String), aoa.slice(1).map((r) => r.map(String)));
      loadDevices(devices, warnings);
    } else {
      const text = await file.text();
      const { devices, warnings } = parseCsv(text);
      loadDevices(devices, warnings);
    }
  } catch (err) {
    showWarnings([err.message || String(err)]);
  }
});

$("loadSample").onclick = () => {
  try {
    const { devices, warnings } = parseCsv(SAMPLE_BOM_CSV);
    loadDevices(devices, warnings);
  } catch (err) { showWarnings([err.message]); }
};

$("downloadSample").onclick = (e) => {
  e.preventDefault();
  const blob = new Blob([SAMPLE_BOM_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sample-bom.csv"; a.click();
  URL.revokeObjectURL(url);
};

$("addRow").onclick = () => addRow();

$("hasVent").addEventListener("change", (e) => {
  $("ventAreaWrap").classList.toggle("hidden", !e.target.checked);
});

// ---- calculate ------------------------------------------------------------
$("calcBtn").onclick = () => {
  const devices = readBom();
  if (devices.length === 0) { showWarnings(["Add at least one component."]); return; }

  const enclosure = {
    height_m: +$("height").value, width_m: +$("width").value, depth_m: +$("depth").value,
    installation: $("installation").value,
    has_ventilation_openings: $("hasVent").checked,
    ventilation_area_cm2: +$("ventArea").value || 0,
    horizontal_partitions: +$("partitions").value || 0,
  };
  const ambient = { ambient_temp_c: +$("ambient").value, permissible_rise_k: +$("permissible").value };
  const gates = { bom_declared_complete: $("bomComplete").checked, method_confirmed: $("methodOk").checked };

  try {
    const report = verify(enclosure, devices, ambient, gates);
    const cooling = proposeCooling(report.calculation, ambient.ambient_temp_c);
    renderReport(report, cooling);
    $("printBtn").disabled = false;
  } catch (err) {
    showWarnings([err.message || String(err)]);
  }
};

$("printBtn").onclick = () => window.print();

// ---- render ---------------------------------------------------------------
function renderReport(r, cooling) {
  const calc = r.calculation, reg = r.register;
  $("placeholder").classList.add("hidden");
  const rep = $("report");
  rep.classList.remove("hidden");

  const regRows = reg.lines.map((l) => `
    <tr>
      <td>${esc(l.name)}${l.reference ? `<br><span style="color:var(--muted);font-size:11px">${esc(l.reference)}</span>` : ""}</td>
      <td class="num">${l.quantity}</td>
      <td class="num">${l.unit_loss_w || "&mdash;"}</td>
      <td class="num">${l.total_loss_w || "&mdash;"}</td>
      <td><span class="chip ${l.evidence}">${l.evidence}</span></td>
    </tr>`).join("");

  const gates = r.gates.map((g) => `
    <div class="gate ${g.satisfied ? "ok" : "no"}">
      <div class="ico">${g.satisfied ? "&#10003;" : "&#33;"}</div>
      <div><div class="g-name">${esc(g.name)}</div><div class="g-detail">${esc(g.detail)}</div></div>
    </div>`).join("");

  const checklist = r.required_before_certification.length ? `
    <div class="checklist">
      <div class="block-title" style="margin-top:0">Required before a verified result</div>
      <ul>${r.required_before_certification.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>` : "";

  const coolingBlock = cooling && cooling.needs_active_cooling ? `
    <div class="block-title">Cooling selection aid</div>
    <p class="g-detail">${esc(cooling.rationale)}</p>` : "";

  const partial = reg.is_partial ? ` <span class="chip assumed">partial model</span>` : "";

  rep.innerHTML = `
    <div class="verdict ${r.verdict}">
      <div class="tag">${r.verdict.replace("_", " ")}</div>
      <h3>${esc(r.headline)}</h3>
    </div>
    <div class="metrics">
      <div class="metric"><div class="v">${calc.delta_t_top_k} K</div><div class="l">Top rise (&Delta;t 1.0h)</div></div>
      <div class="metric"><div class="v">${calc.internal_temp_top_c} &deg;C</div><div class="l">Internal top temp</div></div>
      <div class="metric"><div class="v">${calc.effective_cooling_surface_m2} m&sup2;</div><div class="l">Effective cooling surface</div></div>
      <div class="metric"><div class="v">${reg.total_modeled_loss_w} W</div><div class="l">Modeled loss${partial}</div></div>
      <div class="metric"><div class="v">${Math.round(reg.evidence_ratio * 100)}%</div><div class="l">Datasheet-backed</div></div>
      <div class="metric"><div class="v">${calc.permissible_rise_k} K</div><div class="l">Permissible rise</div></div>
    </div>
    <div class="block-title">Loss register (by evidence quality)</div>
    <table class="reg">
      <thead><tr><th>Component</th><th class="num">Qty</th><th class="num">Unit W</th><th class="num">Total W</th><th>Evidence</th></tr></thead>
      <tbody>${regRows}</tbody>
      <tfoot><tr>
        <td colspan="3" style="text-align:right;color:var(--muted)">Published ${reg.published_loss_w} W &middot; Assumed ${reg.assumed_loss_w} W &middot; Missing ${reg.missing_count} line(s)</td>
        <td class="num"><strong>${reg.total_modeled_loss_w} W</strong></td><td></td>
      </tr></tfoot>
    </table>
    <div class="block-title">Design-verification gates</div>
    ${gates}
    ${checklist}
    ${coolingBlock}
    <div class="block-title">Calculation basis</div>
    <p class="g-detail">Method IEC TR 60890 (referenced by IEC 61439-1). k = ${calc.k_factor},
      c = ${calc.c_factor}, exponent = ${calc.exponent}, partition factor d = ${calc.partition_factor_d}.
      Ambient ${calc.ambient_temp_c} &deg;C. &Delta;t mid-height = ${calc.delta_t_mid_k} K.</p>
    <div class="block-title">Limitations</div>
    <ul class="limitations">${r.limitations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  `;
  rep.scrollIntoView({ behavior: "smooth", block: "start" });
}
