"use strict";
/*
 * Evidence-led verification layer (client-side port).
 *
 * Wraps the deterministic IEC 60890 calculation with:
 *   1. Evidence classification  (published / assumed / missing) per loss line.
 *   2. Design-verification gates that BLOCK the result when essential evidence
 *      is absent, instead of printing a false compliance pass.
 *
 * The verdict is a verification BY CALCULATION per IEC TR 60890, never a
 * laboratory type-test certificate.
 */

import { calculate } from "./engine.js";

export const Verdict = {
  VERIFIED: "VERIFIED",
  NOT_VERIFIED: "NOT_VERIFIED",
  BLOCKED: "BLOCKED",
};

export const EvidenceClass = {
  PUBLISHED: "published",
  ASSUMED: "assumed",
  MISSING: "missing",
};

// Minimum share of modeled loss that must be datasheet-backed before we are
// willing to report VERIFIED rather than BLOCKED.
export const MIN_EVIDENCE_RATIO = 0.80;

const r = (v, n = 2) => {
  const f = Math.pow(10, n);
  return Math.round(v * f) / f;
};

function classify(device) {
  if (device.power_loss_w <= 0) return EvidenceClass.MISSING;
  if (device.source === "datasheet") return EvidenceClass.PUBLISHED;
  return EvidenceClass.ASSUMED;
}

export function buildRegister(devices) {
  const lines = [];
  let published = 0, assumed = 0, missing = 0;
  for (const d of devices) {
    const ec = classify(d);
    const total = d.quantity * d.power_loss_w;
    if (ec === EvidenceClass.PUBLISHED) published += total;
    else if (ec === EvidenceClass.ASSUMED) assumed += total;
    else missing += 1;
    lines.push({
      name: d.name, reference: d.reference || "", quantity: d.quantity,
      unit_loss_w: r(d.power_loss_w, 3), total_loss_w: r(total, 3), evidence: ec,
    });
  }
  const modeled = published + assumed;
  const ratio = modeled > 0 ? published / modeled : 0;
  return {
    lines,
    published_loss_w: r(published), assumed_loss_w: r(assumed),
    missing_count: missing, total_modeled_loss_w: r(modeled),
    evidence_ratio: r(ratio, 3),
    is_partial: missing > 0 || assumed > 0,
  };
}

export function verify(enclosure, devices, ambient, opts = {}) {
  const bomDeclaredComplete = !!opts.bom_declared_complete;
  const methodConfirmed = !!opts.method_confirmed;

  const register = buildRegister(devices);

  const gates = [
    {
      name: "Complete populated assembly BOM",
      satisfied: bomDeclaredComplete && register.missing_count === 0,
      detail: (register.missing_count || !bomDeclaredComplete)
        ? `${register.missing_count} line(s) have no power-loss value. A verified result needs every heat source (devices, busbars, joints, SPD, auxiliaries) with a loss figure.`
        : "All lines carry a loss value and the BOM is declared complete.",
    },
    {
      name: "Loss values are datasheet-backed",
      satisfied: register.evidence_ratio >= MIN_EVIDENCE_RATIO,
      detail: `${Math.round(register.evidence_ratio * 100)}% of modeled loss is datasheet-backed (target >= ${Math.round(MIN_EVIDENCE_RATIO * 100)}%). Assumptions must be replaced with manufacturer data.`,
    },
    {
      name: "IEC TR 60890 method applicable",
      satisfied: methodConfirmed,
      detail: methodConfirmed
        ? "Method applicability confirmed for this enclosure."
        : "Confirm the enclosure is within 60890 scope (natural convection, no forced ventilation in the certified result, within the method's rating limit).",
    },
  ];

  const required = gates.filter((g) => !g.satisfied).map((g) => `${g.name}: ${g.detail}`);

  const limitations = [
    "Result is a temperature-rise verification BY CALCULATION per IEC TR 60890, as referenced by IEC 61439-1. It is not a laboratory type-test certificate.",
    "Table-driven factors (surface factors, k/c curves) follow the published 60890 method and should be reconciled against the licensed standard text before any certified submission.",
  ];
  if (register.is_partial) {
    limitations.push("The modeled loss is PARTIAL (contains assumptions and/or missing lines). It is not the assembly total; do not report it as such.");
  }

  const calc = calculate(enclosure, devices, ambient);
  const allGatesOk = gates.every((g) => g.satisfied);

  if (!allGatesOk) {
    return {
      verdict: Verdict.BLOCKED,
      headline: "Design verification BLOCKED - essential evidence missing. Numbers below are provisional screening only.",
      register, calculation: calc, gates,
      required_before_certification: required, limitations,
    };
  }

  let verdict, headline;
  if (calc.passes) {
    verdict = Verdict.VERIFIED;
    headline = `VERIFIED by calculation (IEC TR 60890). Top rise ${calc.delta_t_top_k.toFixed(1)} K is within the permissible ${calc.permissible_rise_k.toFixed(1)} K (margin ${calc.margin_k.toFixed(1)} K).`;
  } else {
    verdict = Verdict.NOT_VERIFIED;
    headline = `NOT VERIFIED - top rise ${calc.delta_t_top_k.toFixed(1)} K exceeds the permissible ${calc.permissible_rise_k.toFixed(1)} K. The assembly is under-dimensioned; add cooling or a larger enclosure.`;
  }

  return {
    verdict, headline, register, calculation: calc, gates,
    required_before_certification: required, limitations,
  };
}
