/**
 * =========================================================================
 * kpiEngine.js - High-Performance Inventory KPI Calculation Engine
 * =========================================================================
 * Calculates core business metrics dynamically based on filtered dataset:
 *  - Total Quantity: sum(qty)
 *  - Retail Value (TTC): sum(qty * full_price_ttc)
 *  - Cost Value (Achats): sum(qty * prix_achat)
 *  - Active Locations: count of distinct stores/warehouses holding stock
 * 
 * Uses a single .reduce() loop (O(n) pass) for maximum performance with 150k rows.
 * =========================================================================
 */

(function (window) {
  'use strict';

  /**
   * Helper function to format currency values beautifully
   * e.g., 1,250,400.00 DZD
   * @param {number} amount
   * @returns {string}
   */
  function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '0.00 DZD';
    }
    return Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' DZD';
  }

  /**
   * Helper function to format quantities with thousands separators
   * e.g., 148,332
   * @param {number} qty
   * @returns {string}
   */
  function formatQuantity(qty) {
    if (qty === undefined || qty === null || isNaN(qty)) {
      return '0';
    }
    return Math.round(Number(qty)).toLocaleString('en-US');
  }

  /**
   * High-performance function to calculate all KPIs in a single .reduce() pass
   * @param {Array<Object>} filteredData - The array of filtered inventory items
   * @returns {Object} Calculated metrics and formatted strings
   */
  function calculateKPIs(filteredData) {
    if (!Array.isArray(filteredData) || filteredData.length === 0) {
      return {
        totalQty: 0,
        retailValue: 0,
        costValue: 0,
        activeLocations: 0,
        formattedTotalQty: '0',
        formattedRetailValue: '0.00 DZD',
        formattedCostValue: '0.00 DZD',
        formattedLocations: '0'
      };
    }

    const locationsSet = new Set();

    // Single .reduce() loop over filteredData for O(n) performance
    const totals = filteredData.reduce((acc, row) => {
      // 1. Total Quantity (float/int safe parse)
      const qty = typeof row.qty === 'number' ? row.qty : (parseFloat(row.qty) || 0);

      // 2. Retail Price & Cost Price
      const retailPrice = typeof row.full_price_ttc === 'number' 
        ? row.full_price_ttc 
        : (parseFloat(row.full_price_ttc) || 0);

      const costPrice = typeof row.prix_achat === 'number' 
        ? row.prix_achat 
        : (parseFloat(row.prix_achat) || 0);

      // Accumulate metrics
      acc.totalQty += qty;
      acc.retailValue += (qty * retailPrice);
      acc.costValue += (qty * costPrice);

      // 3. Track Active Locations (distinct depot/store holding stock)
      const storeName = row['depot/store'] || row.depot || row.store;
      if (storeName && qty > 0) {
        locationsSet.add(String(storeName).trim());
      } else if (storeName && !locationsSet.size) {
        // Fallback store tracking if all items have 0 stock
        locationsSet.add(String(storeName).trim());
      }

      return acc;
    }, {
      totalQty: 0,
      retailValue: 0,
      costValue: 0
    });

    const activeLocationsCount = locationsSet.size;

    return {
      totalQty: totals.totalQty,
      retailValue: totals.retailValue,
      costValue: totals.costValue,
      activeLocations: activeLocationsCount,
      formattedTotalQty: formatQuantity(totals.totalQty),
      formattedRetailValue: formatCurrency(totals.retailValue),
      formattedCostValue: formatCurrency(totals.costValue),
      formattedLocations: formatQuantity(activeLocationsCount)
    };
  }

  /**
   * Updates the 4 KPI card elements in the DOM:
   *  - #kpi-total-qty
   *  - #kpi-retail-value
   *  - #kpi-cost-value
   *  - #kpi-locations
   * @param {Object} kpis - Object returned by calculateKPIs
   */
  function updateKPICardsUI(kpis) {
    const elTotalQty    = document.getElementById('kpi-total-qty');
    const elRetailValue = document.getElementById('kpi-retail-value');
    const elCostValue   = document.getElementById('kpi-cost-value');
    const elLocations   = document.getElementById('kpi-locations');

    if (elTotalQty) {
      elTotalQty.innerText = kpis.formattedTotalQty;
      elTotalQty.title = `${kpis.formattedTotalQty} unités`;
    }
    if (elRetailValue) {
      elRetailValue.innerText = kpis.formattedRetailValue;
      elRetailValue.title = kpis.formattedRetailValue;
    }
    if (elCostValue) {
      elCostValue.innerText = kpis.formattedCostValue;
      elCostValue.title = kpis.formattedCostValue;
    }
    if (elLocations) {
      elLocations.innerText = kpis.formattedLocations;
      elLocations.title = `${kpis.formattedLocations} emplacements actifs`;
    }
  }

  // Expose on global window object
  window.KPIEngine = {
    calculateKPIs,
    updateKPICardsUI,
    formatCurrency,
    formatQuantity
  };

})(window);
