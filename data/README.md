# Publication data directory

Populate **only** these two CSV files:

1. `price_indexes.csv`: columns `series_id,year,index`. The `index` must be a positive **level**, not a log difference or inflation rate.
2. `series_metadata.csv`: columns `series_id,display_name,sector,parent_category,unspsc_code,level`. Use `level=overall` for exactly one headline series, `level=sector` for optional sector series, and `level=good` for individual goods.

Every price row must match a metadata row. Within each series, include no more than one row per calendar year. Missing years should be **omitted**, not filled with zero. Only include the paper's intended **preferred hedonic quality-adjusted estimates**, not robustness checks, historical-methodology reconstructions, or nonhedonic benchmark series.

The site performs chart normalization in JavaScript. If desired, export each source series normalized to 100 in its first observed year, but any consistent positive scale works.

See the root `README.md` for deployment and additional details.
