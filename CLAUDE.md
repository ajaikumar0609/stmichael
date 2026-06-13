# St. Michael Group of Companies — Project Memory

## Business Context
- **Client:** St. Michael Group of Companies
- **Location:** Palayamkottai, Tirunelveli, Tamil Nadu
- **Sectors:** Timber, Fisheries, Finance/Chits, Construction, Agriculture (Motors/Tractors), Real Estate

## Tech Stack
- **Pure Vanilla HTML5 + CSS3** — no JS framework (no React, Vue, etc.)
- **Architecture:** Multi-Page Application (MPA) — separate `.html` per vertical
- **CSS:** Embedded inline `<style>` blocks inside each HTML file's `<head>` (not external `.css` files)
- **Deployment:** Vercel (`.vercel` directory present)

## Pages
| File | Division |
|------|----------|
| `index.html` | Landing page / General overview (largest file) |
| `motors.html` | Agriculture, Motors & Tractors |
| `timber.html` | Timber & Sawmill |

## Asset Structure
- **Root-level loose images:** `Construction.jpeg`, `Farms.png`, `Fisheries.png`, `Furniture.png`, etc.
- **Subdirectories:** `motors/`, `timber and sawmil images/`, `videos/`

## ⚠️ Critical: Unconventional Workflow (Python Patch Scripts)
The previous developer used Python scripts for brute-force find-and-replace on hardcoded `<style>` blocks and DOM elements — instead of editing CSS/HTML directly.

**Scripts present (do not run unless you understand what they change):**
- `fix_blur.py`, `fix_full_bg.py`, `fix_glass.py`, `fix_hero_fit.py`, `fix_hero_fit2.py`
- `fix_image_stuff.py`, `fix_mobile_grid.py`, `fix_premium_layout.py`
- `make_hero_full.py`, `patch_tractor_size.py`, `remove_spec_tags.py`
- `replace_motors.py`, `replace_svg.py`, `update_styles.py`

**Going forward:** Edit HTML/CSS directly. Scripts can be deleted once confirmed that their changes are baked into the current HTML state.

## Technical Debt (Priority Order)
1. **Extract CSS** — Pull inline `<style>` blocks from all 3 HTML files into external files (e.g., `global.css`, `hero.css`, page-specific partials)
2. **Delete patch scripts** — Once confirmed applied, they serve no ongoing purpose
3. **Organize assets** — Move root-level images into `assets/img/` or `public/`
4. **Consider templating** — Migrate to Astro, 11ty, or Next.js to reuse header/footer components instead of duplicating across pages

## Notes for Future Work
- CSS spans thousands of lines embedded in HTML — be careful with large-scale edits
- No build tool or preprocessor is currently in use
- The site is currently live on Vercel
