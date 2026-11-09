# Attributions

This showcase uses the following external components. All are loaded over
HTTPS or referenced by standard; none are redistributed in modified form.

## Libraries

**Name:** SheetJS (xlsx) Community Edition
**Creator:** SheetJS LLC
**Source:** https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
**Licence:** Apache License 2.0
**Modifications:** None. Loaded from the jsDelivr CDN at runtime; used only to
read the first worksheet of an uploaded `.xlsx` bill of materials in the
browser. CSV import works without this library.
**Attribution requirements:** Apache-2.0 notice preserved in the distributed
library file; not vendored or altered here.

## Standards referenced (not reproduced)

**Name:** IEC TR 60890 — A method of temperature-rise verification of
low-voltage switchgear and controlgear assemblies by calculation
**Creator:** International Electrotechnical Commission (IEC)
**Source:** https://webstore.iec.ch/en/publication/66007
**Licence:** Proprietary (IEC copyright). Not reproduced in this repository.
**Modifications:** None. The application implements the public structure of
the calculation method. The standard's exact tabulated factor values are the
property of the IEC and must be licensed for any certified use.
**Attribution requirements:** IEC retains all rights to the standard text.

**Name:** IEC 61439-1 — Low-voltage switchgear and controlgear assemblies
**Creator:** International Electrotechnical Commission (IEC)
**Source:** https://webstore.iec.ch/en/publication/5457
**Licence:** Proprietary (IEC copyright). Not reproduced in this repository.
**Modifications:** None. Referenced for the design-verification context only.
**Attribution requirements:** IEC retains all rights to the standard text.

## Sample data

**Name:** Example solar DC combiner bill of materials
**Creator:** Nebula Cloud (synthetic, for demonstration)
**Source:** Embedded in this repository (`js/app.js`, `SAMPLE_BOM_CSV`).
**Licence:** MIT (same as this repository's showcase materials).
**Modifications:** N/A — created for this demo. Component references and
power-loss figures are illustrative and must not be used for real design
decisions.
**Attribution requirements:** None.

## Fonts

System font stack only (Segoe UI / system-ui / sans-serif). No web fonts are
bundled or loaded.
