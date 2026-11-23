// Obsidian Terminal Dashboard Engine (Vanilla JS, standard browser API)
// High-density pre-token analytics, sector comps & institutional farm playbook
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
    sort: 'rank',
    dir: 1,
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
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
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
    if (params.get('tab')) state.tab = params.get('tab');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
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
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  function renderHeader() {
    return el('header', { class: 'top-nav' },
      el('div', { class: 'brand-group' },
        el('div', { class: 'brand-logo', text: 'OT' }),
        el('div', { class: 'brand-titles' },
          el('span', { class: 'brand-name', text: 'Obsidian Terminal' }),
          el('span', { class: 'brand-sub', text: 'Pre-Token Valuation Radar // ' + DATA.model_version })
        )
      ),
      el('div', { class: 'top-pills' },
        el('span', { class: 'meta-pill', html: 'Snapshot: <b>' + DATA.as_of + '</b>' }),
        el('span', { class: 'meta-pill', html: 'Watchlist: <b>' + DATA.watchlist_size + ' Covered</b>' }),
        el('span', { class: 'meta-pill', html: 'Scored: <b>' + DATA.board_size + ' Protocols</b>' })
      )
    );
  }

  function renderKpiCards() {
    var totalImplied = DATA.rows.reduce(function (acc, r) { return acc + r.implied_value_usd; }, 0);
    var totalTvl = DATA.rows.reduce(function (acc, r) { return acc + r.tvl_usd; }, 0);
    
    // Find top sector
    var catTotals = {};
    DATA.rows.forEach(function (r) {
      var cat = r.category || 'Other';
      catTotals[cat] = (catTotals[cat] || 0) + r.implied_value_usd;
    });
    var topCat = 'Dexes';
    var topCatVal = 0;
    Object.keys(catTotals).forEach(function (k) {
      if (catTotals[k] > topCatVal) {
        topCatVal = catTotals[k];
        topCat = k;
      }
    });

    return el('div', { class: 'kpi-grid' },
      el('div', { class: 'kpi-card' },
        el('span', { class: 'kpi-label', text: 'Total Implied Value' }),
        el('span', { class: 'kpi-value', text: fmtUsd(totalImplied) }),
        el('span', { class: 'kpi-desc', text: 'Aggregated pre-token FDV model' })
      ),
      el('div', { class: 'kpi-card' },
        el('span', { class: 'kpi-label', text: 'Watchlist Coverage' }),
        el('span', { class: 'kpi-value', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }),
        el('span', { class: 'kpi-desc', text: '100% floor protocols covered' })
      ),
      el('div', { class: 'kpi-card' },
        el('span', { class: 'kpi-label', text: 'Total Pre-Token TVL' }),
        el('span', { class: 'kpi-value', text: fmtUsd(totalTvl) }),
        el('span', { class: 'kpi-desc', text: 'Across ' + DATA.board_size + ' tracked protocols' })
      ),
      el('div', { class: 'kpi-card' },
        el('span', { class: 'kpi-label', text: 'Leading Sector' }),
        el('span', { class: 'kpi-value', text: topCat }),
        el('span', { class: 'kpi-desc', text: fmtUsd(topCatVal) + ' sector implied FDV' })
      )
    );
  }

  function renderControls() {
    var search = el('input', {
      type: 'search',
      class: 'search-box',
      placeholder: 'Search name, chain, slug...',
      value: state.q,
      oninput: function (e) {
        state.q = e.target.value;
        writeHash();
        render();
      }
    });

    var catSelect = el('select', {
      class: 'select-filter',
      onchange: function (e) {
        state.category = e.target.value;
        writeHash();
        render();
      }
    },
      el('option', { value: 'all', text: 'All Sectors' }),
      getCategories().map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null });
      })
    );

    var chainSelect = el('select', {
      class: 'select-filter',
      onchange: function (e) {
        state.chain = e.target.value;
        writeHash();
        render();
      }
    },
      el('option', { value: 'all', text: 'All Chains' }),
      getChains().map(function (c) {
        return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null });
      })
    );

    var preBtn = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-Token Radar (' + DATA.board_size + ')',
      onclick: function () { state.tab = 'pre-token'; writeHash(); render(); }
    });

    var liveBtn = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'live' ? 'true' : 'false',
      text: 'Live Comps (' + DATA.live.length + ')',
      onclick: function () { state.tab = 'live'; writeHash(); render(); }
    });

    var countText = state.tab === 'pre-token' ?
      filterRows().length + ' / ' + DATA.board_size + ' pre-token protocols' :
      DATA.live.length + ' live benchmark comps';

    return el('div', { class: 'controls-bar' },
      el('div', { class: 'filter-group' },
        search,
        catSelect,
        chainSelect,
        el('div', { class: 'tab-group' }, preBtn, liveBtn)
      ),
      el('span', { class: 'item-count', text: countText })
    );
  }

  function sortTh(key, label, extraClass) {
    var isCurrent = state.sort === key;
    var arrow = isCurrent ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return el('th', { class: extraClass || '' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) {
            state.dir = -state.dir;
          } else {
            state.sort = key;
            state.dir = key === 'name' || key === 'rank' ? 1 : -1;
          }
          render();
        }
      }, label + arrow)
    );
  }

  function renderTable() {
    var list = sortRows(filterRows());
    if (list.length === 0) {
      return el('div', { class: 'table-panel' },
        el('div', { class: 'empty-box' },
          el('h3', { text: 'No matching protocols located' }),
          el('p', { text: 'Clear your search query or reset sector/chain filters to inspect the board.' }),
          el('button', {
            type: 'button',
            class: 'reset-btn',
            text: 'Reset Filters',
            onclick: function () {
              state.q = '';
              state.category = 'all';
              state.chain = 'all';
              writeHash();
              render();
            }
          })
        )
      );
    }

    var maxVal = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');

    list.forEach(function (r) {
      var isWatchlist = r.tvl_usd >= DATA.floor_usd;
      var growthCls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var barPct = Math.max(4, Math.round((r.implied_value_usd / maxVal) * 100));

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openModal(r.slug); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal(r.slug);
          }
        }
      },
        el('td', { class: 'rank-cell num', text: '#' + r.rank }),
        el('td', null,
          el('div', { class: 'protocol-cell' },
            el('div', { class: 'protocol-name-row' },
              el('span', { class: 'proto-title', text: r.name }),
              isWatchlist ? el('span', { class: 'watchlist-badge', text: 'Watchlist Floor' }) : null
            ),
            el('div', { class: 'proto-sub' },
              el('span', { class: 'sector-pill', text: r.category || 'Other' }),
              ' ',
              el('span', { class: 'chain-tag', text: (r.chains || []).slice(0, 3).join(', ') })
            )
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null,
          el('div', { class: 'implied-cell' },
            el('div', { class: 'implied-bar-bg' },
              el('div', { class: 'implied-bar-fill', style: 'width: ' + barPct + '%' })
            ),
            el('span', { class: 'implied-amount', text: fmtUsd(r.implied_value_usd) })
          )
        ),
        el('td', { style: 'text-align: right;' },
          el('button', {
            type: 'button',
            class: 'action-btn',
            text: 'Playbook →',
            onclick: function (e) {
              e.stopPropagation();
              openModal(r.slug);
            }
          })
        )
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Obsidian Terminal Pre-Token Leaderboard // Click any protocol to inspect sector comps and institutional farm playbook' }),
          el('thead', null,
            el('tr', null,
              sortTh('rank', 'Rank', 'num'),
              sortTh('name', 'Protocol / Sector'),
              sortTh('tvl', 'TVL', 'num'),
              sortTh('growth', '7d Momentum', 'num'),
              sortTh('age', 'Protocol Age', 'num'),
              sortTh('implied', 'Implied Valuation', 'num'),
              el('th', { style: 'text-align: right;' }, 'Action')
            )
          ),
          tbody
        )
      )
    );
  }

  function renderLiveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r, idx) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rank-cell num', text: '#' + (idx + 1) }),
        el('td', null,
          el('div', { class: 'protocol-cell' },
            el('span', { class: 'proto-title', text: r.name }),
            el('div', { class: 'proto-sub' },
              el('span', { class: 'sector-pill', text: r.category || 'Other' }),
              ' ',
              el('span', { class: 'chain-tag', text: (r.chains || []).slice(0, 3).join(', ') })
            )
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num' },
          el('span', { style: 'color: var(--accent-cyan); font-weight: 700;', text: fmtUsd(r.mcap_usd) })
        ),
        el('td', { style: 'text-align: right;' },
          el('span', { class: 'meta-pill', text: 'Live Token' })
        )
      ));
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Benchmark Comps: Live Market Capitalization of Traded Tokens (Used for Sector Calibration)' }),
          el('thead', null,
            el('tr', null,
              el('th', { class: 'num' }, 'Rank'),
              el('th', null, 'Protocol'),
              el('th', { class: 'num' }, 'TVL'),
              el('th', { class: 'num' }, '7d Momentum'),
              el('th', { class: 'num' }, 'Market Cap (FDV)'),
              el('th', { style: 'text-align: right;' }, 'Status')
            )
          ),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail-modal', id: 'detail-modal' });
  dialog.addEventListener('close', function () {
    state.selected = null;
    writeHash();
    render();
  });

  function openModal(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;

    state.selected = slug;
    writeHash();
    dialog.textContent = '';

    // Header
    dialog.appendChild(el('div', { class: 'modal-header' },
      el('div', { class: 'modal-title-group' },
        el('h2', { text: '#' + row.rank + ' ' + row.name }),
        el('p', { class: 'modal-subtitle', text: (row.category || 'Other') + ' • Chains: ' + (row.chains || []).join(', ') })
      ),
      el('button', {
        type: 'button',
        class: 'close-btn',
        text: 'Close [ESC]',
        onclick: function () { dialog.close(); }
      })
    ));

    // Valuation stats
    dialog.appendChild(el('div', { class: 'detail-section' },
      el('h3', { text: 'Institutional Valuation Decomposition' }),
      el('div', { class: 'valuation-breakdown-grid' },
        el('div', { class: 'grid-stat' }, el('span', { text: 'Total Value Locked' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'grid-stat' }, el('span', { text: '7d Momentum' }), el('b', { class: row.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(row.change_7d) })),
        el('div', { class: 'grid-stat' }, el('span', { text: 'Protocol Age' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { class: 'grid-stat' }, el('span', { text: 'Growth Multiplier' }), el('b', { text: String(row.growth_multiplier) + 'x' })),
        el('div', { class: 'grid-stat' }, el('span', { text: 'Maturity Scaling' }), el('b', { text: String(row.maturity_multiplier) + 'x' })),
        el('div', { class: 'grid-stat' }, el('span', { text: 'Implied FDV' }), el('b', { style: 'color: var(--accent-cyan);', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('div', { class: 'formula-card', text: 'Model: base_power_tvl x sector_comps x tanh_growth_dampener x log_age_maturity x multichain_factor = ' + fmtUsd(row.implied_value_usd) })
    ));

    // 6-step playbook
    var stepsList = el('ul', { class: 'playbook-list' });
    var steps = row.farm_steps || [
      'Provision clean wallet and secure seed phrase offline. Cost: ~$2.50 gas. Time: 5 minutes.',
      'Deposit capital into verified protocol smart contracts. Cost: $150 capital. Time: 15 minutes.',
      'Maintain weekly active interactions to optimize sybil score. Cost: ~$1.50 gas. Time: 10 minutes.',
      'Hold position across minimum snapshot horizon. Cost: principal locked. Time: 60 days.',
      'Inspect official points portal and audit token allowances. Cost: free audit. Time: 10 minutes.',
      'Log transaction hashes and telemetry ahead of TGE claims. Cost: zero. Time: 5 minutes.'
    ];

    steps.forEach(function (s, idx) {
      var cost = '';
      var time = '';
      var costIdx = s.indexOf(' Cost: ');
      var text = s;
      if (costIdx >= 0) {
        text = s.slice(0, costIdx);
        var rest = s.slice(costIdx + 7);
        var timeIdx = rest.indexOf('. Time: ');
        if (timeIdx >= 0) {
          cost = rest.slice(0, timeIdx);
          time = rest.slice(timeIdx + 8).replace(/\.$/, '');
        } else {
          cost = rest.replace(/\.$/, '');
        }
      }

      stepsList.appendChild(el('li', { class: 'playbook-step' },
        el('div', { class: 'step-num-badge', text: String(idx + 1) }),
        el('div', { class: 'step-body' },
          el('div', { class: 'step-text', text: text }),
          (cost || time) ? el('div', { class: 'step-meta' },
            cost ? el('span', { html: 'Cost: <b>' + cost + '</b>' }) : null,
            time ? el('span', { html: 'Duration: <b>' + time + '</b>' }) : null
          ) : null
        )
      ));
    });

    dialog.appendChild(el('div', { class: 'detail-section' },
      el('h3', { text: 'Institutional Farm Playbook & Eligibility Steps' }),
      stepsList
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
    shell.appendChild(renderHeader());
    shell.appendChild(renderKpiCards());
    shell.appendChild(renderControls());
    shell.appendChild(state.tab === 'pre-token' ? renderTable() : renderLiveTable());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');

    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) {
      openModal(state.selected);
    }
  }

  readHash();
  render();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) {
      dialog.close();
    }
  });
})();
