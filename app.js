/**
 * =========================================================================
 * app.js - Main Application Orchestrator (Step 3 - Dynamic KPIs)
 * =========================================================================
 * Wires together:
 *  - Excel upload via dataService.js -> state.rawData
 *  - Single-pass dimension extraction & dropdown population
 *  - Dropdown change events -> state.filters & applyFilters()
 *  - Debounced SKU search input -> state.filters.searchSKU & applyFilters()
 *  - applyFilters() recalculates KPIs via kpiEngine.js and updates UI cards
 * =========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('%c🚀 Enterprise Inventory Dashboard Initialized (Step 3 - Dynamic KPIs)', 'color: #6366f1; font-weight: bold; font-size: 13px;');

  // DOM Elements
  const filterDepot = document.getElementById('filter-depot');
  const filterFamille = document.getElementById('filterFamille');
  const filterGenre = document.getElementById('filterGenre');
  const filterTaille = document.getElementById('filterTaille');
  const filterMarque = document.getElementById('filterMarque');
  const skuSearchInput = document.getElementById('skuSearchInput');
  const clearSkuBtn = document.getElementById('clearSkuBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');

  // KPI UI Elements
  const elTotalQty    = document.getElementById('kpi-total-qty');
  const elRetailValue = document.getElementById('kpi-retail-value');
  const elCostValue   = document.getElementById('kpi-cost-value');
  const elLocations   = document.getElementById('kpi-locations');

  /**
   * Helper function to detect single brand and update KPI cards borderTopColor:
   * - Skechers -> #3b82f6 (Tailwind Blue-500)
   * - Footland -> #f97316 (Tailwind Orange-500)
   * - X-tep -> #ef4444 (Tailwind Red-500)
   * - Multiple brands or default -> #cbd5e1 (Tailwind Slate-300)
   */
  function updateKPIBrandStyling(filteredData) {
    const kpiCards = document.querySelectorAll('.kpi-card');
    if (!kpiCards.length) return;

    let targetBrand = null;
    const marqueFilter = window.state?.filters?.marque || [];
    const searchFilter = (window.state?.filters?.searchSKU || '').trim().toLowerCase();

    // 1. Direct Marque dropdown filter: exactly 1 brand selected
    if (marqueFilter.length === 1) {
      targetBrand = marqueFilter[0];
    } 
    // 2. Or brand searched via SKU/Search input
    else if (searchFilter.includes('skechers')) {
      targetBrand = 'skechers';
    } else if (searchFilter.includes('footland')) {
      targetBrand = 'footland';
    } else if (searchFilter.includes('x-tep') || searchFilter.includes('xtep')) {
      targetBrand = 'x-tep';
    }
    // 3. Or if filtered dataset has rows and all belong to exactly one brand
    else if (filteredData && filteredData.length > 0) {
      const distinctBrands = new Set();
      for (let i = 0; i < filteredData.length; i++) {
        const b = filteredData[i].marque || filteredData[i].Marque;
        if (b) distinctBrands.add(b.toString().trim().toLowerCase());
        if (distinctBrands.size > 1) break;
      }
      if (distinctBrands.size === 1) {
        targetBrand = Array.from(distinctBrands)[0];
      }
    }

    // Determine color
    let brandColor = '#cbd5e1';
    if (targetBrand) {
      if (typeof window.getStoreColor === 'function') {
        brandColor = window.getStoreColor(targetBrand);
      } else {
        const lower = targetBrand.toLowerCase();
        if (lower.includes('skechers')) brandColor = '#3b82f6';
        else if (lower.includes('footland')) brandColor = '#f97316';
        else if (lower.includes('x-tep') || lower.includes('xtep')) brandColor = '#ef4444';
      }
    }

    // Apply color to all KPI cards
    kpiCards.forEach(card => {
      card.style.borderTopColor = brandColor;
    });
  }

  /**
   * Core applyFilters function for app orchestrator:
   * 1. Filters rawData based on state.filters
   * 2. Calculates KPIs dynamically via kpiEngine.js (single .reduce() pass)
   * 3. Updates the innerText and title of the 4 KPI cards in the UI
   * 4. Updates KPI card borderTopColor according to active single brand filter
   * 5. Renders data table and Chart.js bar graph
   * @returns {Array<Object>}
   */
  function applyFilters() {
    // 1. Filter dataset using high-performance early returns
    const filteredData = window.FilterEngine 
      ? window.FilterEngine.applyFilters() 
      : (window.state ? window.state.filteredData : []);

    // 2. Calculate core business KPIs on filtered subset
    if (window.KPIEngine && typeof window.KPIEngine.calculateKPIs === 'function') {
      const kpis = window.KPIEngine.calculateKPIs(window.state.filteredData);

      // 3. Update the innerText & title of the 4 KPI cards in the UI
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

    // 4. Update KPI brand styling flourish
    updateKPIBrandStyling(window.state ? window.state.filteredData : filteredData);

    // 5. Render Data Table & Chart.js graph
    if (window.UIRenderer) {
      window.UIRenderer.renderTable(window.state.filteredData);
      window.UIRenderer.renderChart(window.state.filteredData);
    }

    // 6. Update Excel Export Button state
    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
      const activeRows = (window.state && Array.isArray(window.state.filteredData)) 
        ? window.state.filteredData.length 
        : 0;
      if (activeRows > 0) {
        btnExportExcel.disabled = false;
        btnExportExcel.classList.remove('opacity-40', 'cursor-not-allowed');
        btnExportExcel.classList.add('opacity-100');
        btnExportExcel.title = `Exporter la totalité des ${activeRows.toLocaleString()} lignes filtrées en Excel (.xlsx)`;
      } else {
        btnExportExcel.disabled = true;
        btnExportExcel.classList.add('opacity-40', 'cursor-not-allowed');
        btnExportExcel.classList.remove('opacity-100');
        btnExportExcel.title = 'Aucune donnée filtrée disponible pour l\'export';
      }
    }

    return filteredData;
  }

  // Expose on window for external callers
  window.applyFilters = applyFilters;

  // 1. File Ingestion Wiring: Save JSON to state.rawData, extract dimensions, populate dropdowns
  if (window.DataService) {
    window.DataService.initFileUpload('excelUpload', (data, metadata) => {
      console.log(`[App] Ingestion complete. Saving ${data.length.toLocaleString()} rows to state.rawData`);
      
      // Save the JSON array into global state
      window.state.rawData = data;

      // Extract unique values from Excel JSON in a single pass (including depot/store)
      const uniqueValues = window.FilterEngine.extractUniqueValues(window.state.rawData);
      console.log('[App] Extracted unique filter dimensions:', {
        depotsCount: uniqueValues.depot.length,
        famillesCount: uniqueValues.famille.length,
        genresCount: uniqueValues.genre.length,
        taillesCount: uniqueValues.taille.length,
        marquesCount: uniqueValues.marque.length
      });

      // Populate sidebar dropdowns with <option> tags
      window.FilterEngine.populateDropdowns(uniqueValues);

      // Wire up dropdown change listeners
      window.FilterEngine.setupDropdownListeners();

      // Trigger initial filter evaluation & KPI calculation
      applyFilters();
    });
  } else {
    console.error('[App] DataService is not available.');
  }

  // 2. Add "change" event listeners to the 5 multi-select dropdowns
  const filterElements = [
    { el: filterDepot, key: 'depot' },
    { el: filterFamille, key: 'famille' },
    { el: filterGenre, key: 'genre' },
    { el: filterTaille, key: 'taille' },
    { el: filterMarque, key: 'marque' }
  ];

  filterElements.forEach(({ el, key }) => {
    if (!el) return;
    el.addEventListener('change', (e) => {
      window.state.filters[key] = Array.from(e.target.selectedOptions).map(opt => opt.value);
      applyFilters();
    });
  });

  // 3. Add "input" event listener to the SKU search bar, wrapped in debounce (300ms)
  if (skuSearchInput) {
    const debouncedSkuSearch = window.FilterEngine.debounce((query) => {
      window.state.filters.searchSKU = query;
      applyFilters();
    }, 300);

    skuSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (clearSkuBtn) {
        if (val.trim().length > 0) {
          clearSkuBtn.classList.remove('hidden');
        } else {
          clearSkuBtn.classList.add('hidden');
        }
      }
      debouncedSkuSearch(val);
    });
  }

  // Clear SKU button
  if (clearSkuBtn && skuSearchInput) {
    clearSkuBtn.addEventListener('click', () => {
      skuSearchInput.value = '';
      clearSkuBtn.classList.add('hidden');
      window.state.filters.searchSKU = '';
      applyFilters();
      skuSearchInput.focus();
    });
  }

  // Reset Filters button
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      window.state.filters = {
        famille: [],
        genre: [],
        taille: [],
        marque: [],
        depot: [],
        searchSKU: ''
      };

      // Deselect all options in all 5 multi-select dropdowns
      [filterDepot, filterFamille, filterGenre, filterTaille, filterMarque].forEach(select => {
        if (select) {
          Array.from(select.options).forEach(opt => {
            opt.selected = false;
          });
        }
      });

      if (skuSearchInput) skuSearchInput.value = '';
      if (clearSkuBtn) clearSkuBtn.classList.add('hidden');

      applyFilters();
    });
  }

  // 4. Drag & Drop Support on Upload Button
  const uploadDropZone = document.getElementById('uploadDropZone');
  const fileInput = document.getElementById('excelUpload');

  if (uploadDropZone && fileInput) {
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropZone.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadDropZone.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-50');
      }, false);
    });

    uploadDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  // 5. Search SKU Keyboard Shortcut (Ctrl+K / Cmd+K)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      skuSearchInput?.focus();
    }
  });

  // 6. Mobile Sidebar Toggle & Off-Canvas Drawer Wiring
  const mobileToggleBtn = document.getElementById('mobileSidebarToggle');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const sidebar = document.getElementById('sidebarContainer');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('-translate-x-full');
    sidebarBackdrop?.classList.add('hidden');
  }

  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('-translate-x-full');
      sidebarBackdrop?.classList.toggle('hidden');
    });
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      closeSidebar();
    });
  }

  // 7. Export to Excel Button Wiring
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      if (window.DataService && typeof window.DataService.exportFilteredToExcel === 'function') {
        window.DataService.exportFilteredToExcel();
      } else if (typeof window.exportFilteredToExcel === 'function') {
        window.exportFilteredToExcel();
      }
    });
  }

  // 8. Auto-load default inventory file ("data inventory.xlsx") on initial page load
  if (typeof window.autoLoadDefaultData === 'function') {
    window.autoLoadDefaultData();
  } else if (window.DataService && typeof window.DataService.autoLoadDefaultData === 'function') {
    window.DataService.autoLoadDefaultData();
  }
});

