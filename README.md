# Price Charter

Live: https://thoroftroy.github.io/price-charter/

Look up a grocery, see which store is cheapest.

Smith's, Walmart, Costco, Target, Aldi, Trader Joe's, Whole Foods, Kroger.

Type "milk", pick your stores, tap + Add to build a list and see the cheapest trip total.
Hit "Use my location" (or type a ZIP) to see which of these stores are close to you.

Prices start as samples. Add your own from receipts - they save in your browser.

## Live Smith's / Kroger prices

Walmart, Costco, Target and the rest don't offer a free price feed, so those
stay manual. Smith's and Kroger do, through the official Kroger API:

1. Get a free key at https://developer.kroger.com (new app, turn on Product Location Data).
2. Repo Settings -> Secrets: add `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`.
3. Repo Settings -> Variables: add `PRICE_ZIP` with your ZIP.
4. Actions -> update-prices -> Run workflow. It refreshes daily after that.

The fetched prices land in `prices.json` and the site labels them with the date.
