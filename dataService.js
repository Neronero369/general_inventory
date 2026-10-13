/**
 * =========================================================================
 * dataService.js - High-Performance Excel Ingestion Service
 * =========================================================================
 * Reads multi-megabyte inventory Excel workbooks using SheetJS (xlsx.full.min.js),
 * extracts the primary worksheet, parses it into an in-memory JSON array,
 * and logs the full dataset and column headers to the developer console.
 * =========================================================================
 */

(function (window) {
  'use strict';

  // Global DataService namespace
  const DataService = {
    rawInventoryData: [],
    datasetMetadata: null,

    /**
     * Initializes the file upload listener
     * @param {string} inputId - DOM ID of file input element
     * @param {Function} [onSuccess] - Optional callback after successful parsing
     * @param {Function} [onError] - Optional callback on parse failure
     */
    initFileUpload(inputId = 'excelUpload', onSuccess = null, onError = null) {
      const fileInput = document.getElementById(inputId);

      if (!fileInput) {
        console.error(`[DataService] Error: File input element #${inputId} not found in DOM.`);
        return;
      }

      console.log(`[DataService] Listening for file selection on #${inputId}...`);

      fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        console.log(`[DataService] Selected file: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

        // Notify UI that loading has started
        this.updateUploadUIState('loading', file.name);

        const startTime = performance.now();

        try {
          const rawData = await this.readExcelFile(file);
          const endTime = performance.now();
          const durationMs = (endTime - startTime).toFixed(0);

          this.rawInventoryData = rawData;
          this.datasetMetadata = {
            fileName: file.name,
            fileSizeBytes: file.size,
            rowCount: rawData.length,
            columnHeaders: rawData.length > 0 ? Object.keys(rawData[0]) : [],
            parsedInMs: durationMs,
            timestamp: new Date().toISOString()
          };

          // Step 1 Requirement: Simply console.log the resulting data array so we can verify the column headers
          console.group('%c📦 INVENTORY DATA INGESTION REPORT (SheetJS)', 'color: #3b82f6; font-size: 14px; font-weight: bold;');
          console.log('%cFile Details:', 'font-weight: bold; color: #10b981;', {
            filename: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            parseTime: `${durationMs} ms`,
            totalRows: rawData.length
          });

          console.log('%cDetected Column Headers:', 'font-weight: bold; color: #8b5cf6;', this.datasetMetadata.columnHeaders);
          
          if (rawData.length > 0) {
            console.log('%cSample First 5 Rows:', 'font-weight: bold; color: #f59e0b;');
            console.table(rawData.slice(0, 5));
          }

          console.log('%cFull Resulting Data Array:', 'font-weight: bold; color: #3b82f6;', rawData);
          console.groupEnd();

          // Update UI with file details
          this.updateUploadUIState('success', file.name, rawData.length, durationMs, this.datasetMetadata.columnHeaders);

          // Dispatch custom window event for other modules
          window.dispatchEvent(new CustomEvent('inventoryDataReady', {
            detail: {
              data: rawData,
              metadata: this.datasetMetadata
            }
          }));

          if (typeof onSuccess === 'function') {
            onSuccess(rawData, this.datasetMetadata);
          }
        } catch (error) {
          console.error('[DataService] Error parsing Excel file:', error);
          this.updateUploadUIState('error', file.name, 0, 0, [], error.message);
          if (typeof onError === 'function') {
            onError(error);
          }
        }
      });
    },

    /**
     * Reads and parses an Excel file using SheetJS
     * @param {File} file
     * @returns {Promise<Array<Object>>}
     */
    readExcelFile(file) {
      return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
          return reject(new Error('SheetJS library (XLSX) is not loaded. Please verify the CDN script tag.'));
        }

        const reader = new FileReader();

        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            
            // Read workbook with dense mode for fast parsing
            const workbook = XLSX.read(data, {
              type: 'array',
              cellDates: true,
              dense: false
            });

            // Get first worksheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            if (!worksheet) {
              throw new Error('No worksheets found in the uploaded workbook.');
            }

            // Convert worksheet to JSON array of objects
            const jsonArray = XLSX.utils.sheet_to_json(worksheet, {
              raw: false, // preserve formatted numbers/strings
              defval: null
            });

            // Defensive cleaning step (filtering out blank rows)
            const cleanData = jsonArray.filter(row => {
              if (!row) return false;
              return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
            });

            resolve(cleanData);
          } catch (err) {
            reject(err);
          }
        };

        reader.onerror = (err) => {
          reject(new Error('FileReader error: ' + (err.message || 'Unable to read file')));
        };

        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Helper to update visual UI badges and banner states
     */
    updateUploadUIState(status, fileName, rowCount = 0, durationMs = 0, columns = [], errorMsg = '') {
      const statusBadge = document.getElementById('fileStatusBadge');
      const fileNameDisplay = document.getElementById('uploadedFileName');
      const uploadButtonText = document.getElementById('uploadButtonText');

      if (status === 'loading') {
        if (statusBadge) {
          statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse';
          statusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse de l\'Excel...';
        }
        if (uploadButtonText) {
          uploadButtonText.innerText = 'Lecture du classeur...';
        }
      } else if (status === 'success') {
        if (statusBadge) {
          statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
          statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${rowCount.toLocaleString()} lignes`;
        }
        if (fileNameDisplay) {
          fileNameDisplay.innerText = fileName;
        }
        if (uploadButtonText) {
          uploadButtonText.innerText = 'Changer de Fichier Excel';
        }
      } else if (status === 'error') {
        if (statusBadge) {
          statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30';
          statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Erreur d\'analyse';
        }
        if (uploadButtonText) {
          uploadButtonText.innerText = 'Charger l\'Excel d\'Inventaire';
        }
        alert('Erreur lors de l\'analyse de l\'Excel : ' + errorMsg);
      }
    },

    /**
     * Exports ALL current filtered inventory records (state.filteredData) to an Excel (.xlsx) file
     * using SheetJS (XLSX). Exports the entire filtered dataset, not just the 200 rows DOM preview.
     */
    exportFilteredToExcel() {
      if (typeof XLSX === 'undefined') {
        alert('Erreur : La bibliothèque SheetJS (XLSX) n\'est pas chargée.');
        return;
      }

      const filtered = (window.state && Array.isArray(window.state.filteredData)) 
        ? window.state.filteredData 
        : [];

      if (filtered.length === 0) {
        alert("Aucun enregistrement d'inventaire disponible à exporter. Veuillez charger un fichier Excel ou ajuster vos filtres.");
        return;
      }

      const exportBtn = document.getElementById('btn-export-excel');
      let originalBtnHtml = '';
      if (exportBtn) {
        originalBtnHtml = exportBtn.innerHTML;
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i> <span>Génération Excel...</span>';
      }

      // Defer to allow the browser to paint the loading spinner state
      setTimeout(() => {
        try {
          const exportRows = filtered.map(row => {
            const qty = Number(row.qty) || 0;
            const prixTTC = Number(row.full_price_ttc) || 0;
            const prixAchat = Number(row.prix_achat) || 0;

            return {
              'Code Dépôt': row.code_depot || row.Code_depot || '',
              'Dépôt / Magasin': row['depot/store'] || row.depot || row.store || '',
              'Code Article': row.code_article || row.Code_Article || '',
              'UPC / Barcode': row.upc || row.UPC || '',
              'Marque': row.marque || row.Marque || '',
              'Genre': row.genre || row.Genre || '',
              'Famille': row.famille || row.Famille || '',
              'Taille': (row.taille !== undefined && row.taille !== null) ? String(row.taille).trim() : '',
              'Quantité': qty,
              'Prix TTC': prixTTC,
              'Valeur TTC': Math.round((qty * prixTTC) * 100) / 100,
              'Prix Achat': prixAchat,
              'Valeur Achat': Math.round((qty * prixAchat) * 100) / 100
            };
          });

          const worksheet = XLSX.utils.json_to_sheet(exportRows);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventaire Filtré');

          const dateStr = new Date().toISOString().slice(0, 10);
          XLSX.writeFile(workbook, `Inventaire_Filtre_${dateStr}.xlsx`);
        } catch (err) {
          console.error('[DataService] Erreur lors de l\'export Excel:', err);
          alert('Une erreur est survenue lors de l\'export Excel : ' + err.message);
        } finally {
          if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalBtnHtml;
          }
        }
      }, 50);
    },

    /**
     * Automatically fetches and ingests the default inventory Excel file ('data inventory.xlsx')
     * on initial dashboard load using the fetch() API and SheetJS.
     * Defensive cleaning removes blank rows.
     * Automatically populates state.rawData, extracts unique values, populates dropdowns,
     * triggers applyFilters(), and updates UI state.
     * If the fetch fails (404, CORS error when served over file:// protocol, network error),
     * a silent warning is logged to the console and the dashboard remains empty waiting for manual upload.
     * @param {string} [filePath='data inventory.xlsx']
     * @returns {Promise<Array<Object>|null>}
     */
    async autoLoadDefaultData(filePath = 'data inventory.xlsx') {
      const uploadButtonText = document.getElementById('uploadButtonText');
      const originalButtonText = uploadButtonText ? uploadButtonText.innerText : "Charger l'Excel d'Inventaire";

      try {
        // Temporarily indicate auto-loading on the upload button & status badge
        this.updateUploadUIState('loading', filePath);
        if (uploadButtonText) {
          uploadButtonText.innerText = 'Chargement auto...';
        }

        const startTime = performance.now();
        const response = await fetch(encodeURI(filePath));

        if (!response.ok) {
          throw new Error(`Fichier introuvable (${response.status} ${response.statusText})`);
        }

        const buffer = await response.arrayBuffer();

        if (typeof XLSX === 'undefined') {
          throw new Error('Bibliothèque SheetJS (XLSX) non disponible.');
        }

        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: true,
          dense: false
        });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        if (!worksheet) {
          throw new Error('Aucune feuille trouvée dans le classeur Excel.');
        }

        const jsonArray = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          defval: null
        });

        // Defensive cleaning step (filtering out blank rows)
        const cleanData = jsonArray.filter(row => {
          if (!row) return false;
          return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
        });

        const endTime = performance.now();
        const durationMs = (endTime - startTime).toFixed(0);

        this.rawInventoryData = cleanData;
        this.datasetMetadata = {
          fileName: filePath,
          fileSizeBytes: buffer.byteLength,
          rowCount: cleanData.length,
          columnHeaders: cleanData.length > 0 ? Object.keys(cleanData[0]) : [],
          parsedInMs: durationMs,
          timestamp: new Date().toISOString()
        };

        console.group('%c📦 AUTO-LOAD INVENTORY DATA REPORT (SheetJS)', 'color: #3b82f6; font-size: 14px; font-weight: bold;');
        console.log('%cFile Details:', 'font-weight: bold; color: #10b981;', {
          filename: filePath,
          size: `${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB`,
          parseTime: `${durationMs} ms`,
          totalRows: cleanData.length
        });
        console.log('%cDetected Column Headers:', 'font-weight: bold; color: #8b5cf6;', this.datasetMetadata.columnHeaders);
        if (cleanData.length > 0) {
          console.log('%cSample First 5 Rows:', 'font-weight: bold; color: #f59e0b;');
          console.table(cleanData.slice(0, 5));
        }
        console.groupEnd();

        // 1. Save to state.rawData
        if (window.state) {
          window.state.rawData = cleanData;
        }

        // 2. Extract unique values and populate dropdowns
        if (window.FilterEngine && typeof window.FilterEngine.extractUniqueValues === 'function') {
          const uniqueValues = window.FilterEngine.extractUniqueValues(cleanData);
          window.FilterEngine.populateDropdowns(uniqueValues);
          window.FilterEngine.setupDropdownListeners();
        }

        // 3. Trigger initial filter evaluation & KPI calculation
        if (typeof window.applyFilters === 'function') {
          window.applyFilters();
        } else if (window.FilterEngine && typeof window.FilterEngine.applyFilters === 'function') {
          window.FilterEngine.applyFilters();
        }

        // 4. Update UI with success badge & button text
        this.updateUploadUIState('success', filePath, cleanData.length, durationMs, this.datasetMetadata.columnHeaders);

        // 5. Dispatch global inventoryDataReady event
        window.dispatchEvent(new CustomEvent('inventoryDataReady', {
          detail: {
            data: cleanData,
            metadata: this.datasetMetadata
          }
        }));

        return cleanData;
      } catch (error) {
        // Silent warning: expected when offline, 404, or CORS under file:// protocol
        console.warn('[DataService] Chargement automatique ignoré (attente d\'importation manuelle):', error.message || error);

        // Revert upload UI to standby state
        const statusBadge = document.getElementById('fileStatusBadge');
        if (statusBadge) {
          statusBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700';
          statusBadge.innerHTML = '<i class="fa-regular fa-clock"></i> Aucun fichier';
        }
        if (uploadButtonText) {
          uploadButtonText.innerText = "Charger l'Excel d'Inventaire";
        }
        return null;
      }
    }
  };

  // Expose to window
  window.DataService = DataService;
  window.exportFilteredToExcel = DataService.exportFilteredToExcel.bind(DataService);
  window.autoLoadDefaultData = DataService.autoLoadDefaultData.bind(DataService);

})(window);
