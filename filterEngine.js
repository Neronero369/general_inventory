/**
 * =========================================================================
 * filterEngine.js - High-Performance Multi-Select Inventory Filter Engine
 * =========================================================================
 * Core filtering logic for 150K records:
 *  - extractUniqueValues: Single-pass O(N) extraction including depot/store
 *  - populateDropdowns: Injects sorted options into the 5 multi-select dropdowns
 *  - debounce: 300ms delay wrapper for input events
 *  - applyFilters: High-speed multi-select filtering with array inclusion & early returns
 * =========================================================================
 */

/**
 * 1. Debounce utility to prevent unnecessary filter runs on rapid keystrokes
 * @param {Function} func - Function to execute
 * @param {number} delay - Delay in ms (default 300ms)
 * @returns {Function}
 */
function debounce(func, delay = 300) {
  let timerId;
  return function (...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * 2. Iterates through the Excel JSON exactly ONCE to extract unique, sorted sets
 *    for columns: 'famille', 'genre', 'taille', 'marque', and 'depot/store'.
 * @param {Array<Object>} data - Raw inventory JSON array from Excel
 * @returns {Object} { famille: string[], genre: string[], taille: string[], marque: string[], depot: string[] }
 */
function extractUniqueValues(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { famille: [], genre: [], taille: [], marque: [], depot: [] };
  }

  const familleSet = new Set();
  const genreSet = new Set();
  const tailleSet = new Set();
  const marqueSet = new Set();
  const depotSet = new Set();

  const len = data.length;

  // Single-pass O(N) iteration
  for (let i = 0; i < len; i++) {
    const row = data[i];

    if (row.famille) {
      const fam = String(row.famille).trim();
      if (fam) familleSet.add(fam);
    }

    if (row.genre) {
      const gen = String(row.genre).trim();
      if (gen) genreSet.add(gen);
    }

    if (row.taille !== undefined && row.taille !== null) {
      const tai = String(row.taille).trim();
      if (tai) tailleSet.add(tai);
    }

    if (row.marque) {
      const mar = String(row.marque).trim();
      if (mar) marqueSet.add(mar);
    }

    const depotVal = row['depot/store'] || row.depot || row.store;
    if (depotVal) {
      const dep = String(depotVal).trim();
      if (dep) depotSet.add(dep);
    }
  }

  // Natural numeric sort for sizes (e.g. 38, 39, 40, M, L)
  const tailleSorted = Array.from(tailleSet).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    famille: Array.from(familleSet).sort(),
    genre: Array.from(genreSet).sort(),
    taille: tailleSorted,
    marque: Array.from(marqueSet).sort(),
    depot: Array.from(depotSet).sort()
  };
}

/**
 * 3. Injects unique values as <option> tags into the 5 sidebar multi-select dropdowns
 * @param {Object} uniqueValues - Output from extractUniqueValues
 */
function populateDropdowns(uniqueValues) {
  const dropdownMapping = [
    { id: 'filter-depot',  list: uniqueValues.depot },
    { id: 'filterFamille', list: uniqueValues.famille },
    { id: 'filterGenre',   list: uniqueValues.genre },
    { id: 'filterTaille',  list: uniqueValues.taille },
    { id: 'filterMarque',  list: uniqueValues.marque }
  ];

  dropdownMapping.forEach(({ id, list }) => {
    const select = document.getElementById(id);
    if (!select) return;

    // Reset options
    select.innerHTML = '';

    // Append sorted distinct values
    list.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });

    select.disabled = false;
  });
}

/**
 * Updates UI badges for active filters count and matched records
 */
function updateFilterBadges() {
  if (!window.state) return;
  const { filters, rawData, filteredData } = window.state;
  
  let activeCount = 0;
  ['depot', 'famille', 'genre', 'taille', 'marque'].forEach(key => {
    if (Array.isArray(filters[key]) && filters[key].length > 0) {
      activeCount += filters[key].length;
    }
  });
  if (filters.searchSKU && filters.searchSKU.trim().length > 0) {
    activeCount += 1;
  }

  // Active filters badge
  const countBadge = document.getElementById('activeFiltersCountBadge');
  if (countBadge) {
    if (activeCount > 0) {
      countBadge.textContent = `${activeCount} Actif${activeCount > 1 ? 's' : ''}`;
      countBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 ml-0.5';
    } else {
      countBadge.textContent = 'Aucun';
      countBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 ml-0.5';
    }
  }

  // Reset button state
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    if (activeCount > 0) {
      resetBtn.classList.remove('opacity-40', 'pointer-events-none');
      resetBtn.classList.add('opacity-100');
    } else {
      resetBtn.classList.add('opacity-40', 'pointer-events-none');
      resetBtn.classList.remove('opacity-100');
    }
  }

  // Update per-category selection count badges & labels (e.g. "MARQUE (2)")
  const categoryConfigs = [
    { key: 'depot',   labelId: 'label-depot',   badgeId: 'badge-count-depot',   name: 'DEPOT / MAGASIN' },
    { key: 'famille', labelId: 'label-famille', badgeId: 'badge-count-famille', name: 'FAMILLE' },
    { key: 'genre',   labelId: 'label-genre',   badgeId: 'badge-count-genre',   name: 'GENRE' },
    { key: 'taille',  labelId: 'label-taille',  badgeId: 'badge-count-taille',  name: 'TAILLE' },
    { key: 'marque',  labelId: 'label-marque',  badgeId: 'badge-count-marque',  name: 'MARQUE' }
  ];

  categoryConfigs.forEach(({ key, labelId, badgeId, name }) => {
    const count = Array.isArray(filters[key]) ? filters[key].length : 0;
    const badge = document.getElementById(badgeId);
    if (badge) {
      if (count > 0) {
        badge.textContent = `(${count})`;
        badge.classList.remove('hidden');
      } else {
        badge.textContent = '';
        badge.classList.add('hidden');
      }
    }
    const label = document.getElementById(labelId);
    if (label) {
      label.textContent = name;
    }
  });

  // Matched records badge (if present)
  const matchedBadge = document.getElementById('matchedRecordsBadge');
  if (matchedBadge && rawData && rawData.length > 0) {
    matchedBadge.classList.remove('hidden');
    matchedBadge.classList.add('flex');
    const span = matchedBadge.querySelector('span');
    if (span) {
      span.textContent = `${(filteredData || []).length.toLocaleString()} / ${rawData.length.toLocaleString()} Articles`;
    }
  }
}

/**
 * 4. Dropdown event listeners setup:
 *    Instead of grabbing a single e.target.value, uses
 *    Array.from(e.target.selectedOptions).map(opt => opt.value) to capture all selected values.
 */
function setupDropdownListeners() {
  const dropdownConfigs = [
    { id: 'filter-depot',  key: 'depot',   labelId: 'label-depot',   badgeId: 'badge-count-depot',   name: 'DEPOT / MAGASIN' },
    { id: 'filterFamille', key: 'famille', labelId: 'label-famille', badgeId: 'badge-count-famille', name: 'FAMILLE' },
    { id: 'filterGenre',   key: 'genre',   labelId: 'label-genre',   badgeId: 'badge-count-genre',   name: 'GENRE' },
    { id: 'filterTaille',  key: 'taille',  labelId: 'label-taille',  badgeId: 'badge-count-taille',  name: 'TAILLE' },
    { id: 'filterMarque',  key: 'marque',  labelId: 'label-marque',  badgeId: 'badge-count-marque',  name: 'MARQUE' }
  ];

  dropdownConfigs.forEach(({ id, key, labelId, badgeId, name }) => {
    const select = document.getElementById(id);
    if (!select) return;

    // Use named handler to avoid double-attaching if called multiple times
    select.onchange = (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      if (window.state && window.state.filters) {
        window.state.filters[key] = selected;
      }

      // Update micro badge next to label showing selection count (e.g. "MARQUE (2)")
      const count = selected.length;
      const badge = document.getElementById(badgeId);
      if (badge) {
        if (count > 0) {
          badge.textContent = `(${count})`;
          badge.classList.remove('hidden');
        } else {
          badge.textContent = '';
          badge.classList.add('hidden');
        }
      }
      const label = document.getElementById(labelId);
      if (label) {
        label.textContent = name;
      }

      applyFilters();
    };
  });
}

/**
 * 5. Core applyFilters function
 *    Reads active criteria from window.state.filters and filters window.state.rawData.
 *    For array filters: if filter.length > 0, checks if row value is included in array.
 *    If filter.length === 0, that filter is ignored (all included).
 *    SKU search (code_article) is a case-insensitive partial match (includes).
 *    Uses early returns/continues inside the loop for optimal performance.
 * @returns {Array<Object>} The filtered records
 */
function applyFilters() {
  if (!window.state || !Array.isArray(window.state.rawData)) {
    console.warn('[FilterEngine] state or state.rawData is not available.');
    return [];
  }

  const { rawData, filters } = window.state;
  const { famille, genre, taille, marque, depot, searchSKU } = filters;

  const hasFamille = Array.isArray(famille) && famille.length > 0;
  const hasGenre   = Array.isArray(genre) && genre.length > 0;
  const hasTaille  = Array.isArray(taille) && taille.length > 0;
  const hasMarque  = Array.isArray(marque) && marque.length > 0;
  const hasDepot   = Array.isArray(depot) && depot.length > 0;

  const skuQuery = (searchSKU || '').trim().toLowerCase();
  const hasSku = skuQuery.length > 0;

  // If no filters are active, return full rawData directly
  if (!hasFamille && !hasGenre && !hasTaille && !hasMarque && !hasDepot && !hasSku) {
    window.state.filteredData = rawData;
    console.log("Filtered Dataset:", window.state.filteredData);

    updateFilterBadges();

    // Update KPIs
    if (window.KPIEngine && typeof window.KPIEngine.calculateKPIs === 'function') {
      const kpis = window.KPIEngine.calculateKPIs(window.state.filteredData);
      window.KPIEngine.updateKPICardsUI(kpis);
    }

    // Update Table & Chart
    if (window.UIRenderer) {
      window.UIRenderer.renderTable(window.state.filteredData);
      window.UIRenderer.renderChart(window.state.filteredData);
    }

    return window.state.filteredData;
  }

  const filtered = [];
  const len = rawData.length;

  // High-performance loop with early returns (continues)
  for (let i = 0; i < len; i++) {
    const row = rawData[i];

    // Check Depot (multi-select inclusion)
    if (hasDepot) {
      const rawDepot = row['depot/store'] || row.depot || row.store;
      const rowDepot = String(rawDepot || '').trim();
      if (!depot.includes(rowDepot) && !depot.includes(rawDepot)) {
        continue; // Early return to next item
      }
    }

    // Check Famille (multi-select inclusion)
    if (hasFamille) {
      const rowFam = String(row.famille || '').trim();
      if (!famille.includes(rowFam) && !famille.includes(row.famille)) {
        continue; // Early return
      }
    }

    // Check Genre (multi-select inclusion)
    if (hasGenre) {
      const rowGen = String(row.genre || '').trim();
      if (!genre.includes(rowGen) && !genre.includes(row.genre)) {
        continue; // Early return
      }
    }

    // Check Taille (multi-select inclusion)
    if (hasTaille) {
      const rowTai = (row.taille !== undefined && row.taille !== null) ? String(row.taille).trim() : '';
      if (!taille.includes(rowTai) && !taille.includes(row.taille)) {
        continue; // Early return
      }
    }

    // Check Marque (multi-select inclusion)
    if (hasMarque) {
      const rowMar = String(row.marque || '').trim();
      if (!marque.includes(rowMar) && !marque.includes(row.marque)) {
        continue; // Early return
      }
    }

    // Check SKU (code_article) or Barcode (UPC) - case-insensitive partial match
    if (hasSku) {
      const matchSku = row.code_article && String(row.code_article).toLowerCase().includes(skuQuery);
      const matchUpc = (row.upc !== undefined && row.upc !== null) && String(row.upc).toLowerCase().includes(skuQuery);
      if (!matchSku && !matchUpc) {
        continue; // Early return
      }
    }

    // All active criteria passed
    filtered.push(row);
  }

  window.state.filteredData = filtered;

  // Requirement: Simply console.log the resulting filtered dataset
  console.log("Filtered Dataset:", window.state.filteredData);

  updateFilterBadges();

  // Update KPIs
  if (window.KPIEngine && typeof window.KPIEngine.calculateKPIs === 'function') {
    const kpis = window.KPIEngine.calculateKPIs(window.state.filteredData);
    window.KPIEngine.updateKPICardsUI(kpis);
  }

  // Update Table & Chart
  if (window.UIRenderer) {
    window.UIRenderer.renderTable(window.state.filteredData);
    window.UIRenderer.renderChart(window.state.filteredData);
  }

  return filtered;
}

// Expose filter engine utilities globally on window
window.FilterEngine = {
  debounce,
  extractUniqueValues,
  populateDropdowns,
  setupDropdownListeners,
  updateFilterBadges,
  applyFilters
};
