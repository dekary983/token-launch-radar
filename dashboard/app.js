// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// same board board.json carries) and renders the ranked board, the live-token peer set, the model's
// category evidence, and a detail drawer per protocol with its model working and its farm plan.
// No network: every byte it shows is in data.js, and the farm steps are the board's own strings.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre', sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    var tvl = parseInt(params.get('tvl') || '', 10);
    if (isFinite(tvl) && tvl > 0) state.minTvl = tvl;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('tvl', String(state.minTvl));
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'ratio') { av = a.peer_ratio; bv = b.peer_ratio; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name' }, 'Launch ', el('b', { text: 'Radar' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Model ' + DATA.model_version }),
        el('span', { text: DATA.peer_total + ' tokenized peers' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', null,
          'Every protocol here records no token yet. Each is valued the way the market values its tokenized peers: ',
          el('b', { text: 'TVL times the median market-cap-to-TVL ratio of its own category' }),
          ', adjusted for its seven-day momentum, how long it has run with no token, and how many chains it reaches. The watchlist is the floor, not the ceiling: the radar also ranks ',
          el('b', { text: DATA.early_size + ' early protocols' }),
          ' below it.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', null, el('em', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }))),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top of the board' }), el('b', { text: top ? top.name : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }))
      )
    );
  }

  var TVL_STEPS = [
    { v: 0, label: 'Any TVL' },
    { v: 1000000, label: 'TVL $1M+' },
    { v: 10000000, label: 'TVL $10M+' },
    { v: 50000000, label: 'TVL $50M+ (the floor)' },
    { v: 100000000, label: 'TVL $100M+' },
    { v: 250000000, label: 'TVL $250M+' }
  ];

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, options, current, onchange) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o.v, text: o.label, selected: String(o.v) === String(current) ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onchange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live-token peers', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var shown = state.tab === 'pre' ? rows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' peers shown';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', [{ v: 'all', label: 'All categories' }].concat(categories.map(function (c) { return { v: c, label: c }; })), state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', [{ v: 'all', label: 'All chains' }].concat(chains.map(function (c) { return { v: c, label: c + ' (' + chainCount[c] + ')' }; })), state.chain, function (v) { state.chain = v; }),
      select('tvl', 'Minimum TVL', TVL_STEPS.map(function (t) { return { v: String(t.v), label: t.label }; }), String(state.minTvl), function (v) { state.minTvl = parseInt(v, 10) || 0; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Board' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: shown })
    );
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        active ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the filters to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        class: r.rank <= 3 ? 'top3' : '',
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtRatio(r.peer_ratio) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, r.watchlist
          ? el('span', { class: 'chip watch', text: 'WATCHLIST' })
          : el('span', { class: 'chip', text: 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by implied launch value. Select any row for its model working and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('ratio', 'Peer x'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Radar' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtRatio(r.ratio) }),
        el('td', null, el('span', { class: 'chip live', text: 'TRADES' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The peer set: these protocols already trade, so their market cap is a fact, not a model. Their category medians are what values the pre-token board.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var catRows = DATA.categories.slice(0, 14).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtRatio(c.median_ratio) }),
        el('td', { class: 'num', text: fmtRatio(c.applied_ratio) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the implied value is derived' }),
      el('div', { class: 'cols' },
        el('div', null,
          el('div', { class: 'formula' },
            el('span', { class: 'k', text: 'implied' }),
            ' = TVL x peerRatio(category) x growth x maturity x reach'
          ),
          el('p', null,
            el('b', { text: 'Peer ratio. ' }),
            'The tokenized protocols are the comparables: ' + DATA.peer_total + ' of them carry a market cap and at least ' + fmtUsd(m.peer_min_tvl) + ' of TVL, half the watchlist floor, the least size at which a trading multiple is evidence about anyone else\'s launch. Each category contributes the median of its peers\' ratios, shrunk toward the global median of ' + fmtRatio(DATA.global_ratio) + ' by ' + m.shrink_peers + ' phantom peers when the category is thin, and clamped to ' + m.ratio_floor + 'x-' + m.ratio_cap + 'x. A category with no qualifying peers is valued at the global median.'
          ),
          el('p', null,
            el('b', { text: 'Growth. ' }),
            'Seven-day TVL change, clamped to ' + m.growth_floor + '%..+' + m.growth_cap + '%, moves the value by up to ' + Math.round(m.growth_weight * 100) + '% of itself: momentum is evidence, not the story.'
          ),
          el('p', null,
            el('b', { text: 'Maturity. ' }),
            'A protocol that has run ' + Math.round(m.maturity_days / 365) + ' years with no token earns the full ' + (m.maturity_floor + m.maturity_range).toFixed(1) + 'x; a brand-new one starts at ' + m.maturity_floor + 'x. Age is the days since DefiLlama first tracked it; an unrecorded age counts as ' + m.unknown_age_days + ' days.'
          ),
          el('p', null,
            el('b', { text: 'Reach. ' }),
            'Each chain past the first adds ' + Math.round(m.reach_per_chain * 100) + '% up to seven: distribution a launch can be claimed on. No protocol name is special-cased anywhere in the model; one function scores every row.'
          )
        ),
        el('div', null,
          el('table', { class: 'cat-table' },
            el('caption', { class: 'sub', text: 'Category evidence: tokenized peers, their median ratio, and the ratio applied after shrinkage.' }),
            el('thead', null, el('tr', null,
              el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Peers' }), el('th', { scope: 'col', text: 'Median' }), el('th', { scope: 'col', text: 'Applied' })
            )),
            el('tbody', null, catRows)
          )
        )
      )
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Implied value is this entry\'s own model claim about what a launch would be worth if the protocol\'s record stayed as it is. It is not a prediction that a token will be issued, and it is not a price.' }),
      el('p', { text: 'A protocol here records no token in the snapshot (' + DATA.source + '); DefiLlama\'s record is not proof, so the board says records no token, never has none.' }),
      el('p', { text: 'The watchlist is every protocol at or above ' + fmtUsd(DATA.floor_usd) + ' of TVL that records no token and is not a wrapped, staked or bridged product of one that trades. Rows marked EARLY sit below that floor and passed the same line at any TVL: pre-token, in no bridge, liquid-staking or restaking category, not a versioned pool, not a wrapped or staked product or an exchange\'s product by name. That is why WBTC and the canonical bridges are absent: they are products of tokens that already trade.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function categoryStat(name) {
    var key = name || 'Uncategorized';
    for (var i = 0; i < DATA.categories.length; i++) if (DATA.categories[i].category === key) return DATA.categories[i];
    return null;
  }

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var stat = categoryStat(row.category);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' - watchlist' : ' - early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied launch value' }),
      el('div', { class: 'big-value', text: fmtUsd(row.implied_value_usd) }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer ratio (' + (row.category || 'Uncategorized') + ', ' + row.peer_count + ' peers)' }), el('b', { text: fmtRatio(row.peer_ratio) })),
        stat
          ? el('div', null, el('span', { text: 'Category median before shrinkage' }), el('b', { text: fmtRatio(stat.median_ratio) }))
          : el('div', null, el('span', { text: 'No peer in this category clears the evidence floor' }), el('b', { text: 'global ' + fmtRatio(DATA.global_ratio) })),
        el('div', null, el('span', { text: 'Seven-day growth ' + fmtPct(row.change_7d) }), el('b', { text: fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token: ' + fmtAge(row.age_days) }), el('b', { text: fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains reached: ' + (row.chains ? row.chains.length : 0) }), el('b', { text: fmtMult(row.reach_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol on the board. This is an estimate from the snapshot\'s figures, not a price and not a promise of a launch.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The record' }),
      el('div', { class: 'meta' },
        el('div', null, el('span', { text: 'First tracked' }), el('b', { text: row.listed_at || 'not recorded' })),
        el('div', null, el('span', { text: 'Token status' }), el('b', { text: 'records no token' })),
        el('div', null, el('span', { text: 'TVL rank on this board' }), el('b', { text: '#' + row.rank + ' by implied value' })),
        el('div', null, el('span', { text: 'Snapshot date' }), el('b', { text: DATA.as_of }))
      )
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') {
      shell.appendChild(modelPanel());
      shell.appendChild(foot());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
