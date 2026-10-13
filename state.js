/**
 * =========================================================================
 * state.js - Central Application State (Upgraded for Multi-Select)
 * =========================================================================
 * Holds:
 *  - rawData: The complete parsed JSON records array from Excel upload (~148k rows)
 *  - filteredData: The current active subset after multi-criteria filtering
 *  - filters: Active filter criteria arrays (famille, genre, taille, marque, depot)
 *             and searchSKU string
 * =========================================================================
 */

const state = {
  rawData: [],
  filteredData: [],
  filters: {
    famille: [],
    genre: [],
    taille: [],
    marque: [],
    depot: [],
    searchSKU: ''
  }
};

// Expose globally on window for cross-script access
window.state = state;
