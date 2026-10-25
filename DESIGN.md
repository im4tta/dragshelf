---
name: Drag Shelf
description: A familiar collection shelf with a companion delivery workspace.
colors:
  charcoal: "#242520"
  surface: "#2c2d27"
  cream: "#f4f5ee"
  muted: "#8d8f83"
  yellow: "#f5c63a"
  control: "#43453b"
  control-hover: "#50534a"
  tile: "#f8f9f1"
  danger: "#ff6b5e"
  light-background: "#fbfbf6"
  light-text: "#1d1e1a"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "Inter", "Helvetica Neue", system-ui, sans-serif'
    fontSize: "26px"
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  section-title:
    fontSize: "16px"
    lineHeight: 1.5
  file-label:
    fontSize: "13px"
    lineHeight: 1.5
  supporting:
    fontSize: "11px"
    lineHeight: 1.6
  khmer:
    fontFamily: '"Noto Sans Khmer", "Leelawadee UI", "Khmer Sangam MN", system-ui, sans-serif'
rounded:
  shelf: "28px"
  shelf-tile: "14px"
  delivery-tile: "12px"
  section: "16px"
  field: "9px"
  primary: "11px"
spacing:
  compact: "6px"
  related: "10px"
  group: "12px"
  section: "14px"
  workspace: "22px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.primary}"
    padding: "8px 18px"
  button-quiet:
    backgroundColor: "{colors.control}"
    textColor: "{colors.cream}"
    rounded: "{rounded.field}"
    padding: "7px 11px"
  button-quiet-hover:
    backgroundColor: "{colors.control-hover}"
  workflow-section:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.section}"
    padding: "14px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.field}"
    padding: "9px 10px"
---

# Drag Shelf design system

## Overview

The existing shelf remains the visual authority: warm charcoal surfaces, cream content, yellow actions, rounded controls, and compact desktop typography. The delivery extension expands this identity into a workspace without replacing the recognizable collection surface. Preserve the Drag Shelf name and existing app icon.

This is an evidence-based merge of the original rules with the finished delivery extension. Sources: `src/renderer/common.css`, `shelf.css`, `delivery.css`, `delivery.html`, and `.impeccable/delivery-direction.md`. Rendered evidence: `.impeccable/review/delivery/delivery-desktop.png`, `delivery-compact.png`, and `delivery-khmer.png`. The captures confirm the dark default and bilingual composition; they do not establish light-theme or every narrow-screen state.

**Key Characteristics:**
- Warm dark framing with cream file tiles.
- Compact rounded controls and circular completion marks.
- Yellow primary action and explicit readiness states.
- System desktop sans with bundled Khmer typography.

## Colors

### Primary

Yellow identifies the primary action, completed requirement circles, numbered workflow steps and output-folder cues. Use charcoal foreground on yellow. Danger identifies blocking or missing states; do not present a duplicate review item as completed readiness.

### Neutral

Charcoal is the main surface; the secondary surface separates workflow groups. Cream is primary text, muted is supporting text, and control tones distinguish quiet actions. Floating shelf backgrounds remain transparent outside the card. Full workspaces use restrained warm dark framing.

The incumbent light scheme uses a cream background and dark text, with its own control, border and tile overrides in `common.css`. Always inherit CSS variables so the workspace follows the selected scheme.

## Typography

Use the system desktop sans stack in `common.css`; use bundled Noto Sans Khmer and its established fallbacks for Khmer. No condensed or decorative replacement. The workspace headline, section titles, file labels and supporting text use the roles above. Shelf file names remain larger (15px) than the denser delivery source list.

Khmer uses normal letter spacing. Workspace headlines reduce to 23px with 1.8 line height; section titles use 15px with 1.9 line height. Requirement titles, file names, primary actions and key form labels use 1.9 line height. Preserve these language-specific accommodations rather than forcing English metrics.

## Layout

The floating shelf stays compact (320px wide). The approved delivery workspace keeps the collection on the left and the companion workbench on the right: a 50px app bar, then a two-column grid with a 320px source column and a flexible workbench. The workbench separates heading, recipe controls, output summary, scrolling workflow sections and a persistent footer action. The source list scrolls independently. Short windows keep the right panel scrollable while the footer stays accessible.

At widths up to 850px, the source column reduces to 230px; settings, options and output preview become single-column. Footer text wraps above its actions. At widths up to 660px, the collection stacks above the workbench, caps at 200px, and the shell scrolls; the action footer becomes sticky. Source count, collection footer and recipe label are hidden in the compact modes specified by the stylesheet. Do not infer that these breakpoints apply to every app surface.

Use the extracted compact spacing rhythm for related controls and larger workspace gutters for section framing. Long shelf names and file names wrap in the delivery workspace; output paths in the overview truncate while detailed preview content remains available.

## Elevation & Depth

The floating shelf uses the existing ambient shadow from `common.css`; dragging lifts a row with its established shadow and subtle scale. The delivery workspace primarily uses tonal separation and thin translucent borders. The history drawer adds a leftward shadow to signal an overlay. Do not transfer the shelf's exterior shadow to every workflow section.

Motion remains restrained: existing shelf transitions communicate hover, completion and drag state. Delivery disclosure arrows rotate when expanded; focus uses a visible yellow outline. Preserve the reduced-motion override.

## Shapes

Preserve the shelf's rounded 28px card, 44px file tiles with 14px corners, and circular completion controls. The delivery extension uses denser 40px source tiles with 12px corners, 16px workflow sections, 9px fields and quiet controls, and an 11px primary action. These are contextual variants, not replacements for shelf geometry. The output overview has one thin yellow leading border and asymmetric small-to-rounded corners.

## Components

### Buttons

The delivery primary action uses yellow with charcoal text, a 40px minimum height, 13px semibold text and a slight brightness increase on hover. Quiet actions use control tones, a 34px minimum height and 12px semibold text. History is a muted icon-and-text action. Disabled buttons reduce opacity and retain a default cursor. Keyboard focus has a 2px accent outline offset by 2px.

The incumbent shared `.btn` remains a separate 38px-high, 12px-radius variant. Preserve its Khmer minimum height and vertical padding.

### Cards / Containers

Workflow sections group numbered readiness, copy preparation and output preview. Each has a secondary surface, thin existing border, compact padding and no individual shadow. The output overview is an interactive compact destination summary above the scroll area. History opens as a right-side drawer up to 390px wide; narrow mode fixes it below the app bar.

### Inputs / Fields

Fields use secondary surfaces, subtle borders and rounded corners. Labels and help are muted; entered values remain cream. Checkboxes are native 17px controls tinted with the active accent. Advanced settings stay in a disclosure to keep the default workspace concise.

### Source and readiness rows

Source rows retain cream file tiles, filename plus metadata, and a trailing inclusion checkbox. Excluded source rows reduce opacity. Requirement rows use circular marks with separate met, missing and optional states, readable status labels and disclosure arrows. Preserve explicit state text alongside color.

### Icons

Use the existing consistent 24px stroke glyph system in `src/renderer/icons.js`. Shared `.g` glyphs render at 22px; delivery affordances intentionally use smaller 13–16px placements. Preserve stroke style and rounded joins.

## Do's and Don'ts

### Do:
- **Do** inherit the shared color and font variables.
- **Do** retain the shelf's geometry while using the documented delivery variants.
- **Do** keep action access and bilingual text legible across supported widths.
- **Do** use tonal grouping and subtle borders in the workspace.

### Don't:
- **Don't** replace the app icon or charcoal/cream/yellow default identity.
- **Don't** substitute decorative or condensed fonts for the desktop and Khmer stacks.
- **Don't** treat optional or duplicate review items as successful required checks.

Existing system support: `common.css` provides eight configurable accents including the yellow default and a full light scheme. The delivery renderer applies the saved theme and accent just as the shelf does. Live integration checks cover light and blue; the final captures document the approved dark/yellow default. These settings and the denser delivery tile variant are intentional reuse, not design drift.

