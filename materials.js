/**
 * materials.js - Material Database & Library Management
 * 
 * Contains:
 * - Material database (matDB) with all available materials
 * - Sheet size constants for special materials (Obo, HDPE)
 * - Material library state and CRUD operations
 * - Material lookup helpers
 */

// ============================================================================
// MATERIAL DATABASE
// ============================================================================

var Materials = (function() {
  
  // Standard sheet sizes for special materials
  var SHEET_SIZES = {
    obo:  { w: 20, l: 80, name: 'Obomodulan 20"×80"' },
    hdpe: { w: 48, l: 96, name: 'HDPE 4\'×8\'' }
  };

  // Complete material database
  var DATABASE = {
    wood: {
      mdo: { 
        name: 'MDO', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 60, l: 96, n: "5'×8'" },
          { w: 48, l: 120, n: "4'×10'" }
        ], 
        thick: [0.25, 0.5, 0.75, 1.0] 
      },
      mdf: { 
        name: 'MDF', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 60, l: 96, n: "5'×8'" },
          { w: 48, l: 120, n: "4'×10'" },
          { w: 60, l: 120, n: "5'×10'" }
        ], 
        thick: [0.25, 0.5, 0.75, 1.0] 
      },
      shopply: { 
        name: 'Shop Ply', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 48, l: 120, n: "4'×10'" }
        ], 
        thick: [0.25, 0.5, 0.75, 1.0] 
      }
    },
    plastic: {
      plexi: { 
        name: 'Plexi/Acrylic', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 60, l: 120, n: "5'×10'" }
        ], 
        thick: [0.125, 0.25, 0.375, 0.5, 0.75] 
      },
      optium: { 
        name: 'Optium', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" }
        ], 
        thick: [0.25] 
      },
      hdpe: { 
        name: 'HDPE', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" }
        ], 
        thick: [0.5, 0.75] 
      }
    },
    metal: {
      steel: { 
        name: 'Steel', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 48, l: 120, n: "4'×10'" }
        ], 
        thick: [0.0625, 0.125, 0.25, 0.375, 0.5] 
      },
      aluminum: { 
        name: 'Aluminum', 
        sizes: [
          { w: 48, l: 96, n: "4'×8'" },
          { w: 48, l: 120, n: "4'×10'" }
        ], 
        thick: [0.0625, 0.125, 0.25, 0.375, 0.5] 
      }
    },
    other: {
      obomodulan: { 
        name: 'Obomodulan', 
        sizes: [
          { w: 20, l: 80, n: '20"×80"' }
        ], 
        thick: [1.0] 
      }
    }
  };

  // ============================================================================
  // MATERIAL LIBRARY (User's selected materials)
  // ============================================================================
  
  var library = [];
  var STORAGE_KEY = 'stockSheetLibrary';

  /**
   * Save library to localStorage
   */
  function saveLibrary() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch(e) {
      console.warn('Could not save to localStorage:', e);
    }
  }

  /**
   * Load library from localStorage
   */
  function loadLibrary() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        library = JSON.parse(saved);
        return true;
      }
    } catch(e) {
      console.warn('Could not load from localStorage:', e);
    }
    return false;
  }

  /**
   * Toggle favorite status of a library entry
   * @param {number} index 
   */
  function toggleFavorite(index) {
    if (library[index]) {
      library[index].favorite = !library[index].favorite;
      saveLibrary();
    }
  }

  /**
   * Add a material to the user's library
   * @param {string} type - Category (wood, plastic, metal, other)
   * @param {string} matKey - Material key (mdo, hdpe, etc.)
   * @param {number} sizeIdx - Index into sizes array
   * @param {number} thickness - Selected thickness
   * @returns {object|null} - The added material or null if invalid/duplicate
   */
  function addToLibrary(type, matKey, sizeIdx, thickness) {
    if (!type || !matKey || sizeIdx === '' || !thickness) {
      return null;
    }
    
    var mat = DATABASE[type] && DATABASE[type][matKey];
    if (!mat) return null;
    
    var size = mat.sizes[parseInt(sizeIdx)];
    if (!size) return null;
    
    var t = parseFloat(thickness);
    var fullName = mat.name + ' ' + t + '" ' + size.n;
    
    // Check for duplicates
    if (library.some(function(m) { return m.name === fullName; })) {
      return null;
    }
    
    var newMat = { 
      name: fullName, 
      w: size.w, 
      l: size.l, 
      t: t, 
      matKey: matKey,
      favorite: false
    };
    
    library.push(newMat);
    saveLibrary();
    return newMat;
  }

  /**
   * Remove a material from the library
   * @param {number} index - Index to remove
   * @param {array} items - Current items array (to check usage)
   * @returns {object} - { success: boolean, error?: string, updatedItems?: array }
   */
  function removeFromLibrary(index, items) {
    // Check if any items are using this material
    var inUse = items.filter(function(item) { return item.matIdx === index; });
    if (inUse.length > 0) {
      var names = inUse.map(function(item) { return item.name; }).join(', ');
      return { 
        success: false, 
        error: 'Cannot remove: material is used by ' + inUse.length + ' item(s): ' + names 
      };
    }
    
    // Update items that reference higher indices
    var updatedItems = items.map(function(item) {
      if (item.matIdx > index) {
        return Object.assign({}, item, { matIdx: item.matIdx - 1 });
      }
      return item;
    });
    
    library.splice(index, 1);
    saveLibrary();
    return { success: true, updatedItems: updatedItems };
  }

  /**
   * Get a material from the library by index
   * @param {number} index 
   * @returns {object} - Material object or default
   */
  function getFromLibrary(index) {
    return library[index] || { name: 'Default', t: 0.75, w: 48, l: 96 };
  }

  /**
   * Get the entire library
   * @returns {array}
   */
  function getLibrary() {
    return library;
  }

  /**
   * Clear and reset the library
   */
  function clearLibrary() {
    library = [];
    saveLibrary();
  }

  /**
   * Initialize library - load from localStorage or create default
   */
  function initWithDefault() {
    // Try to load from localStorage first
    if (loadLibrary() && library.length > 0) {
      return;
    }
    
    // Create default with MDO as favorite
    library = [{ 
      name: "MDO 0.75\" 4'×8'", 
      w: 48, 
      l: 96, 
      t: 0.75, 
      matKey: 'mdo',
      favorite: true
    }];
    saveLibrary();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  return {
    // Constants
    SHEET_SIZES: SHEET_SIZES,
    DATABASE: DATABASE,
    
    // Library operations
    addToLibrary: addToLibrary,
    removeFromLibrary: removeFromLibrary,
    getFromLibrary: getFromLibrary,
    getLibrary: getLibrary,
    clearLibrary: clearLibrary,
    initWithDefault: initWithDefault,
    toggleFavorite: toggleFavorite,
    saveLibrary: saveLibrary,
    
    // Lookup helpers
    getMaterialInfo: function(type, matKey) {
      return DATABASE[type] && DATABASE[type][matKey];
    },
    getSizeInfo: function(type, matKey, sizeIdx) {
      var mat = DATABASE[type] && DATABASE[type][matKey];
      return mat && mat.sizes[parseInt(sizeIdx)];
    }
  };

})();
