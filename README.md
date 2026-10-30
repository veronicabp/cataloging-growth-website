# Cataloging Growth: Interactive Price Index Explorer

A free, static website to explore and download the preferred hedonic price indexes in *Cataloging Growth: A Re-Evaluation of 1900–1990* (Verónica Bäcker-Peral and Benjamin Wittenbrink).

**There is no Python server and no JavaScript build step.** Upload this folder to a public GitHub repository, enable GitHub Pages, and optionally embed the published website in Google Sites.

## 1. Supply exactly two CSV files

Keep the filenames and paths as follows:

```
./data/price_indexes.csv
./data/series_metadata.csv
```

Both files are included as **header-only placeholders**. Replace them with the actual publication-ready hedonic estimates. No example price observations are included, to avoid presenting fabricated estimates.

### `data/price_indexes.csv`

One row per `series_id` × `year`:

| Column | Required | Definition |
| --- | --- | --- |
| `series_id` | Yes | Stable, unique series identifier, exactly matching metadata. Example: `apparel_housefurnishings` |
| `year` | Yes | Calendar year as integer, e.g. `1900` |
| `index` | Yes | **Positive price-index level**, not annual inflation, not a cumulative log change. A base level of 100 is recommended. |

- Publish the **preferred, quality-adjusted hedonic** series only. Exclude historical BLS, matched-model simulations, unadjusted prices, and robustness variants.
- Include the headline apparel and housefurnishings aggregate and each good/sector you want visitors to browse.
- A series can start later than 1900 and/or have missing years. Omit missing rows; do **not** replace missing values with `0` or forward-fill them.
- The website can rebase positive index levels to 100 in each series' first year or a shared observed comparison year.
- If your estimation output is cumulative **natural log changes** `L_t` (normalized to zero in year `b`), export `index_t = 100 * exp(L_t - L_b)`. If it is expressed as `100 × log changes`, divide by 100 inside `exp`.
- One `series_id` × `year` combination may appear only once.
- Prefer standard UTF-8 CSV without a pandas index column, e.g. `to_csv(..., index=False)`.

### `data/series_metadata.csv`

One row per `series_id`, using these **exact** column names:

| Column | Required | Definition |
| --- | --- | --- |
| `series_id` | Yes | Matching key used by `price_indexes.csv` |
| `display_name` | Yes | Human-readable label, e.g. `Refrigerators` |
| `sector` | Yes | Broad grouping, e.g. `Housefurnishings` or `Apparel` |
| `parent_category` | Yes (may be blank) | Subgroup for the goods picker, e.g. `Appliances` |
| `unspsc_code` | Yes (may be blank) | UNSPSC as a **string** to preserve leading zeros, blank for aggregates |
| `level` | Yes | Exactly one of `overall`, `sector`, `good` |

**Exactly one observed metadata series must have `level=overall`.** This row identifies the headline aggregate shown at the top of the website. Other rows can be `sector` or `good` and are searchable in the multi-select menu. Metadata rows without any matching price data are ignored.

Example **metadata only** (no illustrative price values):

```csv
series_id,display_name,sector,parent_category,unspsc_code,level
apparel_housefurnishings,Apparel and housefurnishings,All sectors,,,overall
refrigerators,Refrigerators,Housefurnishings,Appliances,,good
womens_dresses,Women's dresses,Apparel,Women's clothing,,good
```

Replace series IDs and category labels with the ones used by your own pipeline. The `unspsc_code` column can be populated with real UNSPSC identifiers.

The site will read the two CSV files on page load, validate their structure, and display a helpful message if files are empty or inconsistent.

## 2. Test locally

Open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Visit **http://localhost:8000/** in your browser. Do not open `index.html` with a `file://` URL: browsers generally prevent local `fetch()` requests to CSV files for security reasons.

Before you add data, you'll see an informative empty-data message instead of an invented price chart.

After adding data, check that:

- The aggregate series plots on the first chart.
- Searching, filtering by sector, and selecting multiple goods works.
- Rebased index levels and annual log inflation behave as expected.
- The annual values preview and the three CSV download controls work.
- Missing years generate gaps in charts instead of fictitious observations.

## 3. Publish for free on GitHub Pages

**Simplest: using the GitHub web interface**

1. At https://github.com/new create a **public** repository, for example `cataloging-growth-index`. You can leave *Initialize this repository with a README* unchecked if uploading your own files.
2. Upload **the contents of this folder**, not the folder itself, to the repository root (`index.html` must be visible at the top level). Keep the `data` folder intact.
3. Commit the files to the `main` branch.
4. Open **Settings → Pages** in the repository. Under **Build and deployment**, select **Deploy from a branch**, then **main** and **/(root)**, and click **Save**.
5. Open the published URL, normally `https://YOUR-USERNAME.github.io/cataloging-growth-index/`. GitHub also displays the live URL in the Pages settings.

**Alternative: push from your terminal**

Create an empty public repo on GitHub and then, in this folder, run:

```bash
git init
git add .
git commit -m "Initial price index website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/cataloging-growth-index.git
git push -u origin main
```

You may need to authenticate using GitHub's recommended credential manager or SSH. Then enable Pages using steps 4–5 above.

## 4. Embed in your existing Google Sites website

1. Open the existing Google Site in editing mode.
2. In the sidebar select **Pages → + (Add) → Full page embed**.
3. Name the page **Price Index**.
4. Paste the GitHub Pages URL, such as `https://YOUR-USERNAME.github.io/cataloging-growth-index/`.
5. Insert, preview, and **Publish** your Google Site.
6. Test the published site (not just the editor), including selecting multiple goods and downloading CSVs.

**Embedding can be refused by the destination host or a browser policy.** If the GitHub Pages URL does not render in Google Sites, use **Pages → + (Add) → New link** and paste the same URL. It will still be accessible from your site's navigation without needing to copy your code into Google Sites.

## 5. Update later

Only replace the two CSV files when the price estimates change. Commit and push:

```bash
git add data/price_indexes.csv data/series_metadata.csv
git commit -m "Update preferred hedonic series"
git push
```

Once GitHub Pages redeploys, the embedded page uses the updated files automatically. Users may briefly see cached content while the deployment and browser caches refresh.

## Implementation notes

- Browser loads both CSVs with relative paths, so the site works from either a repository project path or the root domain.
- Single aggregate series normalized to 100 in the first observed year.
- Goods comparison supports up to 12 simultaneously selected series.
- **Index** mode supports rebasing to the earliest shared observed year, or each series' first observed year. If no shared observed year exists, choose per-series rebasing.
- **Annual inflation** mode uses `100 * ln(index_t / index_{t-1})` and omits years lacking a consecutive predecessor.
- **Download selected raw series** exports exactly the original `index` levels for the selected IDs.
- **Download plotted values** exports the comparison transform, clearly identifying its measure and base year.
- **Download all data** links directly to the source `price_indexes.csv`.
- Charts use the open-source [Plotly.js basic bundle](https://plotly.com/javascript/getting-started/) from its public CDN. The site has no visitor tracking, no API keys, and no payment requirements.
- Repository and all published CSV data are public. Don't add raw digitization records or private research files unless you intend to publish them.

### Where to change the website copy

- `index.html`: title, authors, methods text, citation, navigation, and headings.
- `style.css`: fonts, colors, layout.
- `app.js`: interaction logic and chart behavior. You don't need to edit it when updating data.
