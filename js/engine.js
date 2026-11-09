"use strict";
/*
 * IEC TR 60890 temperature-rise calculation engine (client-side port).
 *
 * Deterministic method of temperature-rise verification by calculation for
 * low-voltage switchgear and controlgear assemblies, as referenced by
 * IEC 61439-1 for design verification.
 *
 * Scope (stated honestly):
 *  - Enclosures WITHOUT forced ventilation (natural convection), the primary
 *    scope of IEC TR 60890. Forced cooling and heater sizing are provided
 *    separately as engineering SELECTION AIDS, not a certified 60890 result.
 *  - Table-driven factors (surface factors, k/c curves) follow the published
 *    method and should be reconciled against the licensed standard text
 *    before any certified submission.
 *
 * This runs entirely in the browser; there is no server component.
 */

export const InstallationType = {
  FREE_STANDING_ALL_ROUND: "free_standing_all_round",
  WALL_MOUNTED: "wall_mounted",
  FREE_STANDING_END: "free_standing_covered_end",
  WALL_MOUNTED_END: "wall_mounted_covered_end",
  CENTRAL_IN_ROW: "central_in_row",
  CENTRAL_IN_ROW_WALL: "central_in_row_wall_mounted",
};

// Per-surface weighting factors b for each surface of the enclosure.
const SURFACE_FACTORS = {
  free_standing_all_round: { top: 1.4, front: 0.9, rear: 0.9, left: 0.9, right: 0.9, bottom: 0.5 },
  wall_mounted:           { top: 1.4, front: 0.9, rear: 0.5, left: 0.9, right: 0.9, bottom: 0.5 },
  free_standing_covered_end: { top: 1.4, front: 0.9, rear: 0.9, left: 0.9, right: 0.5, bottom: 0.5 },
  wall_mounted_covered_end:  { top: 1.4, front: 0.9, rear: 0.5, left: 0.9, right: 0.5, bottom: 0.5 },
  central_in_row:            { top: 1.4, front: 0.9, rear: 0.9, left: 0.5, right: 0.5, bottom: 0.5 },
  central_in_row_wall_mounted: { top: 1.4, front: 0.9, rear: 0.5, left: 0.5, right: 0.5, bottom: 0.5 },
};

// Enclosure constant k vs effective cooling surface Ae [m^2], no ventilation.
const K_NO_VENT = [
  [1.0, 0.524], [1.5, 0.465], [2.0, 0.423], [2.5, 0.396], [3.0, 0.374],
  [4.0, 0.342], [5.0, 0.321], [6.0, 0.305], [7.0, 0.293], [8.0, 0.283],
  [9.0, 0.275], [10.0, 0.268], [12.0, 0.257], [14.0, 0.248],
];

// Enclosure constant k vs ventilation opening area [cm^2], ventilated.
const K_VENT = [
  [50, 0.36], [100, 0.30], [150, 0.26], [200, 0.23], [250, 0.21],
  [300, 0.19], [400, 0.165], [500, 0.145], [600, 0.135], [700, 0.125],
];

// Temperature-distribution factor c vs geometry factor f (height/width).
const C_FACTOR = [
  [1.0, 1.225], [1.5, 1.34], [2.0, 1.43], [2.5, 1.50], [3.0, 1.554],
  [4.0, 1.63], [5.0, 1.68], [6.0, 1.71], [8.0, 1.75], [10.0, 1.78],
];

const EXP_NO_VENT = 0.804;
const EXP_VENT = 0.715;

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

function partitionFactor(n) {
  const table = { 0: 1.0, 1: 1.05, 2: 1.1, 3: 1.15 };
  return (n in table) ? table[n] : 1.15 + 0.05 * (n - 3);
}

function surfaceAreas(enc) {
  const { height_m: h, width_m: w, depth_m: d } = enc;
  return {
    top: w * d, bottom: w * d,
    front: w * h, rear: w * h,
    left: d * h, right: d * h,
  };
}

const r = (v, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(v * f) / f;
};

/** Core IEC 60890 calculation. Returns a result object. */
export function calculate(enclosure, devices, ambient) {
  const warnings = [], notes = [];

  const areas = surfaceAreas(enclosure);
  const factors = SURFACE_FACTORS[enclosure.installation] || SURFACE_FACTORS.wall_mounted;
  const breakdown = {};
  let ae = 0;
  for (const surface of Object.keys(areas)) {
    const b = factors[surface] ?? 0;
    const contribution = areas[surface] * b;
    ae += contribution;
    breakdown[surface] = {
      geometric_area_m2: r(areas[surface], 4),
      factor_b: b,
      effective_area_m2: r(contribution, 4),
    };
  }
  if (ae <= 0) throw new Error("Effective cooling surface is zero; check dimensions.");

  const totalP = devices.reduce((s, d) => s + d.quantity * d.power_loss_w, 0);
  if (totalP <= 0) {
    warnings.push("Total power loss is zero. Add device power-loss values (watts) to get a meaningful temperature rise.");
  }
  if (devices.some((d) => d.source === "estimated")) {
    warnings.push("One or more device power-loss values are estimated, not from a datasheet. Replace with datasheet values before relying on the result.");
  }

  let k, x;
  if (enclosure.has_ventilation_openings && enclosure.ventilation_area_cm2 > 0) {
    k = interp(K_VENT, enclosure.ventilation_area_cm2);
    x = EXP_VENT;
    notes.push("Ventilated-enclosure curve used (natural convection through openings). Forced ventilation is a separate selection aid, not this 60890 result.");
  } else {
    k = interp(K_NO_VENT, ae);
    x = EXP_NO_VENT;
    notes.push("Non-ventilated enclosure curve used (sealed, natural convection).");
  }

  const dFactor = partitionFactor(enclosure.horizontal_partitions | 0);
  const deltaTMid = totalP > 0 ? k * dFactor * Math.pow(totalP, x) : 0;

  const f = enclosure.height_m / Math.max(enclosure.width_m, 1e-6);
  const c = interp(C_FACTOR, f);
  const deltaTTop = c * deltaTMid;

  const internalMid = ambient.ambient_temp_c + deltaTMid;
  const internalTop = ambient.ambient_temp_c + deltaTTop;
  const margin = ambient.permissible_rise_k - deltaTTop;
  const passes = deltaTTop <= ambient.permissible_rise_k;

  if (!passes) {
    warnings.push(`Temperature rise at the top (${deltaTTop.toFixed(1)} K) exceeds the permissible rise (${ambient.permissible_rise_k.toFixed(1)} K). The assembly is under-dimensioned for heat dissipation.`);
  } else if (margin > 15) {
    notes.push(`Large margin (${margin.toFixed(1)} K). The enclosure may be over-dimensioned.`);
  }

  return {
    effective_cooling_surface_m2: r(ae, 4),
    total_power_loss_w: r(totalP),
    k_factor: r(k, 4), c_factor: r(c, 4), exponent: x,
    partition_factor_d: r(dFactor, 3),
    delta_t_mid_k: r(deltaTMid), delta_t_top_k: r(deltaTTop),
    ambient_temp_c: ambient.ambient_temp_c,
    permissible_rise_k: ambient.permissible_rise_k,
    internal_temp_mid_c: r(internalMid), internal_temp_top_c: r(internalTop),
    passes, margin_k: r(margin),
    surface_breakdown: breakdown, warnings, notes,
  };
}

// ---- cooling / heater selection aids (NOT certified 60890) ----------------
const FAN_AIR_CONSTANT = 3.1; // m^3*K/(W*h)
const ENCLOSURE_U = 5.5;      // W/(m^2*K) sheet-steel surface coefficient

export function proposeCooling(result, ambientTempC, maxInternalTempC = null) {
  if (maxInternalTempC === null) maxInternalTempC = ambientTempC + result.permissible_rise_k;
  if (result.passes) {
    return {
      needs_active_cooling: false, excess_power_w: 0, recommended_airflow_m3h: 0,
      rationale: "Natural convection is sufficient; the calculated top rise is within the permissible limit. No active cooling required.",
    };
  }
  const deltaAllowed = Math.max(maxInternalTempC - ambientTempC, 1.0);
  const overshoot = Math.min((result.delta_t_top_k - result.permissible_rise_k) / Math.max(result.delta_t_top_k, 1e-6), 1.0);
  const pExcess = result.total_power_loss_w * overshoot;
  const airflow = FAN_AIR_CONSTANT * pExcess / deltaAllowed;
  return {
    needs_active_cooling: true, excess_power_w: r(pExcess, 1), recommended_airflow_m3h: r(airflow, 1),
    rationale: `Top rise exceeds the limit. Approximately ${pExcess.toFixed(0)} W must be removed actively. A filter-fan providing at least ${airflow.toFixed(0)} m3/h at delta T = ${deltaAllowed.toFixed(0)} K is suggested. Confirm against the fan manufacturer's selection data.`,
  };
}

export function proposeHeater(enclosure, ambientMinC, minInternalC) {
  const areas = surfaceAreas(enclosure);
  const total = Object.values(areas).reduce((a, b) => a + b, 0);
  const delta = Math.max(minInternalC - ambientMinC, 0);
  const p = ENCLOSURE_U * total * delta;
  return {
    recommended_heater_w: r(p, 1),
    rationale: `To hold ${minInternalC.toFixed(0)} degC inside against a ${ambientMinC.toFixed(0)} degC ambient across ${total.toFixed(2)} m2 of surface, about ${p.toFixed(0)} W of heating is suggested (anti-condensation). Confirm against the heater manufacturer's selection data.`,
  };
}
