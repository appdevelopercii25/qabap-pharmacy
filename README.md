# Al Qabas Pharmacy — 2026 website redesign

Source of truth for the redesign of www.qabaspharmacy.com (Wix). The live Wix site is
rebuilt in the classic Wix Editor with Wix Multilingual (English + Arabic).

| Folder | What it holds |
| --- | --- |
| `content/` | All site copy, English and Arabic, one JSON per language with identical keys. Edit here first, then update Wix. |
| `prototype/` | Reference homepage. `index.template.html` + `build.js` produce `index.html` (bilingual, EN/AR toggle). |
| `assets/` | Brand assets. `logo-alqabas.png` is the current logo from the live site. |
| `docs/` | Wix build sheet and decisions. |

Build the prototype: `node prototype/build.js`, then open `prototype/index.html`.

Facts in the content come from the 2025 company profile (QP Profile 25.pdf). Items still
to be confirmed by Al Qabas: Arabic slogan, partner logos, photos, working hours.
