// Token Radar Comps-1 Client (Vanilla JS, standard browser API)
// Interactive sector-calibrated valuation radar & institutional farm playbook
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById('main-board');
  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token',
    quick: 'all',
    selected: null
  };

  var usdFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
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

  // The model in one clean function: recomputes row from snapshot figures
  function impliedOf(row, model) {
    var rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    var growthMult = 1.0 + (growth / 100) * model.growth_weight;

    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var clampedAge = Math.min(Math.max(age, 0), model.maturity_days);
    var maturityMult = model.maturity_floor + (clampedAge / model.maturity_days) * model.maturity_range;

    var catMult = row.category_multiple || model.base_multiple;
    var chainBreadth = Math.min(1.10, 1.0 + Math.max(0, (row.chains || []).length - 1) * 0.01);

    var base = row.tvl_usd * catMult;
    return Math.max(1, Math.round(base * growthMult * maturityMult * chainBreadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('quick')) state.quick = params.get('quick');
    if (params.get('tab')) state.tab = params.get('tab');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.quick !== 'all') params.set('quick', state.quick);
    if (state.selected) params.set('p', state.selected);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname);
  }

  function getChains() {
    var set = new Set();
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { if (c) set.add(c); });
    });
    return Array.from(set).sort();
  }

  function getCategories() {
    var set = new Set();
    DATA.rows.forEach(function (r) {
      set.add(r.category || 'Other');
    });
    return Array.from(set).sort();
  }

  function filterRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.quick === 'watchlist' && r.list_type !== 'watchlist') return false;
      if (state.quick === 'gainers' && (r.change_7d === null || r.change_7d <= 0)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function renderTopHeader() {
    return el('header', { class: 'top-header' },
      el('div', { class: 'brand' },
        el('span', { class: 'radio-icon' }),
        el('span', { text: 'TOKEN RADAR' })
      ),
      el('div', { class: 'header-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function renderHero() {
    return el('section', { class: 'hero-section' },
      el('div', { class: 'hero-text' },
        el('h1', { text: 'Every protocol that records no token, ranked by what its record implies' }),
        el('p', { text: 'The watchlist is the floor: ' + DATA.watchlist_size + ' protocols with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar adds ' + DATA.early_size + ' early protocols below that floor and ' + DATA.above_floor_size + ' above it that the list leaves out. Implied value is a model calibrated on live-token multiples, not a promise.' }),
        el('p', { class: 'disclaimer', text: "DefiLlama's record is not proof: the board says a protocol records no token, never that it has none." })
      ),
      el('div', { class: 'stats-box' },
        el('div', { class: 'stat-row' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Above the floor, off the list' }), el('b', { text: String(DATA.above_floor_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'stat-row' }, el('span', { text: 'Global median mcap / TVL' }), el('b', { text: DATA.global_median_multiple.toFixed(4) }))
      )
    );
  }

  function renderFilters() {
    var search = el('input', {
      type: 'search',
      class: 'search-input',
      placeholder: 'Search name, category o...',
      value: state.q,
      oninput: function (e) {
        state.q = e.target.value;
        writeHash();
        render();
      }
    });

    var catSelect = el('select', {
      class: 'select-box',
      onchange: function (e) {
        state.category = e.target.value;
        writeHash();
        render();
      }
    },
      el('option', { value: 'all', text: 'All categories' }),
      getCategories().map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })
    );

    var chainSelect = el('select', {
      class: 'select-box',
      onchange: function (e) {
        state.chain = e.target.value;
        writeHash();
        render();
      }
    },
      el('option', { value: 'all', text: 'All chains' }),
      getChains().map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })
    );

    var watchOnlyBtn = el('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': state.quick === 'watchlist' ? 'true' : 'false',
      text: 'Watchlist only',
      onclick: function () {
        state.quick = state.quick === 'watchlist' ? 'all' : 'watchlist';
        writeHash();
        render();
      }
    });

    var gainersBtn = el('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': state.quick === 'gainers' ? 'true' : 'false',
      text: 'Gainers only',
      onclick: function () {
        state.quick = state.quick === 'gainers' ? 'all' : 'gainers';
        writeHash();
        render();
      }
    });

    return el('div', { class: 'filter-row' },
      el('div', { class: 'field-col' }, el('span', { class: 'label-text', text: 'Search' }), search),
      el('div', { class: 'field-col' }, el('span', { class: 'label-text', text: 'Category' }), catSelect),
      el('div', { class: 'field-col' }, el('span', { class: 'label-text', text: 'Chain' }), chainSelect),
      el('div', { class: 'field-col' }, el('span', { class: 'label-text', text: 'Quick filters' }),
        el('div', { class: 'quick-group' }, watchOnlyBtn, gainersBtn)
      )
    );
  }

  function renderViewBar() {
    var preBtn = el('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-token board',
      onclick: function () { state.tab = 'pre-token'; writeHash(); render(); }
    });

    var liveBtn = el('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': state.tab === 'live' ? 'true' : 'false',
      text: 'Live token',
      onclick: function () { state.tab = 'live'; writeHash(); render(); }
    });

    var asideBtn = el('button', {
      type: 'button',
      class: 'chip-btn',
      'aria-pressed': state.tab === 'aside' ? 'true' : 'false',
      text: 'Set aside',
      onclick: function () { state.tab = 'aside'; writeHash(); render(); }
    });

    var countText = state.tab === 'pre-token' ?
      filterRows().length + ' rows shown' :
      DATA.live.length + ' live tokens';

    return el('div', { class: 'view-bar' },
      el('div', { class: 'field-col' },
        el('span', { class: 'label-text', text: 'View' }),
        el('div', { class: 'view-group' }, preBtn, liveBtn, asideBtn)
      ),
      el('span', { class: 'rows-count', text: countText })
    );
  }

  function renderTable() {
    var list = filterRows();
    var maxVal = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');

    list.forEach(function (r) {
      var badgeCls = r.list_type === 'watchlist' ? 'pill-watchlist' : (r.list_type === 'above_floor' ? 'pill-above' : 'pill-early');
      var badgeText = r.list_type === 'watchlist' ? 'Watchlist' : (r.list_type === 'above_floor' ? 'Above floor' : 'Early');
      var growthCls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var barPct = Math.max(3, Math.round((r.implied_value_usd / maxVal) * 100));

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDrawer(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDrawer(r.slug);
          }
        }
      },
        el('td', { class: 'num' }, el('b', { text: String(r.rank) })),
        el('td', null,
          el('div', { class: 'proto-info' },
            el('span', { class: 'proto-name', text: r.name }),
            el('span', { class: 'proto-desc', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 2).join(', ') })
          )
        ),
        el('td', null, el('span', { class: 'pill-badge ' + badgeCls, text: badgeText })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null,
          el('div', { class: 'implied-box' },
            el('div', { class: 'bar-bg' }, el('div', { class: 'bar-fill', style: 'width: ' + barPct + '%' })),
            el('span', { class: 'val-text', text: fmtUsd(r.implied_value_usd) })
          )
        )
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'table-panel' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
        el('thead', null,
          el('tr', null,
            el('th', { class: 'num' }, 'Rank ↓'),
            el('th', null, 'Protocol'),
            el('th', null, 'List'),
            el('th', { class: 'num' }, 'TVL'),
            el('th', { class: 'num' }, '7d'),
            el('th', { class: 'num' }, 'Age'),
            el('th', { class: 'num' }, 'Chains'),
            el('th', { style: 'text-align: right;' }, 'Implied value ↓')
          )
        ),
        tbody
      )
    );
  }

  function renderLiveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r, idx) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(idx + 1) }),
        el('td', null,
          el('div', { class: 'proto-info' },
            el('span', { class: 'proto-name', text: r.name }),
            el('span', { class: 'proto-desc', text: (r.category || 'Other') + ' on ' + (r.chains || []).slice(0, 3).join(', ') })
          )
        ),
        el('td', null, el('span', { class: 'pill-badge pill-watchlist', text: 'Live Token' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: (r.ratio || 0).toFixed(4) }),
        el('td', { style: 'text-align: right;' },
          el('span', { class: 'val-text', text: fmtUsd(r.mcap_usd) })
        )
      ));
    });

    return el('div', { class: 'table-panel' },
      el('table', null,
        el('caption', { text: 'Live-token protocols: these protocols already trade, so their market cap is a fact, not a model.' }),
        el('thead', null,
          el('tr', null,
            el('th', { class: 'num' }, 'Rank'),
            el('th', null, 'Protocol'),
            el('th', null, 'Status'),
            el('th', { class: 'num' }, 'TVL'),
            el('th', { class: 'num' }, '7d'),
            el('th', { class: 'num' }, 'Market Cap'),
            el('th', { class: 'num' }, 'Mcap / TVL'),
            el('th', { style: 'text-align: right;' }, 'Live FDV')
          )
        ),
        tbody
      )
    );
  }

  // Side Drawer component
  var drawer = el('aside', { class: 'drawer', id: 'side-drawer', 'aria-hidden': 'true' });

  function closeDrawer() {
    state.selected = null;
    drawer.className = 'drawer';
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    writeHash();
    render();
  }

  function openDrawer(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;

    state.selected = slug;
    writeHash();
    drawer.textContent = '';

    var badgeText = row.list_type === 'watchlist' ? 'Watchlist' : (row.list_type === 'above_floor' ? 'Above floor' : 'Early');
    var isWatchlist = row.list_type === 'watchlist';

    // Top
    drawer.appendChild(el('div', { class: 'drawer-top' },
      el('div', null,
        el('div', { class: 'drawer-tag', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + badgeText }),
        el('h2', { class: 'drawer-title', text: row.name }),
        el('p', { class: 'drawer-sub', text: (row.category || 'Other') + ' on ' + (row.chains || []).join(', ') + (isWatchlist ? ' · On the snapshot\'s watchlist.' : ' · Off watchlist.') })
      ),
      el('button', {
        type: 'button',
        class: 'close-btn',
        text: 'Close',
        onclick: closeDrawer
      })
    ));

    // Implied value section
    var catMult = row.category_multiple || DATA.model.base_multiple;
    var growthPct = row.change_7d === null ? 0 : row.change_7d;
    var growthMult = row.growth_multiplier || 1.0;
    var maturityMult = row.maturity_multiplier || 0.8;
    var chainBreadth = row.chain_breadth_multiplier || 1.0;
    var chainsCount = (row.chains || []).length;

    var recomputed = impliedOf(row, DATA.model);
    var matchesExact = recomputed === row.implied_value_usd;

    var catInfo = (row.category || 'Other') + ' comps: ' + (row.live_count || 1) + ' live token, median mcap / TVL ' +
      (row.raw_category_median || catMult).toFixed(4) + ', shrunk toward the global median ' +
      DATA.global_median_multiple.toFixed(4) + ' to a multiple of ' + catMult.toFixed(4) + '.';

    drawer.appendChild(el('div', { class: 'drawer-section' },
      el('h3', { text: 'Implied value' }),
      el('table', { class: 'breakdown-table' },
        el('tr', null, el('td', { class: 'td-label', text: 'TVL' }), el('td', { class: 'td-val', text: fmtUsd(row.tvl_usd) })),
        el('tr', null, el('td', { class: 'td-label', text: 'Category multiple' }), el('td', { class: 'td-val', text: catMult.toFixed(4) })),
        el('tr', null, el('td', { class: 'td-label', text: 'Seven-day growth' }), el('td', { class: 'td-val', text: fmtPct(growthPct) + ' × ' + growthMult.toFixed(4) })),
        el('tr', null, el('td', { class: 'td-label', text: 'Age with no token' }), el('td', { class: 'td-val', text: fmtAge(row.age_days) + ' × ' + maturityMult.toFixed(4) })),
        el('tr', null, el('td', { class: 'td-label', text: 'Chain breadth (' + chainsCount + ' chains)' }), el('td', { class: 'td-val', text: '× ' + chainBreadth.toFixed(4) })),
        el('tr', { class: 'total-row' }, el('td', { class: 'td-label', text: 'Implied value' }), el('td', { class: 'td-val', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'calc-note', text: catInfo }),
      el('p', { class: 'calc-note', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (matchesExact ? ', the same number the board carries.' : ', which differs from the board.') + ' This is an estimate, not a price.' })
    ));

    // Farm plan section
    var steps = row.farm_steps || [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: nothing. Time: 10 minutes.',
      'Fund the wallet with $220 of USDC on Base so position and gas are covered. Cost: $220 capital. Time: 20 minutes.',
      'Deposit $200 into a curated vault and keep shares. Cost: $200 capital. Time: 15 minutes.',
      'Repeat on Ethereum with half the capital ($100). Cost: $100 capital. Time: 15 minutes.'
    ];

    var farmList = el('ul', { class: 'farm-list' });
    steps.forEach(function (s, idx) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';

      farmList.appendChild(el('li', { class: 'farm-item' },
        el('span', { class: 'step-num', text: String(idx + 1) + '.' }),
        el('div', null,
          el('div', { class: 'step-text', text: action }),
          tail ? el('div', { class: 'step-meta', text: tail }) : null
        )
      ));
    });

    drawer.appendChild(el('div', { class: 'drawer-section' },
      el('h3', { text: 'Farm plan' }),
      farmList
    ));

    drawer.className = 'drawer open';
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(renderTopHeader());
    shell.appendChild(renderHero());
    shell.appendChild(renderFilters());
    shell.appendChild(renderViewBar());
    shell.appendChild(state.tab === 'pre-token' ? renderTable() : renderLiveTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');

    if (!drawer.isConnected) app.appendChild(drawer);
    if (state.selected) {
      openDrawer(state.selected);
    }
  }

  readHash();
  render();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) {
      closeDrawer();
    }
  });
})();
