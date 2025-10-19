/* ===== FairShare charts.js =====
 * Uses localStorage ('fairshare_expenses') if present; otherwise falls back to dummy data.
 * Charts:
 *  1) lineGroupSpend  – Monthly total spend (last 9 months or dummy)
 *  2) barCategory     – Spend by category (current month or dummy)
 *  3) pieShares       – Split by person (overall shares or dummy)
 */

(function () {
  // ---------- Helpers ----------
  const KEY = 'fairshare_expenses';
  const BRAND = '#6c5ce7';
  const BRAND_2 = '#a29bfe';

  // Global style (match site)
  if (window.Chart) {
    Chart.defaults.font.family =
      'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"';
    Chart.defaults.color = '#111827';
    Chart.defaults.borderColor = 'rgba(0,0,0,.1)';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.mode = 'index';
    Chart.defaults.plugins.tooltip.intersect = false;
  }

  const money = (n) =>
    (Number(n) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  const clean = (s = '') => s.trim().replace(/\s+/g, ' ');
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short' });
  };

  function getStorageExpenses() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(arr)) return [];
      // normalize to what expenses.html writes
      return arr.map((e) => ({
        id: e.id || '',
        date: e.date || '',
        desc: e.desc || e.description || '',
        category: e.category || '',
        amount: Number(e.amount) || 0,
        paidBy: clean(e.paidBy || e.addedBy || ''),
        split: (e.split || e.addedTo || '').split(',').map(clean).filter(Boolean),
        status: e.status || 'Unsettled',
      }));
    } catch {
      return [];
    }
  }

  // If an expense has no split list, assume it was split among all distinct names present (including payer)
  function deriveParticipantsList(expenses, exp) {
    if (exp.split.length) {
      // ensure payer present (common omission)
      if (exp.paidBy && !exp.split.some((n) => n.toLowerCase() === exp.paidBy.toLowerCase())) {
        return [...exp.split, exp.paidBy];
      }
      return exp.split;
    }
    // fallback: all distinct people discovered
    const everyone = new Set();
    expenses.forEach((x) => {
      if (x.paidBy) everyone.add(x.paidBy);
      x.split.forEach((n) => everyone.add(n));
    });
    if (exp.paidBy) everyone.add(exp.paidBy);
    return Array.from(everyone);
  }

  // ---------- Data (real or dummy) ----------
  const expenses = getStorageExpenses();
  const hasData = expenses.length > 0;

  // Dummy data (same domain semantics)
  const dummy = {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    monthlyTotals: [520, 610, 740, 680, 820, 765, 810, 930, 860],
    byCategory: { Food: 320, Rent: 1200, Travel: 450, Utilities: 300, Misc: 140 },
    shares: { Alex: 620, Sam: 510, Priya: 430, Jin: 390 },
  };

  // ---------- Aggregations from real data ----------
  let lineLabels = dummy.months.slice();
  let lineTotals = dummy.monthlyTotals.slice();
  let catLabels = Object.keys(dummy.byCategory);
  let catTotals = Object.values(dummy.byCategory);
  let shareLabels = Object.keys(dummy.shares);
  let shareTotals = Object.values(dummy.shares);

  if (hasData) {
    // 1) Monthly totals (last 9 months)
    const monthly = new Map(); // ym -> total amount
    expenses.forEach((e) => {
      if (!e.date || !e.amount) return;
      const d = new Date(e.date);
      if (isNaN(d)) return;
      const key = monthKey(d);
      monthly.set(key, (monthly.get(key) || 0) + e.amount);
    });

    const allMonths = Array.from(monthly.keys()).sort(); // ascending
    const last9 = allMonths.slice(-9);
    if (last9.length) {
      lineLabels = last9.map(monthLabel);
      lineTotals = last9.map((k) => monthly.get(k));
    }

    // 2) Category totals (most recent month with data; fallback to all-time)
    const recentYM = allMonths.length ? allMonths[allMonths.length - 1] : null;
    const catMap = new Map();
    expenses.forEach((e) => {
      if (!e.amount) return;
      if (recentYM) {
        const d = new Date(e.date || '');
        if (isNaN(d) || monthKey(d) !== recentYM) return;
      }
      const key = e.category || 'Uncategorized';
      catMap.set(key, (catMap.get(key) || 0) + e.amount);
    });
    if (catMap.size) {
      catLabels = Array.from(catMap.keys());
      catTotals = Array.from(catMap.values());
    }

    // 3) Shares by person (sum of split shares across all expenses)
    const shareMap = new Map();
    expenses.forEach((e) => {
      const participants = deriveParticipantsList(expenses, e).filter(Boolean);
      if (!participants.length || !e.amount) return;
      const share = e.amount / participants.length;
      participants.forEach((name) => {
        shareMap.set(name, (shareMap.get(name) || 0) + share);
      });
    });
    if (shareMap.size) {
      shareLabels = Array.from(shareMap.keys());
      shareTotals = Array.from(shareMap.values());
    }
  }

  // ---------- Create charts (only if element exists) ----------
  const palette = [
    BRAND,
    '#00C2A8',
    '#F59E0B',
    '#EF4444',
    '#3B82F6',
    '#10B981',
    '#8B5CF6',
    '#EC4899',
    '#6366F1',
  ];

  function makeLine() {
    const el = document.getElementById('lineGroupSpend');
    if (!el || !window.Chart) return;
    new Chart(el, {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [
          {
            label: 'Total Spend',
            data: lineTotals,
            borderColor: BRAND,
            backgroundColor: BRAND_2 + '55',
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${money(ctx.parsed.y)}`,
            },
          },
          title: { display: false },
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => money(v) } },
        },
      },
    });
  }

  function makeBar() {
    const el = document.getElementById('barCategory');
    if (!el || !window.Chart) return;
    new Chart(el, {
      type: 'bar',
      data: {
        labels: catLabels,
        datasets: [
          {
            label: 'Category Spend',
            data: catTotals,
            backgroundColor: catLabels.map((_, i) => palette[i % palette.length] + 'aa'),
            borderColor: catLabels.map((_, i) => palette[i % palette.length]),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${money(ctx.parsed.y)}`,
            },
          },
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => money(v) } },
        },
      },
    });
  }

  function makePie() {
    const el = document.getElementById('pieShares');
    if (!el || !window.Chart) return;
    new Chart(el, {
      type: 'doughnut',
      data: {
        labels: shareLabels,
        datasets: [{ data: shareTotals, backgroundColor: shareLabels.map((_, i) => palette[i % palette.length]) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = shareTotals.reduce((a, b) => a + b, 0) || 1;
                const v = ctx.parsed;
                const pct = ((v / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${money(v)} (${pct}%)`;
              },
            },
          },
          legend: { position: 'bottom' },
          title: { display: false },
        },
        cutout: '65%',
      },
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    makeLine();
    makeBar();
    makePie();
  });
})();
