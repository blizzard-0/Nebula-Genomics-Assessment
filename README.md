# Nebula-Genomics-Assessment

A kit lifecycle dashboard for the Nebula take-home. It answers the questions from the brief: how the pipeline is doing, how long each stage takes per product, which kits are stuck and who should chase them, and what happened to a specific order. You can also upload your own pairs of CSVs and switch between them.

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

Uploads are saved in your browser (IndexedDB, no database), so they survive a refresh. You can switch between them and the sample from the picker in the header, and rename, re-date or remove them on the Data page. Other people and other browsers don't see your uploads.

To generate a fresh dataset: `node backend/scripts/generate-sample-data.mjs 42 ./seed-42`

## Data decisions and assumptions

The data is messy on purpose. These are the calls I made, and why:

- **Timestamps** come in three formats. I convert everything to UTC and treat the 248 timestamps with no time zone as UTC, because the export is mostly UTC and a wrong guess costs a few hours on stages measured in days.
- **Duplicate events** (469 in the sample) have new ids and often a different time zone format, so matching on the text would miss most of them. I match on kit, event type and the actual instant, and count each event once.
- **Orphan events** (40) point at orders that don't exist. I leave them out of every metric, since they can't be tied to a product, country or customer, but they're listed in the quality report.
- **Missing scans:** some `kit_delivered` and `sample_mailed` events were never recorded. If a later step exists, the kit obviously got there, so I mark the step as inferred instead of flagging the kit as stuck. The durations on either side of a missing scan are left out of turnaround, because guessing a timestamp would distort both.
- **Test orders** are hidden by default (there's a toggle) and never show up as stuck. They're internal and shouldn't create work for ops.
- **Cancelled and refunded orders** count in volume and their real transitions count in turnaround, but they're never "in progress" or stuck. Nobody should chase a refunded customer for a sample.
- **Upload-only orders** have no kit, so they only count in order volume.
- **Replacements:** an order follows its newest kit, and I time a replacement kit from its `kit_replaced` event. Timing it from the original order date would make fulfillment look weeks late.
- **"Now"** is the export date (2026-10-20 for the sample), never today; otherwise everything would look months overdue. For uploads it's the latest timestamp in the files, ignoring obvious outliers like a single event typed as 2030.
- **Stuck:** a kit is stuck when its current stage has taken longer than the target from the brief (3, 7, 45, 14, 7, 28 and 5 days), and critical at more than twice the target. Each stuck kit gets an owner to chase: Fulfillment when it hasn't shipped, the Carrier for either shipping leg, the Customer when the sample hasn't been mailed, and the Lab for QC, sequencing and the report.

Some of these are assumptions rather than facts from the brief, and I'd confirm them with ops:

- Timestamps without a time zone are UTC.
- A failed QC with no replacement after 3 days is stuck, owned by Fulfillment. So is a paid order that hasn't shipped after 3 days.
- "Critical" means more than twice the target.
- Refunded orders still count in turnaround for the steps that did happen.

## How I used AI

I used Claude Code for the hands-on work, not for the thinking. The decisions in this README are mine. Before any code was written, I profiled the exports, read the challenge's generator to see what a hidden test set could contain, and wrote the plan:

- the stage model and how to treat each kind of bad data;
- the stuck rules and who owns each stage;
- the architecture: a stateless API that does the analysis, filtering in the browser, and no database;
- how it would be tested and deployed.

AI took the repetitive parts off my hands: scaffolding and config, turning the plan into code and components, writing most of the tests, and generating deliberately broken CSV files to attack the upload with. I reviewed every change, ran the app, and checked its numbers against my own profiling before moving on: 5,000 orders, 469 duplicate groups, 40 orphan events and 67 test orders.

It also got things wrong, which is why I verified everything in the browser and with broken data instead of trusting green tests:

- **One typo could move "now".** Its first version took the newest timestamp in an upload as the as-of date. One of the broken files had a single event dated 2030, and the stuck count jumped from 322 to 1,338. I changed the rule so isolated timestamps far after everything else are ignored, and added a test for it.
- **Saved uploads would have broken in a real browser.** It passed Vue's reactive objects straight to IndexedDB, which browsers refuse to store. I required tests for the storage layer, and they caught it before it shipped.
- **It sized the upload limit per file.** Vercel's 4.5 MB limit applies to the whole request, so two 3 MB files would have failed with a confusing error. I made it a 4 MB total, checked both in the browser and on the server.

## What I'd do next

- Confirm the assumptions above with the ops team.
- Add trends, like weekly medians per stage, so slowdowns show up early.
- Let people assign, comment on and snooze stuck orders. That needs a database.
- Share saved datasets between people. Right now they only live in one browser, so sharing would need server-side storage.
- If the data grows a lot, move the aggregation to the server instead of sending everything to the browser.

## Code layout

`backend/src/domain` does the data work (parse, clean, rebuild each kit's history, find stuck kits) and returns one JSON dataset. The Vue app in `frontend` keeps that dataset in memory and does all filtering and charts in the browser. `api/index.ts` is the Vercel entry point for the same Express app.
