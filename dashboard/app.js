(function () {
  'use strict';
  var data = window.RADAR;
  var app = document.getElementById('board');
  if (!data || !app) return;
  var state = { q: '', cat: 'all', chain: 'all', min: 0, tab: 'pre', p: '', sort: 'implied_value_usd', dir: -1 };
  var moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function el(tag, attrs, children) {
    var node = document.createElement(tag), key;
    attrs = attrs || {};
    for (key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'class') node.className = attrs[key];
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    }
    if (children !== undefined && children !== null) (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }
  function money(n) { if (n == null || !isFinite(n)) return '—'; return '$' + (Math.abs(n) >= 10000 ? moneyFmt.format(Math.round(n)) : Number(n).toFixed(2)); }
  function pct(n) { return n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(n) { if (n == null || !isFinite(n)) return '—'; if (n < 60) return Math.floor(n) + ' days'; if (n < 730) return (n / 30.4375).toFixed(1) + ' months'; return (n / 365.25).toFixed(1) + ' years'; }
  function ratio(n) { return n == null || !isFinite(n) ? '—' : Number(n).toPrecision(4).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1') + 'x'; }
  function category(v) { return v || 'Uncategorized'; }
  function chains(v) { return v && v.length ? v.join(', ') : '—'; }
  function readHash() {
    var p = new URLSearchParams(window.location.hash.slice(1));
    ['q', 'cat', 'chain', 'tab', 'p'].forEach(function (k) { if (p.has(k)) state[k] = p.get(k); });
    state.min = Number(p.get('min')) || 0;
    if (state.tab !== 'live') state.tab = 'pre';
  }
  function writeHash() {
    var p = new URLSearchParams();
    ['q', 'cat', 'chain', 'min', 'tab', 'p'].forEach(function (k) { if (state[k] && state[k] !== 'all' && state[k] !== 'pre' && state[k] !== 0) p.set(k, state[k]); });
    window.history.replaceState(null, '', p.toString() ? '#' + p.toString() : window.location.pathname + window.location.search);
  }
  function options(select, values, chosen, label) {
    var s = el('select', { id: select }), all = el('option', { value: 'all', text: label }); s.appendChild(all);
    values.forEach(function (v) { s.appendChild(el('option', { value: v, text: v })); });
    s.value = values.indexOf(chosen) >= 0 ? chosen : 'all'; return s;
  }
  function makeTable(headers, rows, live) {
    var table = el('table'), thead = el('thead'), tr = el('tr');
    headers.forEach(function (h) { var b = el('button', { class: 'sort', text: h[0], 'aria-label': 'Sort by ' + h[0], onclick: function () { if (state.sort === h[1]) state.dir *= -1; else { state.sort = h[1]; state.dir = 1; } render(); } }); tr.appendChild(el('th', { scope: 'col' }, b)); });
    thead.appendChild(tr); table.appendChild(thead);
    var body = el('tbody');
    rows.forEach(function (r, i) {
      var cells = live ? [String(i + 1), r.name, category(r.category), chains(r.chains), money(r.tvl_usd), money(r.mcap_usd), pct(r.change_7d), ratio(r.ratio)] : [String(r.rank), r.name + (r.watchlist ? ' ★' : ''), category(r.category), chains(r.chains), money(r.tvl_usd), pct(r.change_7d), age(r.age_days), '', ratio(r.peer_ratio), String(r.peer_count), String((r.farm_steps || []).length)];
      var row = el('tr', { tabindex: live ? '-1' : '0', onclick: live ? null : function () { openDetail(r.slug); }, onkeydown: live ? null : function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } });
      cells.forEach(function (v, j) {
        var td = el('td', { class: [0, 4, 5, 6].indexOf(j) >= 0 ? 'num' : '' });
        if (!live && j === 7) { var bar = el('div', { class: 'bar', style: 'width:' + Math.max(0, Math.min(100, data.rows.length ? r.implied_value_usd / Math.max.apply(null, data.rows.map(function (x) { return x.implied_value_usd; })) * 100 : 0)) + '%' }); td.className = 'value'; td.appendChild(el('strong', { text: money(r.implied_value_usd) })); td.appendChild(bar); }
        else td.textContent = v;
        if ((!live && j === 5) || (live && j === 6)) td.className += (r.change_7d < 0 ? ' negative' : r.change_7d > 0 ? ' positive' : '');
        row.appendChild(td);
      }); body.appendChild(row);
    });
    table.appendChild(body); return table;
  }
  function filtered() {
    var q = state.q.toLowerCase();
    return data.rows.filter(function (r) { return (!q || (r.name + ' ' + r.slug).toLowerCase().indexOf(q) >= 0) && (state.cat === 'all' || category(r.category) === state.cat) && (state.chain === 'all' || (r.chains || []).indexOf(state.chain) >= 0) && r.tvl_usd >= state.min; }).sort(function (a, b) { var x = a[state.sort], y = b[state.sort]; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * state.dir; });
  }
  function openDetail(slug) { state.p = slug; writeHash(); showDialog(); }
  function showDialog() {
    var r = data.rows.filter(function (x) { return x.slug === state.p; })[0], d = document.getElementById('detail');
    if (!r) return;
    if (d.open) d.close();
    d.replaceChildren();
    var close = el('button', { class: 'close', text: 'Close', onclick: function () { state.p = ''; writeHash(); d.close(); } });
    d.appendChild(el('div', { class: 'dialog-head' }, [el('div', {}, [el('h2', { text: r.name }), el('p', { class: 'muted', text: category(r.category) + ' · ' + chains(r.chains) })]), close]));
    var pairs = [['TVL', money(r.tvl_usd)], ['Age', age(r.age_days)], ['Implied value', money(r.implied_value_usd)], ['Peer ratio (' + r.peer_count + ' peers)', ratio(r.peer_ratio)], ['Growth multiplier', ratio(r.growth_multiplier)], ['Maturity multiplier', ratio(r.maturity_multiplier)], ['Reach multiplier', ratio(r.reach_multiplier)]];
    var grid = el('div', { class: 'detail-grid' }); pairs.forEach(function (x) { grid.appendChild(el('div', {}, [el('span', { text: x[0] }), el('strong', { text: x[1] })])); });
    d.appendChild(grid); d.appendChild(el('h3', { text: 'Farm plan' }));
    var list = el('ol', { class: 'plan' }); (r.farm_steps || []).forEach(function (step) { list.appendChild(el('li', { text: step })); }); d.appendChild(list);
    if (!d.open) d.showModal();
  }
  var labels = { ratio_floor: 'Minimum peer ratio', ratio_cap: 'Maximum peer ratio', peer_min_tvl: 'Minimum peer TVL', peer_clamp_lo: 'Peer ratio lower clamp', peer_clamp_hi: 'Peer ratio upper clamp', shrink_peers: 'Global median shrink peers', growth_weight: 'Growth weight', growth_floor: 'Growth lower bound (%)', growth_cap: 'Growth upper bound (%)', maturity_floor: 'Maturity floor', maturity_range: 'Maturity range', maturity_days: 'Maturity horizon (days)', unknown_age_days: 'Assumed age when unknown (days)', reach_per_chain: 'Reach increase per extra chain', reach_max_extra: 'Maximum extra chains counted' };
  function render() {
    app.replaceChildren();
    var wrap = el('div', { class: 'wrap' }), header = el('header', { class: 'top' });
    header.appendChild(el('h1', { text: 'Token Launch Radar' })); header.appendChild(el('p', { class: 'muted', text: 'As of ' + data.as_of + ' · Source: ' + data.source })); wrap.appendChild(header);
    var lede = el('p', { class: 'lede' }); lede.appendChild(document.createTextNode('Implied value = TVL × the category peer market-cap/TVL ratio, shrunk toward the global median, × growth × maturity × reach. ')); lede.appendChild(el('strong', { class: 'stats', text: data.board_size + ' board rows · ' + data.watchlist_size + ' watchlist · ' + data.early_size + ' early rows · ' + data.live_size + ' live peers · ' + data.peer_total + ' total peers' })); wrap.appendChild(lede);
    var controls = el('section', { class: 'controls', 'aria-label': 'Radar filters' });
    var search = el('input', { id: 'search', type: 'search', value: state.q, placeholder: 'Name or slug' });
    search.addEventListener('input', function () { state.q = search.value; state.p = ''; writeHash(); render(); document.getElementById('search').focus(); });
    controls.appendChild(el('div', { class: 'field search' }, [el('label', { for: 'search', text: 'Search' }), search]));
    var cats = Array.from(new Set(data.rows.map(function (r) { return category(r.category); }))).sort(); var catSel = options('category', cats, state.cat, 'All categories'); catSel.value = state.cat === 'all' ? 'all' : cats.indexOf(state.cat) >= 0 ? state.cat : 'all';
    catSel.addEventListener('change', function () { state.cat = catSel.value; writeHash(); render(); }); controls.appendChild(el('div', { class: 'field' }, [el('label', { for: 'category', text: 'Category' }), catSel]));
    var chainVals = Array.from(new Set(data.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort(); var chainSel = options('chain', chainVals, state.chain, 'All chains'); chainSel.value = chainVals.indexOf(state.chain) >= 0 ? state.chain : 'all';
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); }); controls.appendChild(el('div', { class: 'field' }, [el('label', { for: 'chain', text: 'Chain' }), chainSel]));
    var minSel = el('select', { id: 'min' }); [['0', 'Any'], ['10000000', '$10M'], ['50000000', '$50M'], ['100000000', '$100M'], ['500000000', '$500M'], ['1000000000', '$1B']].forEach(function (x) { minSel.appendChild(el('option', { value: x[0], text: x[1] })); }); minSel.value = String(state.min); minSel.addEventListener('change', function () { state.min = Number(minSel.value); writeHash(); render(); }); controls.appendChild(el('div', { class: 'field' }, [el('label', { for: 'min', text: 'Minimum TVL' }), minSel]));
    var tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Radar view' }); [['pre', 'Pre-token board'], ['live', 'Live-token peers']].forEach(function (x) { tabs.appendChild(el('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tab === x[0]), text: x[1], onclick: function () { state.tab = x[0]; state.p = ''; writeHash(); render(); } })); }); controls.appendChild(tabs); wrap.appendChild(controls);
    var results = filtered();
    if (state.tab === 'pre') {
      var board = el('section', { 'aria-label': 'Pre-token board' }), heads = [['Rank', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', 'chains'], ['TVL', 'tvl_usd'], ['7d change', 'change_7d'], ['Age', 'age_days'], ['Implied value', 'implied_value_usd'], ['Peer ratio', 'peer_ratio'], ['Peers', 'peer_count'], ['Farm steps', 'farm_steps']];
      board.appendChild(el('div', { class: 'table-wrap' }, makeTable(heads, results, false))); board.appendChild(el('p', { class: 'count', text: 'Showing ' + results.length + ' of ' + data.rows.length + ' board rows.' })); wrap.appendChild(board);
    } else {
      var liveRows = data.live.filter(function (r) { return (!state.q || (r.name + ' ' + r.slug).toLowerCase().indexOf(state.q.toLowerCase()) >= 0) && (state.cat === 'all' || category(r.category) === state.cat) && (state.chain === 'all' || (r.chains || []).indexOf(state.chain) >= 0) && r.tvl_usd >= state.min; });
      var liveHeads = [['Rank by market cap', 'rank'], ['Protocol', 'name'], ['Category', 'category'], ['Chains', 'chains'], ['TVL', 'tvl_usd'], ['Market cap', 'mcap_usd'], ['7d change', 'change_7d'], ['Mcap/TVL', 'ratio']];
      liveRows.sort(function (a, b) { var key = state.sort === 'rank' || state.sort === 'implied_value_usd' ? 'mcap_usd' : state.sort, x = a[key], y = b[key]; if (x == null) return 1; if (y == null) return -1; var cmp = x < y ? -1 : x > y ? 1 : 0; return cmp * state.dir; });
      var liveSection = el('section', { 'aria-label': 'Live-token peers' }); liveSection.appendChild(el('div', { class: 'table-wrap' }, makeTable(liveHeads, liveRows, true))); liveSection.appendChild(el('p', { class: 'count', text: 'Showing ' + liveRows.length + ' of ' + data.live.length + ' live peers.' })); wrap.appendChild(liveSection);
    }
    var model = el('section', { class: 'panel' }); model.appendChild(el('h2', { text: 'Model and evidence' })); model.appendChild(el('p', { class: 'lede', text: 'Implied value = TVL × applied category ratio × growth multiplier × maturity multiplier × reach multiplier. The applied category ratio blends category evidence with the global peer median.' }));
    var grid = el('div', { class: 'model-grid' }), dl = el('dl', { class: 'constants' }); Object.keys(data.model).forEach(function (k) { dl.appendChild(el('dt', { text: labels[k] || k })); dl.appendChild(el('dd', { text: String(data.model[k]) })); }); grid.appendChild(el('div', {}, [el('h3', { text: 'Model constants · ' + data.model_version }), dl]));
    var evidence = el('table'), et = el('thead'), er = el('tr'); [['Category', 'Category'], ['Peers', 'Peers'], ['Median ratio', 'Median ratio'], ['Applied ratio', 'Applied ratio']].forEach(function (v) { er.appendChild(el('th', { scope: 'col', text: v[0] })); }); et.appendChild(er); evidence.appendChild(et); var eb = el('tbody'); data.categories.forEach(function (c) { eb.appendChild(el('tr', {}, [el('td', { text: c.category }), el('td', { text: String(c.peers) }), el('td', { text: ratio(c.median_ratio) }), el('td', { text: ratio(c.applied_ratio) })])); }); evidence.appendChild(eb); grid.appendChild(el('div', {}, [el('h3', { text: 'Category evidence' }), evidence])); model.appendChild(grid); wrap.appendChild(model);
    var footer = el('footer', { class: 'foot', text: 'This page runs fully offline. Data source: ' + data.source + ' · Snapshot ' + data.as_of + '.' }); wrap.appendChild(footer); app.appendChild(wrap);
    if (!document.getElementById('detail')) app.appendChild(el('dialog', { id: 'detail', onclose: function () { if (state.p) { state.p = ''; writeHash(); } } }));
  }
  readHash();
  window.addEventListener('hashchange', function () { readHash(); render(); if (state.p) showDialog(); else { var d = document.getElementById('detail'); if (d.open) d.close(); } });
  render(); if (state.p) showDialog();
}());
