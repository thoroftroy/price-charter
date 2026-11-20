# Price Charter

Live: https://thoroftroy.github.io/price-charter/

Look up a grocery, see which store has it cheapest this week.

Prices come from real weekly store ads (Smith's, Walmart, Costco, Target, Aldi, Kroger, Sprouts, Reams, Lucky, Albertsons, Macey's, Dan's, Sam's Club and more) through Flipp's public flyer feed. No API keys, no manual entry.

## What it does

- Search any grocery - milk, eggs, chicken, paper towels.
- Cheapest store is shown first, with unit price ($/oz, $/lb) when the ad lists a size.
- Set your location (GPS or ZIP) and it pulls the ads for your area.
- Build a list. The app totals the trip at every store and recommends one based on:
  - **Cheapest** - lowest grocery total
  - **Closest** - least driving
  - **Best mix** - groceries + $0.67/mile (gas and wear)
- If no single store covers the whole list, stores are ranked by how many items they cover first, then by the selected mode. Missing items are shown, not guessed.
- Drive distance and time use the nearest branch (OpenStreetMap + OSRM).

## Notes

- Ads are sale prices, not shelf prices. Some stores don't publish weekly ads in every area, so the store list changes by ZIP.
- Everything runs in the browser. Location never leaves your device.
- `prices.json` is a snapshot for the default ZIP (84101) so the page has data before you set a location. A GitHub Action refreshes it daily.
- To change the snapshot area: repo Settings -> Variables -> `PRICE_ZIP`, or run the workflow manually with a ZIP.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Refresh the snapshot:

```bash
node tools/fetch-flipp.mjs 84101
```
