# Nebula-Genomics-Assessment

A kit lifecycle dashboard for the Nebula take-home. It answers the questions from the brief: how the pipeline is doing, how long each stage takes per product, which kits are stuck and who should chase them, and what happened to a specific order. You can also upload your own pair of CSVs.

Live: _URL to be added after deployment_

## Running it locally

You need Node 20 or newer.

```bash
npm install
npm run dev
```

The app runs on http://localhost:5173 and the API on port 3001. `npm start` builds everything and serves both on port 3001, the same way it runs in production. `npm test` runs the tests.

## Trying it with your own data

Open the **Data** page and drop in both files, in any order. I recognize each file by its header, so the file names don't matter. You can set the export date (as-of) yourself; otherwise I use the latest timestamp in the files.

The files need the same columns as the challenge. Column order and extra columns don't matter, and `;` or tab separators work too. The two files can be up to 4 MB together, because that's Vercel's request limit.

If a file can't be used at all (a missing column, an empty file, something that isn't a CSV, two orders files, or files that are too big), you get an error that says what's wrong, and the current data stays loaded. Bad rows inside an otherwise valid file are dropped or fixed. Everything I changed is listed in the data quality report on the same page, with counts and example ids. That's the place to check whether the things you broke on purpose were caught.

Refreshing the page takes you back to the sample, because uploads aren't stored anywhere.

To generate a fresh dataset: `node backend/scripts/generate-sample-data.mjs 42 ./seed-42`

## How it works

It's two workspaces: `backend` (Express and TypeScript) and `frontend` (Vue 3, TypeScript and Tailwind). There's no database.

The backend does the heavy lifting in `backend/src/domain`. It parses both CSVs, converts timestamps to UTC and cleans up the data. Then it rebuilds each kit's history, including replacements, works out stage durations and who's stuck, and returns one JSON dataset. The frontend keeps that dataset in memory and does the filtering and charts in the browser, so filters are instant and nothing has to be stored on the server.

```
api/index.ts           Vercel entry, just re-exports the Express app
backend/src/domain/    csv → time → clean → lifecycle → quality → buildDataset
backend/src/routes/    /api/health, /api/datasets/sample, /api/datasets/analyze
backend/test/          unit, API and robustness tests
frontend/src/views/    Overview, Turnaround, Stuck, Order, Data
frontend/src/lib/      filters and metrics (plain functions, tested)
```

## Data decisions

The data is messy on purpose, so these are the calls I made:

- **Timestamps** come in three formats. I convert everything to UTC, and treat the 248 timestamps with no time zone as UTC.
- **Duplicate events** (469 in the sample) have new ids and often a different time zone format. I match them on kit, event type and the actual instant, and count them once.
- **Orphan events** (40) point at orders that don't exist. I leave them out, but they're listed in the quality report.
- **Missing scans:** some `kit_delivered` and `sample_mailed` events were never recorded. If a later step exists, the kit obviously got there, so I mark the step as inferred and leave the durations around it out of the turnaround stats instead of guessing.
- **Test orders** are hidden by default (there's a toggle) and never show up as stuck.
- **Cancelled and refunded orders** count in volume, but they're never "in progress" or stuck.
- **Upload-only orders** have no kit, so they only count in order volume.
- **Replacements:** an order follows its newest kit, and I time a replacement kit from its `kit_replaced` event, not from the original order date.
- **"Now"** is the export date (2026-10-20 for the sample), never today. Otherwise everything would look months overdue. For uploads it's the latest timestamp in the files, ignoring obvious outliers like a single event typed as 2030.

## Stuck rules

The targets are the ones from the brief: 3, 7, 45, 14, 7, 28 and 5 days. A kit is stuck when its current stage has taken longer than the target, and critical at more than twice the target. Every stuck kit gets an owner:

- **Fulfillment** when it hasn't shipped.
- **Carrier** for either shipping leg.
- **Customer** when the sample hasn't been mailed.
- **Lab** for QC, sequencing and the report.

I added two rules of my own. A failed QC with no replacement after 3 days is stuck with Fulfillment, and so is an order that hasn't shipped after 3 days.

## Deploying

It's set up for Vercel: import the repo, keep the defaults and deploy. `vercel.json` builds the frontend as static files and sends `/api/*` to the Express app in `api/index.ts`. You don't need any environment variables. After deploying, `/api/health` should return `{"status":"ok"}`.

## What I'd do next

- Check my assumptions with the ops team: the 3-day rules, who owns a failed QC, and timestamps without a time zone.
- Add trends, like weekly medians per stage, so slowdowns show up early.
- Let people assign, comment on and snooze stuck orders. That needs a database.
- Keep uploads around (stored by file hash) so they survive a refresh and can be shared.
- If the data grows a lot, move the aggregation to the server instead of sending everything to the browser.
