/*
 * Cataloging Growth — price-index explorer.
 * Replace only data/price_indexes.csv and data/series_metadata.csv to update the site.
 * No backend, build system, API key, or dependencies other than Plotly.js are needed.
 */
'use strict';

const MAX_SERIES = 12;
const PALETTE = [
  '#b45b46', '#286386', '#63866d', '#916a9c', '#ba8a41', '#438b94',
  '#6e6bba', '#ac6484', '#788c51', '#a9633b', '#54798f', '#657077'
];
const $ = (id) => document.getElementById(id);

const state = {
  data: new Map(),    // series_id -> { values: Map<year, index>, years: number[] }
  meta: [],           // metadata with at least one observation
  overall: null,
  selected: new Set(),
  comparison: null,
};

// Handle comma, CRLF, escaped double quotes, and quoted newlines.
function parseCsv(text) {
  const rows = [];
  let cells = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  const finishRow = () => {
    cells.push(field);
    if (cells.some((v) => v.trim() !== '')) rows.push(cells);
    cells = [];
    field = '';
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      finishRow();
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (field !== '' || cells.length) finishRow();
  return rows;
}

function readCsv(text, requiredColumns, filename) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`${filename} has no header.`);
  const headers = rows.shift().map((s) => s.trim());
  for (const col of requiredColumns) {
    if (!headers.includes(col)) throw new Error(`${filename}: missing required column "${col}".`);
  }
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) {
      throw new Error(`${filename}: row ${i + 2} has ${cells.length} cells; expected ${headers.length}.`);
    }
    const record = {};
    headers.forEach((name, j) => { record[name] = cells[j].trim(); });
    return record;
  });
}

function showNotice(message) {
  const el = $('data-notice');
  el.textContent = message;
  el.hidden = !message;
}

function placeholder(id, message) {
  const el = $(id);
  // Purge an existing Plotly chart before replacing its content.
  if (window.Plotly && el._fullLayout) window.Plotly.purge(el);
  el.replaceChildren();
  const p = document.createElement('p');
  p.className = 'plot-placeholder';
  p.textContent = message;
  el.appendChild(p);
}

function parseData(priceRows, metadataRows) {
  const metadata = new Map();
  for (const [i, r] of metadataRows.entries()) {
    if (!r.series_id || !r.display_name) {
      throw new Error(`series_metadata.csv: row ${i + 2} must include series_id and display_name.`);
    }
    if (metadata.has(r.series_id)) throw new Error(`Duplicate metadata series_id: ${r.series_id}`);
    if (!['overall', 'sector', 'good'].includes(r.level)) {
      throw new Error(`series_metadata.csv: level for ${r.series_id} must be overall, sector, or good.`);
    }
    metadata.set(r.series_id, r);
  }

  for (const [i, r] of priceRows.entries()) {
    const id = r.series_id;
    const year = Number(r.year);
    const index = Number(r.index);
    if (!metadata.has(id)) throw new Error(`price_indexes.csv: row ${i + 2} references unknown series_id "${id}".`);
    if (!r.year || !Number.isInteger(year) || year < 1800 || year > 2100) {
      throw new Error(`price_indexes.csv: row ${i + 2} has invalid year: ${r.year}`);
    }
    if (r.index === '' || !Number.isFinite(index)) {
      throw new Error(`price_indexes.csv: row ${i + 2} has invalid index: ${r.index}`);
    }
    if (!state.data.has(id)) state.data.set(id, { values: new Map(), years: [] });
    const item = state.data.get(id);
    if (item.values.has(year)) throw new Error(`Duplicate data row for ${id}, ${year}.`);
    item.values.set(year, index);
    item.years.push(year);
  }
  state.meta = [...metadata.values()]
    .filter((r) => state.data.has(r.series_id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  const overall = state.meta.filter((r) => r.level === 'overall');
  if (priceRows.length > 0 && overall.length !== 1) {
    throw new Error('Provide exactly one metadata row with level=overall and at least one index observation.');
  }
  state.overall = overall[0] || null;
  for (const item of state.data.values()) item.years.sort((a, b) => a - b);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function makeCsv(headers, objects) {
  return [headers.join(','), ...objects.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\r\n') + '\r\n';
}
function downloadCsv(filename, headers, rows) {
  const blob = new Blob(['\uFEFF', makeCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Release after the click has had a chance to start a download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function rawRowsFor(ids) {
  const rows = [];
  for (const id of ids) {
    const item = state.data.get(id);
    if (!item) continue;
    for (const year of item.years) rows.push({ series_id: id, year, index: item.values.get(year) });
  }
  return rows.sort((a, b) => a.series_id.localeCompare(b.series_id) || a.year - b.year);
}

function chartLayout(yTitle, yearMin, yearMax, showLegend) {
  return {
    autosize: true,
    margin: { l: 64, r: 24, t: 18, b: 52 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#ffffff',
    font: { family: 'Arial, sans-serif', color: '#60717b', size: 12 },
    showlegend: showLegend,
    legend: { orientation: 'h', y: -0.25, x: 0, xanchor: 'left', font: { size: 11 } },
    xaxis: {
      title: { text: 'Year', standoff: 12, font: { size: 11 } },
      type: 'linear', tickformat: 'd', dtick: yearMax - yearMin > 70 ? 20 : undefined,
      range: [yearMin - 1, yearMax + 1], zeroline: false,
      showline: true, linecolor: '#c6d1d7', showgrid: false,
      ticks: 'outside', tickcolor: '#c6d1d7',
    },
    yaxis: {
      title: { text: yTitle, standoff: 12, font: { size: 11 } },
      gridcolor: '#e7edef', griddash: 'dot', zerolinecolor: '#b5c5cc',
      ticks: 'outside', tickcolor: '#c6d1d7',
      automargin: true,
    },
    hovermode: 'x unified',
  };
}
const plotConfig = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d'] };

function densePoints(item, measure, baseYear) {
  const xs = [], ys = [];
  const start = item.years[0], end = item.years.at(-1);
  const baseLog = item.values.get(baseYear);

  for (let y = start; y <= end; y++) {
    const current = item.values.get(y);
    const previous = item.values.get(y - 1);
    xs.push(y);

    if (measure === 'inflation') {
      ys.push(
        current != null && previous != null
          ? 100 * (current - previous)
          : null
      );
    } else {
      ys.push(
        current != null
          ? 100 * Math.exp(current - baseLog)
          : null
      );
    }
  }

  return { xs, ys };
}

function renderOverview() {
  const m = state.overall;
  if (!m) {
    placeholder('overview-chart', 'Add your two CSV files to display the aggregate hedonic series.');
    return;
  }
  const item = state.data.get(m.series_id);
  const first = item.years[0], last = item.years.at(-1);
  const { xs, ys } = densePoints(item, 'index', first);
  $('overview-coverage').textContent = `${first}–${last} · ${item.years.length} observations`;
  $('download-overview').disabled = false;
  if (!window.Plotly) {
    placeholder('overview-chart', 'The charting library could not be loaded. Check your internet connection.');
    return;
  }
  window.Plotly.react('overview-chart', [{
    x: xs, y: ys, type: 'scatter', mode: 'lines', name: m.display_name,
    line: { color: '#b45b46', width: 2.8 }, connectgaps: false,
    hovertemplate: '%{y:.2f}<extra></extra>',
  }], chartLayout('Price index', first, last, false), plotConfig);
}

function updateSectors() {
  const sectors = [...new Set(state.meta.map((m) => m.sector).filter(Boolean))].sort();
  const select = $('sector-filter');
  select.replaceChildren();
  const all = new Option('All sectors', '');
  select.add(all);
  sectors.forEach((sector) => select.add(new Option(sector, sector)));
}

function renderPicker() {
  const query = $('search-series').value.toLowerCase().trim();
  const sector = $('sector-filter').value;
  const root = $('series-picker');
  root.replaceChildren();
  const visible = state.meta.filter((m) => {
    const matchesSector = !sector || m.sector === sector;
    const searchable = [m.display_name, m.sector, m.parent_category, m.unspsc_code, m.series_id].join(' ').toLowerCase();
    return matchesSector && (!query || searchable.includes(query));
  });
  if (visible.length === 0) {
    const p = document.createElement('p');
    p.className = 'picker-empty';
    p.textContent = state.meta.length ? 'No matching goods found.' : 'No data available yet.';
    root.appendChild(p);
  }

  // Group by level / sector / parent for readable navigation.
  const groups = new Map();
  for (const m of visible) {
    const group = m.level === 'overall' ? 'Aggregate index'
      : m.level === 'sector' ? 'Sector indexes'
      : `${m.sector || 'Other'} · ${m.parent_category || 'Other goods'}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(m);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const rank = (name) => name === 'Aggregate index' ? 0 : name === 'Sector indexes' ? 1 : 2;
    return rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]);
  });
  for (const [group, items] of ordered) {
    const section = document.createElement('div');
    section.className = 'series-group';
    const h = document.createElement('h4');
    h.className = 'series-group-name';
    h.textContent = group;
    section.appendChild(h);
    for (const m of items) {
      const label = document.createElement('label');
      label.className = 'series-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = m.series_id;
      checkbox.checked = state.selected.has(m.series_id);
      checkbox.disabled = !checkbox.checked && state.selected.size >= MAX_SERIES;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selected.add(m.series_id);
        else state.selected.delete(m.series_id);
        renderPicker();
        renderExplorer();
      });
      label.appendChild(checkbox);
      const wrapper = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'series-name';
      name.textContent = m.display_name;
      wrapper.appendChild(name);
      if (m.unspsc_code) {
        const code = document.createElement('span');
        code.className = 'series-code';
        code.textContent = `UNSPSC ${m.unspsc_code}`;
        wrapper.appendChild(code);
      }
      label.appendChild(wrapper);
      section.appendChild(label);
    }
    root.appendChild(section);
  }
  const n = state.selected.size;
  $('picker-summary').textContent = `${n} series selected${n === MAX_SERIES ? ' (limit reached)' : ''}`;
  $('clear-selection').disabled = n === 0;
}

function comparisonData() {
  const ids = [...state.selected];
  if (!ids.length) return null;
  const measure = $('measure-select').value;
  const baseMode = $('base-select').value;
  let commonYear = null;
  if (measure === 'index' && baseMode === 'common') {
    const firstYears = state.data.get(ids[0]).years;
    commonYear = firstYears.find((y) => ids.every((id) => state.data.get(id).values.has(y)));
    if (commonYear == null) return { error: 'The selected series do not share any observed year. Choose “First observed year for each series,” or switch to annual inflation.' };
  }

  const rows = [];
  const traces = [];
  let min = Infinity, max = -Infinity;
  ids.forEach((id, i) => {
    const m = state.meta.find((record) => record.series_id === id);
    const item = state.data.get(id);
    const baseYear = commonYear ?? item.years[0];
    const { xs, ys } = densePoints(item, measure, baseYear);
    min = Math.min(min, item.years[0]);
    max = Math.max(max, item.years.at(-1));
    const color = PALETTE[i % PALETTE.length];
    traces.push({
      type: 'scatter', mode: 'lines', x: xs, y: ys, name: m.display_name,
      line: { color, width: 2.3 }, connectgaps: false,
      hovertemplate: measure === 'inflation' ? '%{y:.2f}%<extra></extra>' : '%{y:.2f}<extra></extra>',
    });
    xs.forEach((year, j) => {
      if (ys[j] !== null) rows.push({
        series_id: id, display_name: m.display_name, year, value: Number(ys[j].toFixed(8)),
        measure: measure === 'inflation' ? 'annual_log_inflation_pct' : 'rebased_index',
        base_year: measure === 'index' ? baseYear : '',
      });
    });
  });
  rows.sort((a, b) => a.year - b.year || a.display_name.localeCompare(b.display_name));
  return { ids, rows, traces, measure, baseMode, commonYear, min, max };
}

function buildPreview(comparison) {
  const root = $('preview-content');
  root.replaceChildren();
  if (!comparison || comparison.error) {
    root.textContent = comparison?.error || 'Select at least one series.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'preview-table';
  const thead = document.createElement('thead');
  const heading = document.createElement('tr');
  ['Year', ...comparison.ids.map((id) => state.meta.find((m) => m.series_id === id).display_name)].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    heading.appendChild(th);
  });
  thead.appendChild(heading);
  table.appendChild(thead);
  const byId = new Map(comparison.ids.map((id) => [id, new Map()]));
  const years = new Set();
  comparison.rows.forEach((r) => { byId.get(r.series_id).set(r.year, r.value); years.add(r.year); });
  const body = document.createElement('tbody');
  [...years].sort((a, b) => a - b).forEach((year) => {
    const tr = document.createElement('tr');
    const yearCell = document.createElement('td');
    yearCell.textContent = year;
    tr.appendChild(yearCell);
    comparison.ids.forEach((id) => {
      const td = document.createElement('td');
      const value = byId.get(id).get(year);
      td.textContent = value == null ? '—' : value.toFixed(2);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  root.appendChild(table);
}

function renderExplorer() {
  const comparison = comparisonData();
  state.comparison = comparison;
  const hasSelection = state.selected.size > 0;
  $('download-selected').disabled = !hasSelection;
  $('download-displayed').disabled = !comparison || Boolean(comparison.error) || comparison.rows.length === 0;
  const measure = $('measure-select').value;
  $('base-select').disabled = measure === 'inflation';
  $('explorer-measure-label').textContent = measure === 'inflation' ? 'Annual log inflation (%)' : 'Quality-adjusted price indexes';
  $('explorer-coverage').textContent = comparison?.min != null ? `${comparison.min}–${comparison.max}` : '';
  buildPreview(comparison);

  if (!comparison || comparison.error) {
    placeholder('explorer-chart', comparison?.error || 'Select one or more series from the menu to begin.');
    $('explorer-footnote').textContent = comparison?.error || 'Individual goods indexes may cover different historical periods.';
    return;
  }
  if (comparison.rows.length === 0) {
    placeholder('explorer-chart', 'No consecutive observations are available for the selected annual inflation series.');
    $('explorer-footnote').textContent = 'Annual inflation requires index levels for adjacent calendar years.';
    return;
  }
  if (!window.Plotly) {
    placeholder('explorer-chart', 'The charting library could not be loaded. The data downloads remain available.');
    return;
  }
  const note = measure === 'inflation'
    ? 'Annual log inflation is 100 × ln(index this year / index previous year). Only consecutive-year observations are included.'
    : comparison.baseMode === 'common'
      ? `All series are normalized to 100 in ${comparison.commonYear}, the first year observed for every selected series.`
      : 'Each selected index is normalized to 100 in its own first observed year; the levels are not on a common base.';
  $('explorer-footnote').textContent = note;
  window.Plotly.react('explorer-chart', comparison.traces,
    chartLayout(measure === 'inflation' ? 'Annual log inflation (%)' : 'Price index', comparison.min, comparison.max, true),
    plotConfig);
}

function bindEvents() {
  $('search-series').addEventListener('input', renderPicker);
  $('sector-filter').addEventListener('change', renderPicker);
  $('clear-selection').addEventListener('click', () => {
    state.selected.clear();
    renderPicker();
    renderExplorer();
  });
  $('measure-select').addEventListener('change', renderExplorer);
  $('base-select').addEventListener('change', renderExplorer);
  $('download-overview').addEventListener('click', () => {
    if (state.overall) downloadCsv('cataloging_growth_aggregate.csv', ['series_id', 'year', 'index'], rawRowsFor([state.overall.series_id]));
  });
  $('download-selected').addEventListener('click', () => {
    if (state.selected.size) downloadCsv('cataloging_growth_selected_raw.csv', ['series_id', 'year', 'index'], rawRowsFor([...state.selected]));
  });
  $('download-displayed').addEventListener('click', () => {
    if (state.comparison?.rows?.length) {
      downloadCsv('cataloging_growth_selected_plotted.csv', ['series_id', 'display_name', 'year', 'value', 'measure', 'base_year'], state.comparison.rows);
    }
  });
}

async function start() {
  $('current-year').textContent = new Date().getFullYear();
  bindEvents();
  try {
    const [priceResponse, metadataResponse] = await Promise.all([
      fetch('./data/price_indexes.csv', { cache: 'no-cache' }),
      fetch('./data/series_metadata.csv', { cache: 'no-cache' }),
    ]);
    if (!priceResponse.ok || !metadataResponse.ok) throw new Error('A data CSV could not be loaded. Verify the files exist in the data/ folder.');
    const [prices, metadata] = await Promise.all([priceResponse.text(), metadataResponse.text()]);
    const priceRows = readCsv(prices, ['series_id', 'year', 'index'], 'price_indexes.csv');
    const metadataRows = readCsv(metadata, ['series_id', 'display_name', 'sector', 'parent_category', 'unspsc_code', 'level'], 'series_metadata.csv');
    if (!priceRows.length) {
      showNotice('The website is ready, but the price-index file contains no observations yet. Export your preferred hedonic series to data/price_indexes.csv and their labels to data/series_metadata.csv.');
    } else {
      parseData(priceRows, metadataRows);
      showNotice('');
    }
    updateSectors();
    renderPicker();
    renderOverview();
    renderExplorer();
  } catch (err) {
    console.error('Could not initialize price-index explorer:', err);
    showNotice(`Could not load the data: ${err.message}`);
    placeholder('overview-chart', 'Data could not be loaded. See the message above.');
    placeholder('explorer-chart', 'Data could not be loaded. See the message above.');
    renderPicker();
  }
}

document.addEventListener('DOMContentLoaded', start);
