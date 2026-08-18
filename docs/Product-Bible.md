# Product Bible – Version 2.0

**Status: Version 2.0 is the current, authoritative product direction.** It supersedes Version 1.0 in every place the two disagree — most notably on primary beachhead market and on the core experience model. Version 1.0 content is preserved below, under its own section, for historical context and because much of its product detail (asset fields, work order fields, document types, etc.) still stands and is not restated twice.

Working Title: PropertyOS (Placeholder)

## Purpose

PropertyOS is the operating system for the physical property.

We are not building another property management software like Entrata, AppFolio, or Yardi. We are building the software owners, regional managers, maintenance directors, and property managers open every morning to understand the health of every property they own.

## Primary Beachhead

**Manufactured-housing / mobile-home communities.**

This supersedes Version 1.0's framing, which listed general property management companies as primary and mobile home parks as a future/secondary market. Manufactured housing is now the entry wedge, not an eventual expansion.

## Architecture Principle

**Manufactured-housing-first UX, property-type-neutral engine.**

The product is designed and tested against manufactured-housing communities first, but nothing in the schema or logic may be specific to that property type. The underlying engine must support apartments, hotels, commercial properties, and any other property type without code changes — only through the generic `Property → Location → Asset` hierarchy. Manufactured-housing-first shapes *design decisions and defaults*, not the data model.

## Core Operational Graph

```
Property
  → Location
    → Asset
      → Work Order
        → Updates / Photos
          → future Vendors / Costs / History
```

Every experience in the product — Dashboard, Property, Map, Work Order, Asset, Reports — is a different view onto this one graph, not a separate data model.

## Spatial Operations Principle

PropertyOS preserves **where** every physical maintenance event happened, then connects that spatial history to **what** happened, **when** it happened, **what asset/location was involved**, **what it cost**, and **how often similar events have occurred**.

Site Map, Work Orders, Assets, Costs, and Reports must operate on the same underlying operational records rather than becoming separate feature silos. The uploaded site plan is the spatial reference layer — the base canvas every physical position is expressed relative to. Work Orders represent events that happen on that physical property and may carry an exact normalized map position. Assets represent physical things that may occupy positions on that property. Future infrastructure layers represent physical systems (water, sewer, electrical, roads) laid over the same canvas. Reports will analyze this same operational history — spatial position is preserved from the moment an event is recorded so future reporting can answer questions like "where is this money/activity going?" without re-deriving location after the fact.

Spatial position and organizational hierarchy (Location) are related but distinct concepts. A Work Order's map position must never be forced to align with a Location assignment merely to satisfy schema, and a Location must never be assigned to a Work Order merely because it needs coordinates. Physical truth is preserved exactly as recorded; hierarchy context is layered on top only when genuinely useful. PropertyOS shows *where* work occurred — it does not claim causation merely because events cluster spatially.

## Work Order Completion & History Principle

Completion removes work from the active operational queue; it never removes the maintenance event from PropertyOS operational history. Completed Work Orders remain permanently accessible for historical review, reopening, future Reports, future cost analysis, future spatial/map history, and recurring-problem analysis. PropertyOS never deletes a completed Work Order — completion is a status change, not a removal. Views that default to showing active operations (the Dashboard, a property's default Work Orders list, the default Property Map) exclude completed work so they stay focused on what needs attention right now, but that same completed history remains one filter away, in full, forever.

## Maintenance Classification & Cost History Principle

Every physical maintenance event should carry a structured Category (Water, Sewer, Electrical, Roads, Concrete, Trees/Landscaping, Buildings/Facilities, General/Other) and, where known, a Work Type identifying the specific operation performed within that Category (e.g. Sewer → Line Cleaning vs. Sewer → Main Repair). Work Types are stable, reference-identified records, not free text — a Work Order stores a reference to a Work Type's identity, never a typed string, so a later rename of that Work Type's display label instantly and correctly updates how every historical Work Order referencing it is shown, with nothing to rewrite. Categories and Work Types exist to make PropertyOS's operational history reliably groupable — "all Sewer Work Orders" or "all Line Cleaning Work Orders" must be an exact, trustworthy query, never a text search.

A Work Order's actual cost is built from itemized cost entries (labor, materials, vendor, equipment, other), each independently timestamped and attributable, entered incrementally over the Work Order's life — while work is underway, at completion, or afterward by an authorized manager. Total cost is always derived by summing those entries, never stored as a separate number a user must keep in sync by hand. Neither classification nor cost is required to complete a Work Order — completion and financial reconciliation are related but separate concerns, and invoices or internal labor costs legitimately arrive after the work itself is done. Completed Work Orders remain fully editable for classification and cost exactly as they remain accessible for everything else in PropertyOS's operational history.

Every cost entry carries its own **costDate** — the calendar day the expense was actually incurred, distinct from the entry's system-entry timestamp (when it was typed into PropertyOS, which may be days or weeks later). Maintenance Spend reporting is always dated by costDate, never by a Work Order's creation date, completion date, or a cost entry's own creation timestamp — those answer "when was this recorded," not "which period does this money belong to."

## Maintenance Spend Reporting Principle

Reports are derived from the same operational records Work Orders and the Property Map already use — a dollar shown in a report always traces back to a real Work Order and its real cost entries; there is no separate reporting truth. Maintenance Spend includes recorded cost entries regardless of whether their parent Work Order is still active or already completed: a cost entry is a real recorded amount the moment it exists, and Work Order status answers a different question (is the work done) than cost entries do (what has been spent). An open Work Order with real recorded costs contributes those dollars to spend for whichever period(s) its cost entries' costDate values fall into, exactly as a completed one would.

"Average Cost / Work Order" is always computed over Work Orders that have at least one recorded cost entry in the current scope — a Work Order with no recorded cost is absent from that calculation, never treated as a $0 data point that would silently pull the average down. Every ranked breakdown (by Category, by Work Type) must reconcile exactly against the summary total above it, including an explicit "Uncategorized" bucket for spend on Work Orders that haven't been classified yet — no dollar is ever silently dropped from a breakdown just because it lacks a category or Work Type.

## Core Experience

Five pillars, each answering one question:

| Pillar | Question it answers |
|---|---|
| **Operations** | "What needs attention right now?" |
| **Property** | "What's happening at this property?" |
| **Map** | "Where is it physically, and what does it affect?" |
| **Work Order / Asset** | "What exactly is happening, and what are we doing about it?" |
| **Reports** | "What keeps happening, what are the trends, and what is it costing?" |

## UX North Star

- **Regional Manager** — understand portfolio health in 30 seconds.
- **Property Manager** — understand what's wrong at a property in 15 seconds.
- **Technician** — understand what to do next in 5 seconds.
- **Operator / Owner** — answer cost/performance questions without needing Excel.

## Design Principles

- Powerful without being complicated.
- Operational without being cluttered.
- Visual without being decorative.
- Intelligent without hiding facts.
- Manufactured-housing first without being manufactured-housing locked.
- Avoid generic SaaS card soup.

Prefer:
- Strong information hierarchy
- Progressive disclosure
- Persistent context
- Restrained attention colors
- Useful information density
- Clear typography
- Obvious next actions
- Spatial context where useful

The Dashboard is a **management morning briefing**, not a widget collection. Reports should answer business questions through drill-down rather than forcing users to export to Excel. Map will eventually be a flagship operational site-plan experience supporting Locations, Assets, Work Orders, configurable infrastructure layers, points, lines, polygons, and future service-impact relationships.

## Guiding Principle (carried forward from Version 1.0)

Every feature we build must answer one question: **does this help our customer make a better decision?** If the answer is no, it doesn't belong in the product.

---

# Version 1.0 (Historical / Superseded)

The following is the original Version 1.0 document, preserved for historical context and because much of its product-level detail (asset fields, work order fields, vendor/document model, roadmap) remains useful and has not been re-specified under 2.0. **Where this section conflicts with Version 2.0 above — primary beachhead market, and the exact framing of the core experience/navigation model — Version 2.0 governs.**

### Vision

Build the operating system for property maintenance and asset intelligence.

We are not building another property management software like Entrata, AppFolio, or Yardi. We are building the software owners, regional managers, maintenance directors, and property managers open every morning to understand the health of every property they own.

### Mission

Give every physical asset on a property a complete digital history. Help property management companies make better maintenance and capital investment decisions.

### Core Philosophy

If it exists on a property, we should be able to map it, track it, and know its story.

### Version 1.0 Goal

Create one central place where property management companies can:

- Visually see every property
- Track every asset
- Manage every repair
- Store every document
- Know every dollar spent

No forecasting. No AI. No accounting. Just an incredible foundation.

### Target Customers (as originally framed — see Primary Beachhead above for the current framing)

Primary: Property Management Companies, Regional Maintenance Managers, Maintenance Directors, Property Managers.

Future: Mobile Home Parks, HOAs, Hotels, Commercial Properties, Self Storage, Universities, Hospitals.

### Core Product

**1. Dashboard** — Simple portfolio overview. Shows Properties, Open Work Orders, Recent Activity, Assets Requiring Attention, Maintenance Spend, Quick Search.

**2. Portfolio** — Shows every property owned. Searchable. Filterable.

**3. Property Page** — Every property has two ways to navigate:

*Map View* — Visual. Satellite image or uploaded site map. User clicks: Property → Building/Lot → Unit (if applicable) → Asset.

*List View* — The same information, displayed like Excel. Sortable, filterable, exportable, saved views, bulk edit, reports.

**Why two views?** Map View answers "where is it?" — visual understanding, find assets quickly, see problem areas. List View answers "tell me everything" — spreadsheet, filtering, sorting, reporting, bulk editing, exporting. The Map and List always stay synchronized.

### Property Structure

The software should NOT be apartment specific. Everything is built around locations:

```
Portfolio → Property → Location → Sub Location (optional) → Asset
```

Examples:
- Apartment: Property → Building → Unit → Asset
- Trailer Park: Property → Lot → Asset
- Hotel: Property → Floor → Room → Asset
- Commercial: Property → Suite → Asset

This allows support for many industries without changing the software.

### Assets

Every asset has its own profile. Examples: Water Heater, HVAC, Roof, Refrigerator, Dishwasher, Washer, Dryer, Parking Lot, Sidewalk, Pool Pump, Irrigation Controller, Trees, Street Lights, Fire Systems, Mailboxes — anything.

Each asset stores: Install Date, Purchase Price, Vendor, Manufacturer, Model Number, Serial Number, Warranty, Expected Life, Photos, Invoices, Manuals, Repair History, Lifetime Cost, Notes.

Every asset becomes its own timeline.

### Work Orders

Simple statuses: Open, Assigned, Waiting, Completed.

Every work order belongs to: Property → Location → Asset.

Stores: Labor, Material Cost, Vendor, Photos, Documents, Notes, Completion Date.

### Vendors

Every vendor gets their own profile. Includes: Contact Information, Insurance, Licenses, Work Orders, Invoices, Lifetime Spend, Properties Served.

### Documents

Every asset and work order can store: Photos, Warranties, Manuals, Invoices, Receipts, Inspection Reports, Permits.

### Global Search

Find anything instantly: Property, Asset, Vendor, Serial Number, Model Number, Invoice, Work Order, Warranty, Documents.

### Layer System (Map)

The map can toggle layers. Examples: Buildings, Units, Water, Sewer, Electrical, Gas, HVAC, Roofs, Parking Lots, Trees, Fire Systems, Irrigation, Utilities. Future layers can easily be added.

### Things NOT Included in Version 1

No AI, No Budget Forecasting, No Accounting, No QuickBooks, No Insurance, No Predictive Maintenance, No Capital Planning, No Resident Portal, No Leasing, No Payments, No Inventory, No Vendor Ratings, No Portfolio Intelligence.

Why? Version 1 is about collecting clean, structured, trustworthy data. Without great data, AI is useless.

### Long-Term Roadmap

**Version 2** — Professional Reports, Excel Export, PDF Reports, Scheduled Reports, Portfolio Reporting.

**Version 3** — AI Assistant ("What happened this month?", "Summarize Building 4.", "Show my most expensive assets.").

**Version 4** — Predictive Maintenance, Asset Health Scores, Warranty Alerts, Expected Failures, Replacement Suggestions.

**Version 5** — Capital Planning, 5-Year Budgets, "What If" Scenarios, Capital Forecasts, Replacement Planning.

**Version 6** — Portfolio Intelligence, Cross-property benchmarking, Vendor performance analytics, Regional dashboards, Executive reporting, AI financial planning.

### Future Vision

Become the Bloomberg Terminal for property maintenance. Not the software that stores maintenance records — the software executives use to answer:

- Where is my money going?
- What should I replace next year?
- Which assets are costing me the most?
- Which vendors are performing the best?
- What should my capital budget be?

### Guiding Principle

Every feature we build must answer one question: does this help our customer make a better decision? If the answer is no, it doesn't belong in the product.

I genuinely think this is our north star now. If we stay disciplined and build this before chasing AI, we'll have a foundation that can grow into something much bigger than a maintenance tracker. AI should become the amplifier of great data — not the product itself.
