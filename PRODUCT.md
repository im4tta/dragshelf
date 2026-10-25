# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop application for Windows and macOS, sharing one HTML/CSS/JavaScript interface with platform-specific shortcuts and desktop integration.

## Users

The user approved starting with designers and freelancers preparing client deliveries. Existing shelf users collect files, text, images and links while moving between desktop applications.

## Product Purpose

Turn a collection of files into a finished handoff: collect, check readiness, preview preparation, and export a clean delivery. Success means finishing a real delivery faster while understanding every change and being able to recover from mistakes.

## Capabilities and Constraints

The current application provides temporary shelves, file references, completion marks, native drag-and-drop, phone transfers, persistent settings, and English/Khmer localization. The Microsoft Store draft remains paused on the older native implementation.

Approved next work: purpose-based delivery shelves, user-defined requirements, readiness checks, previewed preparation, originals preserved, delivery folders or ZIPs with an index/instructions, reusable recipes and recovery. The first delivery workflow targets client handoffs. Other purpose templates inherit this mechanism; no OCR or cloud service has been approved as part of this implementation.

The user requested a visual mockup first and approved option C: a familiar shelf on the left with a companion delivery workspace on the right. The approved reference is `.impeccable/mocks/delivery/c-shelf-and-delivery.png`.

## Brand Commitments

Preserve the name Drag Shelf, its existing app icon, charcoal/cream/yellow interface, rounded controls, and English/Khmer support. These are established by the user's prior approved application work.

## Evidence on Hand

Working source under `src/`, Windows and Khmer screenshots under `docs/screenshots-windows/` and `docs/screenshots-khmer/`, app icon under `build/icon.png`. New delivery mockups use labeled sample projects; they are proposed interfaces, not shipping screenshots.

## Product Principles

- Explain the planned output before applying changes.
- Preserve source files and make recovery understandable.
- User requirements and explicit templates determine readiness; do not silently infer obligations.
- Keep processing local and avoid requiring accounts.
- Preserve bilingual usability and small-screen access.
