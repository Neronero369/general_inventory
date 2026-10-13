/**
 * =========================================================================
 * uiRenderer.js - High-Performance Table & Chart.js Visualization Engine
 * =========================================================================
 * Handles:
 *  1. renderTable: Responsive data table with top 200 row virtualization slice
 *  2. renderChart: Chart.js bar graph grouping inventory by depot/store with
 *     instance destruction to eliminate hover glitches
 * =========================================================================
 */

(function (window) {
  'use strict';

  // Private chart instance tracking to avoid hover glitches
  let chartInstance = null;

  /**
   * Helper function to determine store brand color:
   * - includes 'skechers' -> #3b82f6 (Tailwind Blue-500)
   * - includes 'footland' -> #f97316 (Tailwind Orange-500)
   * - includes 'x-tep' or 'xtep' -> #ef4444 (Tailwind Red-500)
   * - default fallback -> #cbd5e1 (Tailwind Slate-300)
   * @param {string} storeName
   * @returns {string} HEX color string
   */
  function getStoreColor(storeName) {
    if (!storeName || typeof storeName !== 'string') {
      return '#cbd5e1';
    }
    const name = storeName.toLowerCase();
    if (name.includes('skechers')) {
      return '#3b82f6';
    }
    if (name.includes('footland')) {
      return '#f97316';
    }
    if (name.includes('x-tep') || name.includes('xtep')) {
      return '#ef4444';
    }
    return '#cbd5e1';
  }

  // Expose on window for shared access
  window.getStoreColor = getStoreColor;

  /**
   * Helper currency formatter
   */
  function formatMoney(amount) {
    if (window.KPIEngine && typeof window.KPIEngine.formatCurrency === 'function') {
      return window.KPIEngine.formatCurrency(amount);
    }
    return Number(amount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' DZD';
  }

  /**
   * 1. Renders the responsive HTML table inside #tableContainer
   * Performance rule: Slices to first 200 rows if > 200 items.
   * Columns: Depot, Marque, Famille, Genre, Code Article (SKU), Taille, Qty, Valeur TTC
   * @param {Array<Object>} filteredData
   */
  function renderTable(filteredData) {
    const tableContainer = document.getElementById('tableContainer');
    const tableSubtitle = document.getElementById('tableSubtitleNote');
    const tableCountBadge = document.getElementById('tableRecordCountBadge');

    if (!tableContainer) {
      console.warn('[UIRenderer] #tableContainer not found in DOM.');
      return;
    }

    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      if (tableSubtitle) tableSubtitle.textContent = 'Aucun enregistrement d\'inventaire correspondant';
      if (tableCountBadge) tableCountBadge.innerHTML = '';
      tableContainer.innerHTML = `
        <div class="p-10 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-3xl mb-2 text-slate-300"></i>
          <p class="text-sm font-medium">Aucun enregistrement ne correspond aux filtres sélectionnés.</p>
        </div>
      `;
      return;
    }

    const totalCount = filteredData.length;
    const isSliced = totalCount > 200;
    const displayData = isSliced ? filteredData.slice(0, 200) : filteredData;

    // Update note above table
    if (tableSubtitle) {
      if (isSliced) {
        tableSubtitle.innerHTML = `<span class="inline-flex items-center gap-1.5 text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          <i class="fa-solid fa-bolt text-xs"></i> Affichage des 200 premiers résultats
        </span> sur ${totalCount.toLocaleString()} lignes filtrées (Protection des performances)`;
      } else {
        tableSubtitle.textContent = `Affichage de la totalité des ${totalCount.toLocaleString()} lignes`;
      }
    }

    if (tableCountBadge) {
      tableCountBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        ${displayData.length} sur ${totalCount.toLocaleString()} lignes
      </span>`;
    }

    // Build Table HTML
    let tableHtml = `
      <table class="w-full text-left text-xs text-slate-700 border-collapse">
        <thead class="sticky top-0 bg-slate-900 text-slate-200 uppercase text-[11px] font-bold tracking-wider z-10 shadow-xs">
          <tr>
            <th scope="col" class="py-3 px-4 whitespace-nowrap">Dépôt</th>
            <th scope="col" class="py-3 px-4 whitespace-nowrap">Marque</th>
            <th scope="col" class="py-3 px-4 whitespace-nowrap">Famille</th>
            <th scope="col" class="py-3 px-4 whitespace-nowrap">Genre</th>
            <th scope="col" class="py-3 px-4 whitespace-nowrap">Code Article (SKU)</th>
            <th scope="col" class="py-3 px-4 text-center whitespace-nowrap">Taille</th>
            <th scope="col" class="py-3 px-4 text-right whitespace-nowrap">Quantité</th>
            <th scope="col" class="py-3 px-4 text-right whitespace-nowrap">Valeur TTC</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
    `;

    const rowCount = displayData.length;
    for (let i = 0; i < rowCount; i++) {
      const row = displayData[i];

      const depot = row['depot/store'] || row.depot || row.code_depot || '--';
      const marque = row.marque || '--';
      const famille = row.famille || '--';
      const genre = row.genre || '--';
      const sku = row.code_article || '--';
      const upc = (row.upc !== undefined && row.upc !== null) ? String(row.upc).trim() : '';
      const taille = (row.taille !== undefined && row.taille !== null) ? String(row.taille).trim() : '--';

      const qty = typeof row.qty === 'number' ? row.qty : (parseFloat(row.qty) || 0);
      const retailPrice = typeof row.full_price_ttc === 'number' 
        ? row.full_price_ttc 
        : (parseFloat(row.full_price_ttc) || 0);

      const valeurTTC = qty * retailPrice;
      const zebraBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';

      tableHtml += `
        <tr class="${zebraBg} hover:bg-indigo-50/50 transition-colors">
          <td class="py-2.5 px-4 font-semibold text-slate-800 whitespace-nowrap">${depot}</td>
          <td class="py-2.5 px-4 whitespace-nowrap"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">${marque}</span></td>
          <td class="py-2.5 px-4 text-slate-600 whitespace-nowrap">${famille}</td>
          <td class="py-2.5 px-4 text-slate-600 whitespace-nowrap">${genre}</td>
          <td class="py-2.5 px-4 font-mono font-bold text-indigo-700 tracking-tight whitespace-nowrap">
            <span>${sku}</span>
            ${upc ? `<span class="block text-[10px] text-slate-400 font-sans font-normal tracking-normal"><i class="fa-solid fa-barcode text-[9px] mr-1"></i>${upc}</span>` : ''}
          </td>
          <td class="py-2.5 px-4 text-center font-medium whitespace-nowrap">${taille}</td>
          <td class="py-2.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">${Math.round(qty).toLocaleString()}</td>
          <td class="py-2.5 px-4 text-right font-medium text-emerald-700 whitespace-nowrap">${formatMoney(valeurTTC)}</td>
        </tr>
      `;
    }

    tableHtml += `
        </tbody>
      </table>
    `;

    tableContainer.innerHTML = tableHtml;
  }

  /**
   * 2. Renders the Chart.js Bar Chart grouped by depot/store
   * Destroys existing chartInstance before drawing a new one to prevent hover glitch.
   * @param {Array<Object>} filteredData
   */
  function renderChart(filteredData) {
    const canvas = document.getElementById('inventoryChart');
    const chartBadge = document.getElementById('chartDepotsCountBadge');

    if (!canvas) {
      console.warn('[UIRenderer] #inventoryChart canvas not found.');
      return;
    }

    // CRITICAL REQUIREMENT: Destroy existing Chart instance before drawing new one
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      if (chartBadge) chartBadge.textContent = '0 Emplacements';
      return;
    }

    // Group filteredData by depot/store, summing qty
    const storeQtyMap = {};
    const len = filteredData.length;

    for (let i = 0; i < len; i++) {
      const row = filteredData[i];
      const storeName = row['depot/store'] || row.depot || 'Emplacement Inconnu';
      const qty = typeof row.qty === 'number' ? row.qty : (parseFloat(row.qty) || 0);

      if (!storeQtyMap[storeName]) {
        storeQtyMap[storeName] = 0;
      }
      storeQtyMap[storeName] += qty;
    }

    // Sort locations by total quantity descending
    const sortedLocations = Object.entries(storeQtyMap)
      .sort((a, b) => b[1] - a[1]);

    const labels = sortedLocations.map(entry => entry[0]);
    const dataValues = sortedLocations.map(entry => Math.round(entry[1]));

    if (chartBadge) {
      chartBadge.textContent = `${labels.length} Emplacements`;
    }

    // Check Chart.js availability
    if (typeof Chart === 'undefined') {
      console.error('[UIRenderer] Chart.js library not loaded.');
      return;
    }

    const ctx = canvas.getContext('2d');

    const barColors = labels.map(label => getStoreColor(label));

    // Create modern Chart.js bar chart
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Quantité en Stock (Unités)',
          data: dataValues,
          backgroundColor: barColors,
          hoverBackgroundColor: barColors,
          borderColor: barColors,
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 42
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 350
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
            bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                return ` Stock : ${context.parsed.y.toLocaleString()} unités`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                family: 'Plus Jakarta Sans',
                size: 11
              },
              color: '#64748b',
              maxRotation: 45,
              minRotation: 20
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: '#f1f5f9'
            },
            ticks: {
              font: {
                family: 'Plus Jakarta Sans',
                size: 11
              },
              color: '#64748b',
              callback: function (val) {
                return Number(val).toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  // Expose on window.UIRenderer
  window.UIRenderer = {
    renderTable,
    renderChart
  };

})(window);
