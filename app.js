/**
 * app.js - Application UI & Glue Code
 * 
 * Contains:
 * - Application state (items array)
 * - DOM event handlers
 * - UI rendering functions
 * - Orchestration between modules
 * 
 * Dependencies: Materials, Optimize, Estimate (must be loaded first)
 */

var App = (function() {

  // ============================================================================
  // APPLICATION STATE
  // ============================================================================
  
  var items = [];
  var itemCounter = 0;

  var ITEM_TYPE_LABELS = {
    'sheet': 'Sheet',
    'platform': 'Platform',
    'pedestal': 'Pedestal',
    'case': 'Case',
    'case-desiccant': 'Case + Desiccant'
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function toNum(v) {
    var x = parseFloat(v);
    return isNaN(x) ? null : x;
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  function fmtIn(x) {
    return round2(x).toFixed(2) + '"';
  }

  function $(id) {
    return document.getElementById(id);
  }

  // ============================================================================
  // SETTINGS HELPERS
  // ============================================================================
  
  function getSettings() {
    return {
      maxSpan: toNum($('globalMaxSpan').value) || 24,
      ribThickness: toNum($('globalRibT').value) || 0.75,
      kerf: toNum($('globalKerf').value) || 0.125,
      caseInset: toNum($('globalCaseInset').value) || 0.25
    };
  }

  // ============================================================================
  // MATERIAL LIBRARY UI
  // ============================================================================
  
  function updateMatOptions() {
    var typeEl = $('matType');
    var nameEl = $('matName');
    var sizeEl = $('matSize');
    var thickEl = $('matThickness');
    
    // Defensive null checks
    if (!typeEl || !nameEl || !sizeEl || !thickEl) {
      console.error('Material form elements not found');
      return;
    }
    
    var type = typeEl.value;
    
    nameEl.innerHTML = '<option value="">--</option>';
    sizeEl.innerHTML = '<option value="">--</option>';
    thickEl.innerHTML = '<option value="">--</option>';
    sizeEl.disabled = thickEl.disabled = true;
    
    var db = Materials.DATABASE;
    if (!type || !db || !db[type]) {
      nameEl.disabled = true;
      return;
    }
    
    nameEl.disabled = false;
    for (var k in db[type]) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = db[type][k].name;
      nameEl.appendChild(o);
    }
  }

  function updateMatSizes() {
    var type = $('matType').value;
    var name = $('matName').value;
    var sizeEl = $('matSize');
    var thickEl = $('matThickness');
    
    sizeEl.innerHTML = '<option value="">--</option>';
    thickEl.innerHTML = '<option value="">--</option>';
    thickEl.disabled = true;
    
    var db = Materials.DATABASE;
    if (!type || !name || !db[type][name]) {
      sizeEl.disabled = true;
      return;
    }
    
    sizeEl.disabled = false;
    var sizes = db[type][name].sizes;
    for (var i = 0; i < sizes.length; i++) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = sizes[i].n + ' (' + sizes[i].w + '×' + sizes[i].l + ')';
      sizeEl.appendChild(o);
    }
  }

  function updateMatThickness() {
    var type = $('matType').value;
    var name = $('matName').value;
    var sizeIdx = $('matSize').value;
    var thickEl = $('matThickness');
    
    thickEl.innerHTML = '<option value="">--</option>';
    
    var db = Materials.DATABASE;
    if (!type || !name || sizeIdx === '') {
      thickEl.disabled = true;
      return;
    }
    
    thickEl.disabled = false;
    var thicks = db[type][name].thick;
    for (var i = 0; i < thicks.length; i++) {
      var o = document.createElement('option');
      o.value = thicks[i];
      o.textContent = thicks[i] + '"';
      thickEl.appendChild(o);
    }
  }

  function addMaterial() {
    var type = $('matType').value;
    var name = $('matName').value;
    var sizeIdx = $('matSize').value;
    var thick = $('matThickness').value;
    
    if (!type || !name || sizeIdx === '' || !thick) {
      alert('Select all fields');
      return;
    }
    
    var result = Materials.addToLibrary(type, name, sizeIdx, thick);
    if (!result) {
      alert('Already added or invalid selection');
      return;
    }
    
    renderMaterials();
    updateItemMaterialDropdown();
    refreshStockDropdowns();  // Update existing item dropdowns without rebuilding
    $('matType').value = '';
    updateMatOptions();
  }

  function removeMaterial(i) {
    var result = Materials.removeFromLibrary(i, items);
    
    if (!result.success) {
      alert(result.error);
      return;
    }
    
    items = result.updatedItems;
    renderMaterials();
    updateItemMaterialDropdown();
    renderItems();
  }

  function renderMaterials() {
    var el = $('materialList');
    var noMsg = $('noMaterialsMsg');
    var library = Materials.getLibrary();
    
    if (!el) return;  // Safety check
    
    if (library.length === 0) {
      el.innerHTML = '';
      if (noMsg) noMsg.style.display = 'block';
      return;
    }
    
    if (noMsg) noMsg.style.display = 'none';
    var html = '';
    for (var i = 0; i < library.length; i++) {
      var m = library[i];
      var isFav = m.favorite ? 'active' : '';
      var favIcon = m.favorite ? '⭐' : '☆';
      html += '<div class="material-card"><div class="info">';
      html += '<div class="name">' + (m.favorite ? '⭐ ' : '') + m.name + '</div>';
      html += '<div class="details">' + m.w + '" × ' + m.l + '" • ' + m.t + '" thick</div>';
      html += '</div><div class="actions">';
      html += '<button class="fav-btn ' + isFav + '" onclick="App.toggleFavorite(' + i + ')" title="Toggle favorite">' + favIcon + '</button>';
      html += '<button class="danger" onclick="App.removeMaterial(' + i + ')">✕</button>';
      html += '</div></div>';
    }
    el.innerHTML = html;
  }

  function toggleFavorite(index) {
    Materials.toggleFavorite(index);
    renderMaterials();
    refreshStockDropdowns();
  }

  function updateItemMaterialDropdown() {
    var el = $('newItemMaterial');
    if (!el) return;  // Element might not exist
    
    var current = el.value;
    var library = Materials.getLibrary();
    var sortedIndices = getSortedStockIndices('');
    
    el.innerHTML = '<option value="">-- Select Stock Sheet --</option>';
    sortedIndices.forEach(function(idx) {
      var m = library[idx];
      var o = document.createElement('option');
      o.value = idx;
      o.textContent = (m.favorite ? '⭐ ' : '') + m.name;
      el.appendChild(o);
    });
    
    // Restore previous selection or set to default
    if (current !== '') {
      el.value = current;
    } else {
      var defaultIdx = getDefaultMaterialIndex();
      if (defaultIdx !== null) {
        el.value = defaultIdx;
      }
    }
  }

  /**
   * Refresh all stock sheet dropdowns in existing item cards WITHOUT rebuilding UI
   * This preserves typed dimension values
   */
  function refreshStockDropdowns() {
    var library = Materials.getLibrary();
    
    // Get sorted indices: favorites first, then others
    var sortedIndices = getSortedStockIndices('');
    
    // Find all stock dropdowns in item cards
    items.forEach(function(item) {
      var selectEl = document.querySelector('#card-' + item.id + ' select[onchange*="updateItemMaterial"]');
      if (!selectEl) return;
      
      var currentVal = selectEl.value;
      
      // Rebuild options with favorites first
      selectEl.innerHTML = '<option value="">-- Select Stock Sheet --</option>';
      
      sortedIndices.forEach(function(idx) {
        var m = library[idx];
        var o = document.createElement('option');
        o.value = idx;
        o.textContent = (m.favorite ? '⭐ ' : '') + m.name;
        if (parseInt(currentVal) === idx) o.selected = true;
        selectEl.appendChild(o);
      });
    });
  }

  /**
   * Get stock indices sorted by favorites first, optionally filtered by search
   * @param {string} filter - Search filter string (case-insensitive)
   * @returns {array} - Sorted array of library indices
   */
  function getSortedStockIndices(filter) {
    var library = Materials.getLibrary();
    var filterLower = (filter || '').toLowerCase();
    
    var favorites = [];
    var others = [];
    
    for (var i = 0; i < library.length; i++) {
      var m = library[i];
      // Apply filter
      if (filterLower && m.name.toLowerCase().indexOf(filterLower) === -1) {
        continue;
      }
      if (m.favorite) {
        favorites.push(i);
      } else {
        others.push(i);
      }
    }
    
    return favorites.concat(others);
  }

  /**
   * Get the default material index (first favorite, or first MDO 0.75", or first in library)
   * @returns {number|null} - Index of default material or null if library empty
   */
  function getDefaultMaterialIndex() {
    var library = Materials.getLibrary();
    if (library.length === 0) return null;
    
    // First, look for a favorite
    for (var i = 0; i < library.length; i++) {
      if (library[i].favorite) return i;
    }
    
    // Second, look for MDO 0.75" 4×8
    for (var i = 0; i < library.length; i++) {
      var name = library[i].name.toLowerCase();
      if (name.indexOf('mdo') >= 0 && name.indexOf('0.75') >= 0) {
        return i;
      }
    }
    
    // Fallback to first material
    return 0;
  }

  /**
   * Filter stock dropdown in an item card based on search input
   * @param {string} itemId - Item ID
   * @param {string} filter - Search string
   */
  function filterStockDropdown(itemId, filter) {
    var library = Materials.getLibrary();
    var item = items.find(function(it) { return it.id === itemId; });
    if (!item) return;
    
    var selectEl = document.querySelector('#card-' + itemId + ' select[onchange*="updateItemMaterial"]');
    if (!selectEl) return;
    
    var currentVal = item.matIdx;
    var sortedIndices = getSortedStockIndices(filter);
    
    // Rebuild options
    selectEl.innerHTML = '<option value="">-- Select Stock Sheet --</option>';
    
    sortedIndices.forEach(function(idx) {
      var m = library[idx];
      var o = document.createElement('option');
      o.value = idx;
      o.textContent = (m.favorite ? '⭐ ' : '') + m.name;
      if (currentVal === idx) o.selected = true;
      selectEl.appendChild(o);
    });
  }

  // ============================================================================
  // ITEM MANAGEMENT
  // ============================================================================
  
  function addItem() {
    var typeEl = $('newItemType');
    var matEl = $('newItemMaterial');
    var nameEl = $('newItemName');
    
    var type = typeEl ? typeEl.value : '';
    var matIdx = matEl && matEl.value !== '' ? matEl.value : null;
    var name = nameEl ? nameEl.value : '';
    
    // If no material selected, use the default (favorite or MDO 0.75")
    if (matIdx === null) {
      matIdx = getDefaultMaterialIndex();
    }
    
    itemCounter++;
    items.push({
      id: 'item-' + itemCounter,
      type: type || '',  // Can be empty - user selects inside card
      name: name || ('Item ' + itemCounter),
      matIdx: matIdx !== null ? parseInt(matIdx) : null
    });
    
    renderItems();
    if (nameEl) nameEl.value = '';
    if (typeEl) typeEl.value = '';
  }

  function removeItem(id) {
    items = items.filter(function(it) { return it.id !== id; });
    renderItems();
    renderCombinedResults();
  }

  function updateItemName(id, val) {
    var item = items.find(function(it) { return it.id === id; });
    if (item) item.name = val;
  }
  
  function updateItemType(id, val) {
    var item = items.find(function(it) { return it.id === id; });
    if (item) {
      item.type = val;
      item.calculated = false;
      renderItems();
    }
  }
  
  function updateItemMaterial(id, val) {
    var item = items.find(function(it) { return it.id === id; });
    if (item) {
      item.matIdx = val !== '' ? parseInt(val) : null;
      item.calculated = false;
      renderItems();
    }
  }
  
  /**
   * Save a form field value to the item object (prevents loss on re-render)
   */
  function saveItemField(id, field, value) {
    var item = items.find(function(it) { return it.id === id; });
    if (item) {
      if (!item.fields) item.fields = {};
      item.fields[field] = value;
    }
  }
  
  /**
   * Get a stored field value, or default
   */
  function getItemField(item, field, defaultVal) {
    if (item.fields && item.fields[field] !== undefined && item.fields[field] !== '') {
      return item.fields[field];
    }
    return defaultVal !== undefined ? defaultVal : '';
  }

  function renderItems() {
    var el = $('itemsContainer');
    if (!el) return;
    
    if (items.length === 0) {
      el.innerHTML = '';
      return;
    }
    
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += renderItemCard(items[i]);
    }
    el.innerHTML = html;
  }

  function renderItemCard(item) {
    var library = Materials.getLibrary();
    var mat = item.matIdx !== null ? Materials.getFromLibrary(item.matIdx) : null;
    var h = '<div class="item-card" id="card-' + item.id + '">';
    
    // Header with name and remove button
    h += '<div class="item-header"><div class="item-header-left">';
    if (item.type) {
      h += '<span class="item-type-badge ' + item.type + '">' + (ITEM_TYPE_LABELS[item.type] || item.type) + '</span>';
    }
    h += '<input type="text" class="item-name-input" value="' + item.name + '" onchange="App.updateItemName(\'' + item.id + '\', this.value)">';
    if (mat) {
      h += '<span class="item-material">Stock: <strong>' + mat.name + '</strong></span>';
    }
    h += '</div><button class="danger" onclick="App.removeItem(\'' + item.id + '\')">Remove</button></div>';
    
    // Type and Material selection row (always show for flexibility)
    h += '<div class="grid" style="margin-bottom:12px;">';
    
    // Type dropdown
    h += '<div><label>Item Type</label><select onchange="App.updateItemType(\'' + item.id + '\', this.value)">';
    h += '<option value="">-- Select Type --</option>';
    for (var t in ITEM_TYPE_LABELS) {
      h += '<option value="' + t + '"' + (item.type === t ? ' selected' : '') + '>' + ITEM_TYPE_LABELS[t] + '</option>';
    }
    h += '</select></div>';
    
    // Stock sheet dropdown with search
    h += '<div><label>Stock Sheet</label>';
    h += '<input type="text" class="stock-search" placeholder="Search stock..." oninput="App.filterStockDropdown(\'' + item.id + '\', this.value)">';
    h += '<select onchange="App.updateItemMaterial(\'' + item.id + '\', this.value)">';
    h += '<option value="">-- Select Stock Sheet --</option>';
    
    // Get sorted indices (favorites first)
    var sortedIndices = getSortedStockIndices('');
    for (var si = 0; si < sortedIndices.length; si++) {
      var mi = sortedIndices[si];
      var m = library[mi];
      var prefix = m.favorite ? '⭐ ' : '';
      h += '<option value="' + mi + '"' + (item.matIdx === mi ? ' selected' : '') + '>' + prefix + m.name + '</option>';
    }
    h += '</select></div>';
    
    h += '</div>';
    
    // Show type-specific fields only if type is selected
    if (item.type) {
      h += '<div class="grid">';
      h += '<div><label>Quantity</label><input type="number" id="qty-' + item.id + '" value="' + getItemField(item, 'qty', '1') + '" min="1" oninput="App.saveItemField(\'' + item.id + '\', \'qty\', this.value)"></div>';
      
      if (item.type === 'sheet') {
        h += '<div><label>Width (in)</label><input type="number" step="0.01" id="w-' + item.id + '" value="' + getItemField(item, 'w', '') + '" placeholder="24" oninput="App.saveItemField(\'' + item.id + '\', \'w\', this.value)"></div>';
        h += '<div><label>Length (in)</label><input type="number" step="0.01" id="l-' + item.id + '" value="' + getItemField(item, 'l', '') + '" placeholder="48" oninput="App.saveItemField(\'' + item.id + '\', \'l\', this.value)"></div>';
      } else if (item.type === 'platform' || item.type === 'pedestal') {
        var def = item.type === 'pedestal' ? {w1:'1',w2:'1',top:'1',bot:'0'} : {w1:'2',w2:'2',top:'2',bot:'0'};
        h += '<div><label>Overall Dim 1 (in)</label><input type="number" step="0.01" id="o1-' + item.id + '" value="' + getItemField(item, 'o1', '') + '" placeholder="45" oninput="App.saveItemField(\'' + item.id + '\', \'o1\', this.value)"></div>';
        h += '<div><label>Overall Dim 2 (in)</label><input type="number" step="0.01" id="o2-' + item.id + '" value="' + getItemField(item, 'o2', '') + '" placeholder="93" oninput="App.saveItemField(\'' + item.id + '\', \'o2\', this.value)"></div>';
        h += '<div><label>Overall Height (in)</label><input type="number" step="0.01" id="oh-' + item.id + '" value="' + getItemField(item, 'oh', '') + '" placeholder="12" oninput="App.saveItemField(\'' + item.id + '\', \'oh\', this.value)"></div>';
        h += '<div><label>Walls (Dim1 side)</label><input type="number" id="w1-' + item.id + '" value="' + getItemField(item, 'w1', def.w1) + '" oninput="App.saveItemField(\'' + item.id + '\', \'w1\', this.value)"></div>';
        h += '<div><label>Walls (Dim2 side)</label><input type="number" id="w2-' + item.id + '" value="' + getItemField(item, 'w2', def.w2) + '" oninput="App.saveItemField(\'' + item.id + '\', \'w2\', this.value)"></div>';
        h += '<div><label>Top Layers</label><input type="number" id="top-' + item.id + '" value="' + getItemField(item, 'top', def.top) + '" oninput="App.saveItemField(\'' + item.id + '\', \'top\', this.value)"></div>';
        h += '<div><label>Bottom Layers</label><input type="number" id="bot-' + item.id + '" value="' + getItemField(item, 'bot', def.bot) + '" oninput="App.saveItemField(\'' + item.id + '\', \'bot\', this.value)"></div>';
      } else if (item.type === 'case' || item.type === 'case-desiccant') {
        h += '<div><label>Overall Dim 1 (in)</label><input type="number" step="0.01" id="o1-' + item.id + '" value="' + getItemField(item, 'o1', '') + '" placeholder="24" oninput="App.saveItemField(\'' + item.id + '\', \'o1\', this.value)"></div>';
        h += '<div><label>Overall Dim 2 (in)</label><input type="number" step="0.01" id="o2-' + item.id + '" value="' + getItemField(item, 'o2', '') + '" placeholder="36" oninput="App.saveItemField(\'' + item.id + '\', \'o2\', this.value)"></div>';
        h += '<div><label>Overall Height (in)</label><input type="number" step="0.01" id="oh-' + item.id + '" value="' + getItemField(item, 'oh', '') + '" placeholder="10" oninput="App.saveItemField(\'' + item.id + '\', \'oh\', this.value)"></div>';
        h += '<div><label>Wall Thickness (in)</label><input type="number" step="0.001" id="wt-' + item.id + '" value="' + getItemField(item, 'wt', '0.75') + '" oninput="App.saveItemField(\'' + item.id + '\', \'wt\', this.value)"></div>';
        if (item.type === 'case-desiccant') {
          h += '<div><label>Chamber Height (in)</label><input type="number" step="0.01" id="ch-' + item.id + '" value="' + getItemField(item, 'ch', '5') + '" oninput="App.saveItemField(\'' + item.id + '\', \'ch\', this.value)"></div>';
        }
        h += '</div>';
        // Wall counts row (for double walls on specific sides)
        h += '<div class="grid" style="margin-top:8px;">';
        h += '<div><label>Walls: Dim1-A</label><input type="number" id="wcf-' + item.id + '" value="' + getItemField(item, 'wcf', '1') + '" min="1" max="4" style="width:60px" oninput="App.saveItemField(\'' + item.id + '\', \'wcf\', this.value)"></div>';
        h += '<div><label>Walls: Dim1-B</label><input type="number" id="wcb-' + item.id + '" value="' + getItemField(item, 'wcb', '1') + '" min="1" max="4" style="width:60px" oninput="App.saveItemField(\'' + item.id + '\', \'wcb\', this.value)"></div>';
        h += '<div><label>Walls: Dim2-A</label><input type="number" id="wcl-' + item.id + '" value="' + getItemField(item, 'wcl', '1') + '" min="1" max="4" style="width:60px" oninput="App.saveItemField(\'' + item.id + '\', \'wcl\', this.value)"></div>';
        h += '<div><label>Walls: Dim2-B</label><input type="number" id="wcr-' + item.id + '" value="' + getItemField(item, 'wcr', '1') + '" min="1" max="4" style="width:60px" oninput="App.saveItemField(\'' + item.id + '\', \'wcr\', this.value)"></div>';
      }
      h += '</div>';
      
      // Mixed-thickness tip for cases
      if (item.type === 'case' || item.type === 'case-desiccant') {
        h += '<p class="muted" style="font-size:0.8em;margin:8px 0 0;">💡 For mixed-thickness tops (e.g., 1" top on 3/4" case): add tops as separate Sheet items.</p>';
      }
    } else {
      h += '<p class="muted" style="padding:12px;text-align:center;">Select an Item Type above to see dimension fields</p>';
    }
    
    h += '<div class="results-section" id="results-' + item.id + '"></div>';
    h += '</div>';
    return h;
  }

  // ============================================================================
  // CALCULATION & RESULTS
  // ============================================================================
  
  function calculateAll() {
    for (var i = 0; i < items.length; i++) {
      calculateItem(items[i]);
    }
    renderCombinedResults();
  }

  function calculateItem(item) {
    var res = $('results-' + item.id);
    if (!res) return;
    
    // Reset error state
    item.calcError = null;
    
    // Check for incomplete items
    if (!item.type) {
      item.calcError = 'No item type selected';
      item.calculated = false;
      res.innerHTML = '<div class="muted">Select an item type to calculate</div>';
      return;
    }
    if (item.matIdx === null) {
      item.calcError = 'No material selected';
      item.calculated = false;
      res.innerHTML = '<div class="muted">Select a material to calculate</div>';
      return;
    }
    
    var mat = Materials.getFromLibrary(item.matIdx);
    var settings = getSettings();
    
    try {
      var result;
      
      if (item.type === 'sheet') {
        result = Estimate.calcSheet({
          name: item.name,
          qty: toNum($('qty-' + item.id).value) || 1,
          w: toNum($('w-' + item.id).value),
          l: toNum($('l-' + item.id).value)
        }, mat, settings.kerf);
      } else if (item.type === 'platform' || item.type === 'pedestal') {
        result = Estimate.calcPlatform({
          qty: toNum($('qty-' + item.id).value) || 1,
          o1: toNum($('o1-' + item.id).value),
          o2: toNum($('o2-' + item.id).value),
          oh: toNum($('oh-' + item.id).value),
          w1: toNum($('w1-' + item.id).value) || 0,
          w2: toNum($('w2-' + item.id).value) || 0,
          topLayers: toNum($('top-' + item.id).value) || 0,
          botLayers: toNum($('bot-' + item.id).value) || 0
        }, mat, settings);
      } else if (item.type === 'case' || item.type === 'case-desiccant') {
        // Fix: only read chamber height if the element exists
        var chEl = $('ch-' + item.id);
        var chamberHeight = chEl ? (toNum(chEl.value) || 5) : 5;
        
        result = Estimate.calcCase({
          qty: toNum($('qty-' + item.id).value) || 1,
          o1: toNum($('o1-' + item.id).value),
          o2: toNum($('o2-' + item.id).value),
          oh: toNum($('oh-' + item.id).value),
          wallThickness: toNum($('wt-' + item.id).value) || 0.75,
          hasChamber: (item.type === 'case-desiccant'),
          chamberHeight: chamberHeight,
          // Wall counts for each side (default 1)
          wallCountDim1A: toNum($('wcf-' + item.id).value) || 1,
          wallCountDim1B: toNum($('wcb-' + item.id).value) || 1,
          wallCountDim2A: toNum($('wcl-' + item.id).value) || 1,
          wallCountDim2B: toNum($('wcr-' + item.id).value) || 1
        }, mat, settings);
      }
      
      if (result.error) {
        item.calcError = result.error;
        item.calculated = false;
        res.innerHTML = '<div class="bad">' + result.error + '</div>';
        return;
      }
      
      // Generate display name for source identification in combined results
      var itemNum = item.id.replace('item-', '').padStart(2, '0');
      var typeLabel = ITEM_TYPE_LABELS[item.type] || item.type;
      var sourceItemName = (item.name && item.name.trim() && item.name !== ('Item ' + parseInt(itemNum))) 
        ? item.name 
        : 'Item ' + itemNum + ' (' + typeLabel + ')';
      
      // Stamp all parts with source item identity
      if (result.parts) {
        for (var pi = 0; pi < result.parts.length; pi++) {
          result.parts[pi].sourceItemId = item.id;
          result.parts[pi].sourceItemName = sourceItemName;
        }
      }
      
      // Store result on item
      item.calculated = true;
      item.sourceItemName = sourceItemName;
      item.result = result;
      item.quantity = result.quantity;
      item.parts = result.parts;
      item.nestedSheets = result.nestedSheets;
      item.sheetW = result.sheetW;
      item.sheetL = result.sheetL;
      item.materialNesting = result.materialNesting;
      
      res.innerHTML = renderItemResults(item, result);
      
      setTimeout(function() { drawItemCanvases(item, result); }, 50);
      
    } catch(e) {
      item.calcError = e.message;
      item.calculated = false;
      res.innerHTML = '<div class="bad">Error: ' + e.message + '</div>';
    }
  }

  function renderItemResults(item, result) {
    var h = '';
    
    // Show warnings (e.g., oversized skins)
    if (result.warnings && result.warnings.length > 0) {
      for (var i = 0; i < result.warnings.length; i++) {
        h += '<div class="bad">⚠️ ' + result.warnings[i] + '</div>';
      }
    }
    
    // Show unplaced/oversized parts warning
    if (result.unplaced && result.unplaced.length > 0) {
      h += '<div class="bad" style="padding:12px;margin-bottom:12px;background:rgba(248,113,113,0.1);border-radius:8px;">';
      h += '<strong>⚠️ UNPLACED PARTS (' + result.unplaced.length + ')</strong> - These exceed sheet size:';
      h += '<ul style="margin:8px 0 0 20px;">';
      for (var ui = 0; ui < result.unplaced.length; ui++) {
        var up = result.unplaced[ui];
        h += '<li>' + up.name + ' (' + fmtIn(up.w) + ' × ' + fmtIn(up.h) + ')</li>';
      }
      h += '</ul></div>';
    }
    
    // Check multi-material unplaced (for cases)
    if (result.materialNesting) {
      var mn = result.materialNesting;
      var matUnplaced = [];
      if (mn.mdo && mn.mdo.unplaced && mn.mdo.unplaced.length > 0) {
        mn.mdo.unplaced.forEach(function(u) { matUnplaced.push({ mat: 'MDO', part: u }); });
      }
      if (mn.hdpe && mn.hdpe.unplaced && mn.hdpe.unplaced.length > 0) {
        mn.hdpe.unplaced.forEach(function(u) { matUnplaced.push({ mat: 'HDPE', part: u }); });
      }
      if (mn.obo && mn.obo.unplaced && mn.obo.unplaced.length > 0) {
        mn.obo.unplaced.forEach(function(u) { matUnplaced.push({ mat: 'Obo', part: u }); });
      }
      if (matUnplaced.length > 0) {
        h += '<div class="bad" style="padding:12px;margin-bottom:12px;background:rgba(248,113,113,0.1);border-radius:8px;">';
        h += '<strong>⚠️ UNPLACED PARTS (' + matUnplaced.length + ')</strong>:';
        h += '<ul style="margin:8px 0 0 20px;">';
        matUnplaced.forEach(function(mu) {
          h += '<li>' + mu.mat + ': ' + mu.part.name + ' (' + fmtIn(mu.part.w) + ' × ' + fmtIn(mu.part.h) + ')</li>';
        });
        h += '</ul></div>';
      }
    }
    
    if (item.type === 'sheet') {
      h += '<h3>Cut List</h3>' + renderPartsTable(result.parts);
    } else if (item.type === 'platform' || item.type === 'pedestal') {
      h += renderPlatformResults(result);
    } else if (item.type === 'case' || item.type === 'case-desiccant') {
      h += renderCaseResults(result);
    }
    
    h += renderViz(item, result);
    return h;
  }

  function renderPlatformResults(result) {
    var h = '';
    var rp = result.ribPlan;
    var S = rp.maxSpan;
    
    h += '<h3>Rib Spacing</h3><table><tr><th>Dir</th><th>Internal</th><th>Bays</th><th>Ribs</th><th>Clear</th><th>OK?</th></tr>';
    h += '<tr><td>Dim1</td><td>' + fmtIn(result.interior.i1) + '</td><td>' + rp.dim1.bays + '</td><td>' + rp.dim1.ribs + '</td><td>' + fmtIn(rp.dim1.clear) + '</td><td class="' + (rp.dim1.clear <= S ? 'ok' : 'bad') + '">' + (rp.dim1.clear <= S ? 'OK' : 'NO') + '</td></tr>';
    h += '<tr><td>Dim2</td><td>' + fmtIn(result.interior.i2) + '</td><td>' + rp.dim2.bays + '</td><td>' + rp.dim2.ribs + '</td><td>' + fmtIn(rp.dim2.clear) + '</td><td class="' + (rp.dim2.clear <= S ? 'ok' : 'bad') + '">' + (rp.dim2.clear <= S ? 'OK' : 'NO') + '</td></tr></table>';
    
    h += '<h3>Cut List (per unit)</h3>' + renderPartsTable(result.parts);
    
    h += '<h3>Sheet Estimate</h3>';
    h += '<table><tr><th>Part</th><th>Qty</th><th>Size</th><th>Fit/Sheet</th></tr>';
    var kerf = getSettings().kerf;
    for (var i = 0; i < result.parts.length; i++) {
      var p = result.parts[i];
      var pps = Optimize.partsPerSheet(p.w, p.l, result.sheetW, result.sheetL, kerf);
      h += '<tr><td>' + p.name + '</td><td>' + p.qty + '</td><td>' + fmtIn(p.w) + '×' + fmtIn(p.l) + '</td>';
      h += '<td>' + (pps > 0 ? pps : '<span class="bad">NO FIT</span>') + '</td></tr>';
    }
    h += '</table>';
    
    h += '<div class="sheets-summary"><div><span class="big">' + result.totalSheets + '</span> sheets (per unit)</div>';
    h += '<div style="margin-top:8px;"><b>Recommended:</b> <span class="ok">' + Math.ceil(result.totalSheets * 1.2) + '</span></div></div>';
    return h;
  }

  function renderCaseResults(result) {
    var h = '';
    var d = result.dimensions;
    
    h += '<h3>Case Dimensions</h3><table><tr><th></th><th>Overall</th><th>Interior</th></tr>';
    h += '<tr><td>Dim 1</td><td>' + fmtIn(d.overall.o1) + '</td><td>' + fmtIn(d.interior.i1) + '</td></tr>';
    h += '<tr><td>Dim 2</td><td>' + fmtIn(d.overall.o2) + '</td><td>' + fmtIn(d.interior.i2) + '</td></tr>';
    h += '<tr><td>Height</td><td>' + fmtIn(d.overall.oh) + '</td><td>' + fmtIn(d.interior.ih) + '</td></tr></table>';
    h += '<p class="muted">Obo/HDPE: ' + fmtIn(d.panel.pw) + ' × ' + fmtIn(d.panel.pl) + '</p>';
    
    h += '<h3>Cut List (per unit)</h3>' + renderPartsTable(result.parts);
    
    var mn = result.materialNesting;
    h += '<h3>Sheet Requirements' + (result.quantity > 1 ? ' (×' + result.quantity + ')' : '') + '</h3>';
    h += '<div class="sheets-summary" style="display:flex;gap:24px;flex-wrap:wrap;">';
    h += '<div><span class="big">' + mn.mdo.sheets.length + '</span> MDO</div>';
    h += '<div><span class="big">' + mn.hdpe.sheets.length + '</span> HDPE</div>';
    h += '<div><span class="big">' + mn.obo.sheets.length + '</span> Obo</div>';
    h += '</div>';
    return h;
  }

  function renderPartsTable(parts) {
    var h = '<table><tr><th>Part</th><th>Qty</th><th>Size</th><th>Material</th></tr>';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      h += '<tr><td>' + p.name + '</td><td>' + p.qty + '</td><td>' + fmtIn(p.w) + ' × ' + fmtIn(p.l) + '</td><td>' + p.material + '</td></tr>';
    }
    return h + '</table>';
  }

  // ============================================================================
  // VISUALIZATION
  // ============================================================================
  
  function renderViz(item, result) {
    var h = '';
    
    if (item.type === 'case' || item.type === 'case-desiccant') {
      var mn = result.materialNesting;
      var total = mn.mdo.sheets.length + mn.hdpe.sheets.length + mn.obo.sheets.length;
      
      h += '<details class="viz-details"><summary class="viz-toggle">Show Layouts (' + total + ' sheets)</summary><div class="viz-content">';
      
      if (mn.mdo.sheets.length > 0) {
        h += '<h4 style="color:#3b82f6;">MDO (' + mn.mdo.sheets.length + ')</h4>';
        for (var i = 0; i < mn.mdo.sheets.length; i++) {
          h += renderSheetViz(mn.mdo.sheets[i], mn.mdo.w, mn.mdo.l, 'canvas-mdo-' + item.id + '-' + i);
        }
      }
      if (mn.hdpe.sheets.length > 0) {
        h += '<h4 style="color:#06b6d4;">HDPE (' + mn.hdpe.sheets.length + ')</h4>';
        for (var j = 0; j < mn.hdpe.sheets.length; j++) {
          h += renderSheetViz(mn.hdpe.sheets[j], mn.hdpe.w, mn.hdpe.l, 'canvas-hdpe-' + item.id + '-' + j);
        }
      }
      if (mn.obo.sheets.length > 0) {
        h += '<h4 style="color:#10b981;">Obo (' + mn.obo.sheets.length + ')</h4>';
        for (var k = 0; k < mn.obo.sheets.length; k++) {
          h += renderSheetViz(mn.obo.sheets[k], mn.obo.w, mn.obo.l, 'canvas-obo-' + item.id + '-' + k);
        }
      }
      h += '</div></details>';
    } else {
      var sheets = result.nestedSheets;
      if (!sheets || sheets.length === 0) return '';
      
      h += '<details class="viz-details"><summary class="viz-toggle">Show Layouts (' + sheets.length + ')</summary><div class="viz-content">';
      h += '<div class="legend"><div class="legend-item"><div class="legend-swatch" style="background:#3b82f6;"></div>Skin</div>';
      h += '<div class="legend-item"><div class="legend-swatch" style="background:#8b5cf6;"></div>Wall</div>';
      h += '<div class="legend-item"><div class="legend-swatch" style="background:#f59e0b;"></div>Rib</div></div>';
      
      for (var i = 0; i < sheets.length; i++) {
        h += renderSheetViz(sheets[i], result.sheetW, result.sheetL, 'canvas-' + item.id + '-' + i);
      }
      h += '</div></details>';
    }
    return h;
  }

  function renderSheetViz(sheet, sheetW, sheetL, canvasId, customLabel) {
    var usedArea = 0;
    for (var i = 0; i < sheet.placements.length; i++) {
      usedArea += sheet.placements[i].w * sheet.placements[i].h;
    }
    var util = (usedArea / (sheetW * sheetL) * 100).toFixed(1);
    var label = customLabel || 'Sheet ' + sheet.index;
    
    return '<div class="sheet-layout"><div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
      '<span style="font-weight:600;">' + label + '</span>' +
      '<span class="muted">Parts: ' + sheet.placements.length + ' • ' + util + '%</span></div>' +
      '<div class="sheet-canvas-container"><canvas id="' + canvasId + '"></canvas></div></div>';
  }

  function drawItemCanvases(item, result) {
    if (item.type === 'case' || item.type === 'case-desiccant') {
      var mn = result.materialNesting;
      for (var i = 0; i < mn.mdo.sheets.length; i++) Optimize.drawSheetLayout(mn.mdo.sheets[i], mn.mdo.w, mn.mdo.l, 'canvas-mdo-' + item.id + '-' + i, fmtIn);
      for (var j = 0; j < mn.hdpe.sheets.length; j++) Optimize.drawSheetLayout(mn.hdpe.sheets[j], mn.hdpe.w, mn.hdpe.l, 'canvas-hdpe-' + item.id + '-' + j, fmtIn);
      for (var k = 0; k < mn.obo.sheets.length; k++) Optimize.drawSheetLayout(mn.obo.sheets[k], mn.obo.w, mn.obo.l, 'canvas-obo-' + item.id + '-' + k, fmtIn);
    } else {
      for (var i = 0; i < result.nestedSheets.length; i++) {
        Optimize.drawSheetLayout(result.nestedSheets[i], result.sheetW, result.sheetL, 'canvas-' + item.id + '-' + i, fmtIn);
      }
    }
  }

  // ============================================================================
  // COMBINED RESULTS
  // ============================================================================
  
  // State for combined results filtering/highlighting
  var combinedHighlightItem = '';
  var lastCombinedData = null;
  
  /**
   * Get combined part label: "PartName — SourceItemName"
   */
  function getCombinedPartLabel(partName, sourceItemName) {
    return partName + ' — ' + (sourceItemName || 'Unknown');
  }
  
  /**
   * Handle highlight dropdown change
   */
  function updateCombinedHighlight() {
    var sel = $('combinedHighlightItem');
    combinedHighlightItem = sel ? sel.value : '';
    
    // Redraw canvases with new highlight
    if (lastCombinedData) {
      redrawCombinedCanvases();
    }
    
    // Update legend
    var legend = $('highlightLegend');
    if (legend) {
      if (combinedHighlightItem && lastCombinedData) {
        var calc = lastCombinedData.calc;
        var match = calc.find(function(i) { return i.id === combinedHighlightItem; });
        legend.innerHTML = 'Highlighting: <strong>' + (match ? match.sourceItemName : '') + '</strong>';
        legend.style.display = 'block';
      } else {
        legend.style.display = 'none';
      }
    }
  }
  
  /**
   * Redraw combined canvases with current highlight
   */
  function redrawCombinedCanvases() {
    if (!lastCombinedData) return;
    
    var materialTotals = lastCombinedData.materialTotals;
    var combined = lastCombinedData.combined;
    
    function safeId(name) {
      return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
    
    for (var di = 0; di < materialTotals.length; di++) {
      var mt = materialTotals[di];
      var matData = combined[mt.name];
      var sid = safeId(mt.name);
      
      for (var si = 0; si < matData.sheets.length; si++) {
        Optimize.drawSheetLayout(
          matData.sheets[si], 
          matData.w, 
          matData.l, 
          'canvas-comb-' + sid + '-' + si, 
          fmtIn,
          combinedHighlightItem
        );
      }
    }
  }

  function renderCombinedResults() {
    var calc = items.filter(function(i) { return i.calculated; });
    var failed = items.filter(function(i) { return !i.calculated && i.calcError; });
    
    // Show nothing only if no items at all
    if (items.length === 0) { 
      $('combinedResults').innerHTML = ''; 
      return; 
    }
    
    // If no calculated items but have failed items, show failure summary only
    if (calc.length === 0 && failed.length > 0) {
      var fh = '<div class="card combined-card"><h2>📊 Combined Results</h2>';
      fh += '<div class="bad" style="padding:12px;background:rgba(248,113,113,0.1);border-radius:8px;">';
      fh += '<strong>⚠️ No items calculated successfully</strong><ul style="margin:8px 0 0 20px;">';
      failed.forEach(function(f) {
        fh += '<li><strong>' + f.name + '</strong>: ' + f.calcError + '</li>';
      });
      fh += '</ul></div></div>';
      $('combinedResults').innerHTML = fh;
      return;
    }
    
    // If no items processed at all
    if (calc.length === 0) { 
      $('combinedResults').innerHTML = ''; 
      return; 
    }
    
    // Group parts by material name (dynamic, not hardcoded)
    var partsByMat = {};
    var totalParts = 0;
    var library = Materials.getLibrary();
    
    // Build a lookup from material name to library entry
    var matLookup = {};
    for (var li = 0; li < library.length; li++) {
      matLookup[library[li].name] = library[li];
    }
    
    // Collect all parts grouped by material (preserving source item identity)
    for (var i = 0; i < calc.length; i++) {
      var item = calc[i];
      for (var j = 0; j < item.parts.length; j++) {
        var p = item.parts[j];
        var matName = p.material || 'Unknown';
        
        if (!partsByMat[matName]) {
          partsByMat[matName] = [];
        }
        
        // Include sourceItemId in key to keep parts from different items separate
        var key = p.name + '_' + round2(p.w) + 'x' + round2(p.l) + '_' + (p.sourceItemId || item.id);
        var ex = partsByMat[matName].find(function(x) { return x.key === key; });
        if (ex) { 
          ex.qty += p.qty * item.quantity; 
        } else { 
          partsByMat[matName].push({ 
            key: key, 
            name: p.name, 
            w: p.w, 
            l: p.l, 
            qty: p.qty * item.quantity, 
            category: p.category,
            sourceItemId: p.sourceItemId || item.id,
            sourceItemName: p.sourceItemName || item.sourceItemName || item.name
          }); 
        }
        totalParts += p.qty * item.quantity;
      }
    }
    
    // Nest parts for each material group
    var kerf = getSettings().kerf;
    var combined = {};
    var allUnplaced = [];
    var materialNames = Object.keys(partsByMat);
    
    // Helper to get sheet dimensions for a material
    function getSheetDims(matName) {
      // Check library first
      if (matLookup[matName]) {
        return { w: matLookup[matName].w, l: matLookup[matName].l };
      }
      // Special case materials (from cases)
      if (matName === 'HDPE') {
        return Materials.SHEET_SIZES.hdpe;
      }
      if (matName === 'Obomodulan') {
        return Materials.SHEET_SIZES.obo;
      }
      // For hardcoded 'MDO' from cases, use first library entry or default
      if (matName === 'MDO') {
        if (library.length > 0) {
          return { w: library[0].w, l: library[0].l };
        }
        return { w: 48, l: 96 };
      }
      // Default fallback
      return { w: 48, l: 96 };
    }
    
    // Nest each material group
    for (var mi = 0; mi < materialNames.length; mi++) {
      var matName = materialNames[mi];
      var parts = partsByMat[matName];
      if (parts.length === 0) continue;
      
      var dims = getSheetDims(matName);
      var nestResult = Optimize.nestParts(parts, dims.w, dims.l, kerf);
      
      combined[matName] = {
        sheets: nestResult.sheets,
        unplaced: nestResult.unplaced,
        w: dims.w,
        l: dims.l
      };
      
      nestResult.unplaced.forEach(function(u) {
        allUnplaced.push({ rect: u, material: matName });
      });
    }
    
    // Calculate totals per material
    var totalSheets = 0;
    var materialTotals = [];
    for (var matName in combined) {
      var count = combined[matName].sheets.length;
      totalSheets += count;
      if (count > 0) {
        materialTotals.push({ name: matName, count: count, w: combined[matName].w, l: combined[matName].l });
      }
    }
    
    // Build HTML
    var h = '<div class="card combined-card"><h2>📊 Combined Results</h2>';
    
    // Show failed items warning at top
    if (failed.length > 0) {
      h += '<div class="bad" style="padding:12px;margin-bottom:16px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;">';
      h += '<strong>⚠️ ' + failed.length + ' item(s) not included:</strong><ul style="margin:8px 0 0 20px;">';
      failed.forEach(function(f) {
        h += '<li><strong>' + f.name + '</strong>: ' + f.calcError + '</li>';
      });
      h += '</ul></div>';
    }
    
    // Show unplaced warnings (with source item context)
    if (allUnplaced.length > 0) {
      h += '<div class="bad" style="padding:12px;margin-bottom:16px;background:rgba(248,113,113,0.1);border-radius:8px;">';
      h += '<strong>⚠️ UNPLACED PARTS (' + allUnplaced.length + ')</strong><ul style="margin:8px 0 0 20px;">';
      allUnplaced.forEach(function(up) {
        var label = up.rect.sourceItemName 
          ? getCombinedPartLabel(up.rect.name, up.rect.sourceItemName)
          : up.rect.name;
        h += '<li>' + up.material + ': ' + label + ' (' + up.rect.w.toFixed(2) + '"×' + up.rect.h.toFixed(2) + '")</li>';
      });
      h += '</ul></div>';
    }
    
    // Summary table - dynamic columns based on materials used
    h += '<h3>Summary</h3><table><tr><th>Item</th><th>Type</th><th>Qty</th><th>Sheets</th></tr>';
    for (var k = 0; k < calc.length; k++) {
      var it = calc[k];
      var sheetCount = 0;
      if (it.materialNesting) { 
        sheetCount = it.materialNesting.mdo.sheets.length + 
                     it.materialNesting.hdpe.sheets.length + 
                     it.materialNesting.obo.sheets.length; 
      } else if (it.nestedSheets) { 
        sheetCount = it.nestedSheets.length; 
      }
      h += '<tr><td>' + it.name + '</td>';
      h += '<td><span class="item-type-badge ' + it.type + '">' + ITEM_TYPE_LABELS[it.type] + '</span></td>';
      h += '<td>' + it.quantity + '</td>';
      h += '<td>' + (sheetCount ? sheetCount * it.quantity : '-') + '</td></tr>';
    }
    h += '</table>';
    
    // Totals section - show each material
    h += '<h3>Totals</h3><div class="sheets-summary" style="display:flex;gap:32px;flex-wrap:wrap;">';
    for (var ti = 0; ti < materialTotals.length; ti++) {
      var mt = materialTotals[ti];
      // Shorten the display name if it's too long
      var displayName = mt.name.length > 20 ? mt.name.substring(0, 17) + '...' : mt.name;
      h += '<div><span class="big">' + mt.count + '</span> ' + displayName;
      h += '<br><span class="muted">' + mt.w + '"×' + mt.l + '" | +20%: ' + Math.ceil(mt.count * 1.2) + '</span></div>';
    }
    h += '<div><span class="big">' + totalParts + '</span> parts</div>';
    h += '<div><span class="big">' + totalSheets + '</span> total sheets</div></div>';
    
    // Combined Layouts - render each material group
    h += '<details class="viz-details" open><summary class="viz-toggle">Combined Layouts</summary><div class="viz-content">';
    
    // Highlight dropdown
    h += '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;padding:10px;background:rgba(15,23,42,0.4);border-radius:8px;">';
    h += '<label style="font-size:0.85em;margin:0;">Highlight Item:</label>';
    h += '<select id="combinedHighlightItem" style="padding:6px 10px;min-width:180px;" onchange="App.updateCombinedHighlight()">';
    h += '<option value="">None / All</option>';
    for (var hi = 0; hi < calc.length; hi++) {
      h += '<option value="' + calc[hi].id + '">' + (calc[hi].sourceItemName || calc[hi].name) + '</option>';
    }
    h += '</select>';
    h += '<span id="highlightLegend" class="muted" style="display:none;font-size:0.85em;margin-left:auto;"></span>';
    h += '</div>';
    
    // Generate a safe ID from material name
    function safeId(name) {
      return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
    
    for (var ci = 0; ci < materialTotals.length; ci++) {
      var mt = materialTotals[ci];
      var matData = combined[mt.name];
      var sid = safeId(mt.name);
      
      h += '<h4 style="color:#3b82f6;margin-top:16px;">' + mt.name + ' (' + mt.count + ' sheet' + (mt.count > 1 ? 's' : '') + ', ' + mt.w + '"×' + mt.l + '")</h4>';
      
      for (var si = 0; si < matData.sheets.length; si++) {
        h += renderSheetViz(matData.sheets[si], matData.w, matData.l, 'canvas-comb-' + sid + '-' + si);
      }
    }
    
    if (materialTotals.length === 0) {
      h += '<p class="muted">No sheets to display</p>';
    }
    
    h += '</div></details></div>';
    
    $('combinedResults').innerHTML = h;
    
    // Cache data for highlight redraw
    lastCombinedData = {
      calc: calc,
      materialTotals: materialTotals,
      combined: combined
    };
    combinedHighlightItem = '';  // Reset highlight on recalculate
    
    // Draw canvases after DOM update
    setTimeout(function() {
      for (var di = 0; di < materialTotals.length; di++) {
        var mt = materialTotals[di];
        var matData = combined[mt.name];
        var sid = safeId(mt.name);
        
        for (var si = 0; si < matData.sheets.length; si++) {
          Optimize.drawSheetLayout(matData.sheets[si], matData.w, matData.l, 'canvas-comb-' + sid + '-' + si, fmtIn, combinedHighlightItem);
        }
      }
    }, 100);
  }

  // ============================================================================
  // CSV IMPORT
  // ============================================================================
  
  // Valid types for CSV import
  var VALID_CSV_TYPES = ['sheet', 'platform', 'pedestal', 'case', 'case-desiccant'];
  
  /**
   * Normalize type string to canonical form
   * Handles aliases like "case+desiccant", "case_desiccant", "case desiccant" -> "case-desiccant"
   */
  function normalizeType(typeStr) {
    var t = (typeStr || '').toLowerCase().trim();
    // Normalize case-desiccant aliases
    if (t === 'case+desiccant' || t === 'case_desiccant' || t === 'case desiccant' || t === 'casedesiccant') {
      return 'case-desiccant';
    }
    return t;
  }
  
  function handleCSVUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = function(e) {
      var text = e.target.result;
      parseCSV(text);
      // Reset file input so same file can be re-uploaded
      event.target.value = '';
    };
    reader.readAsText(file);
  }
  
  /**
   * Parse CSV with flexible header support
   * 
   * Required columns: type, name, width, length, height, qty
   * Optional columns: stock, chamber_height, wall_front, wall_back, wall_left, wall_right
   * 
   * - type: sheet, platform, pedestal, case, case-desiccant (with aliases)
   * - height: required for all except sheet
   * - stock: exact name of Stock Sheet library entry
   * - chamber_height: for case-desiccant, default 5
   * - wall_*: integers default 1, for case wall counts
   */
  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function(line) { return line.trim(); });
    if (lines.length === 0) {
      alert('CSV file is empty');
      return;
    }
    
    // Parse header row to get column indices
    var headerCols = lines[0].split(',').map(function(c) { 
      return c.trim().toLowerCase().replace(/\s+/g, '_'); 
    });
    
    // Required columns
    var requiredCols = ['type', 'name', 'width', 'length', 'height', 'qty'];
    var colIdx = {};
    
    // Map column names to indices
    for (var hi = 0; hi < headerCols.length; hi++) {
      colIdx[headerCols[hi]] = hi;
    }
    
    // Check required columns exist
    var missingCols = [];
    for (var ri = 0; ri < requiredCols.length; ri++) {
      if (colIdx[requiredCols[ri]] === undefined) {
        missingCols.push(requiredCols[ri]);
      }
    }
    
    if (missingCols.length > 0) {
      alert('CSV Error: Missing required columns: ' + missingCols.join(', ') + 
            '\n\nRequired: type, name, width, length, height, qty' +
            '\nOptional: stock, chamber_height, wall_front, wall_back, wall_left, wall_right' +
            '\n\nFound: ' + headerCols.join(', '));
      return;
    }
    
    var errors = [];
    var stockWarnings = [];
    var imported = 0;
    var newItems = [];
    var library = Materials.getLibrary();
    
    // Process data rows (skip header)
    for (var i = 1; i < lines.length; i++) {
      var rowNum = i + 1;
      var cols = lines[i].split(',').map(function(c) { return c.trim(); });
      
      // Helper to get column value by name
      function getCol(name) {
        var idx = colIdx[name];
        return (idx !== undefined && idx < cols.length) ? cols[idx] : '';
      }
      
      // Parse and normalize type
      var rawType = getCol('type');
      var type = normalizeType(rawType);
      
      if (VALID_CSV_TYPES.indexOf(type) === -1) {
        errors.push('Row ' + rowNum + ': Invalid type "' + rawType + '" (must be: ' + VALID_CSV_TYPES.join(', ') + ')');
        continue;
      }
      
      // Validate name
      var name = getCol('name');
      if (!name) {
        errors.push('Row ' + rowNum + ': Name is required');
        continue;
      }
      
      // Parse width
      var widthStr = getCol('width');
      var width = parseFloat(widthStr);
      if (isNaN(width) || width <= 0) {
        errors.push('Row ' + rowNum + ': Invalid width "' + widthStr + '"');
        continue;
      }
      
      // Parse length
      var lengthStr = getCol('length');
      var length = parseFloat(lengthStr);
      if (isNaN(length) || length <= 0) {
        errors.push('Row ' + rowNum + ': Invalid length "' + lengthStr + '"');
        continue;
      }
      
      // Parse height (required for 3D types)
      var heightStr = getCol('height');
      var height = parseFloat(heightStr);
      var needs3D = (type === 'platform' || type === 'pedestal' || type === 'case' || type === 'case-desiccant');
      if (needs3D) {
        if (heightStr === '' || isNaN(height) || height <= 0) {
          errors.push('Row ' + rowNum + ': ' + type + ' requires height');
          continue;
        }
      }
      
      // Parse qty
      var qtyStr = getCol('qty');
      var qty = parseInt(qtyStr);
      if (isNaN(qty) || qty < 1) {
        errors.push('Row ' + rowNum + ': Invalid qty "' + qtyStr + '" (must be integer >= 1)');
        continue;
      }
      
      // Parse optional stock column
      var stockName = getCol('stock');
      var matIdx = null;
      
      if (stockName) {
        var foundIdx = -1;
        for (var li = 0; li < library.length; li++) {
          if (library[li].name === stockName) {
            foundIdx = li;
            break;
          }
        }
        if (foundIdx >= 0) {
          matIdx = foundIdx;
        } else {
          stockWarnings.push('Row ' + rowNum + ': Stock "' + stockName + '" not found');
        }
      }
      
      // Parse optional chamber_height (for case-desiccant)
      var chamberHeightStr = getCol('chamber_height');
      var chamberHeight = chamberHeightStr ? parseFloat(chamberHeightStr) : null;
      if (chamberHeightStr && (isNaN(chamberHeight) || chamberHeight <= 0)) {
        chamberHeight = null; // Invalid, use default later
      }
      
      // Parse optional wall counts (for cases)
      function parseWallCount(colName) {
        var val = getCol(colName);
        if (!val) return null;
        var num = parseInt(val);
        return (!isNaN(num) && num >= 1) ? num : null;
      }
      
      var wallFront = parseWallCount('wall_front');
      var wallBack = parseWallCount('wall_back');
      var wallLeft = parseWallCount('wall_left');
      var wallRight = parseWallCount('wall_right');
      
      // Create item
      itemCounter++;
      var newItem = {
        id: 'item-' + itemCounter,
        type: type,
        name: name,
        matIdx: matIdx,
        csvData: {
          width: width,
          length: length,
          height: needs3D ? height : null,
          qty: qty,
          chamberHeight: chamberHeight,
          wallFront: wallFront,
          wallBack: wallBack,
          wallLeft: wallLeft,
          wallRight: wallRight
        }
      };
      newItems.push(newItem);
      imported++;
    }
    
    // Add all valid items
    items = items.concat(newItems);
    renderItems();
    
    // Store CSV data in item.fields so it persists on re-render
    setTimeout(function() {
      newItems.forEach(function(item) {
        if (!item.csvData) return;
        
        if (!item.fields) item.fields = {};
        
        // Store qty
        item.fields.qty = String(item.csvData.qty);
        
        if (item.type === 'sheet') {
          item.fields.w = String(item.csvData.width);
          item.fields.l = String(item.csvData.length);
        } else {
          item.fields.o1 = String(item.csvData.width);
          item.fields.o2 = String(item.csvData.length);
          if (item.csvData.height) {
            item.fields.oh = String(item.csvData.height);
          }
        }
        
        // Store chamber height for case-desiccant
        if (item.type === 'case-desiccant' && item.csvData.chamberHeight) {
          item.fields.ch = String(item.csvData.chamberHeight);
        }
        
        // Store wall counts for cases
        if (item.type === 'case' || item.type === 'case-desiccant') {
          if (item.csvData.wallFront) item.fields.wcf = String(item.csvData.wallFront);
          if (item.csvData.wallBack) item.fields.wcb = String(item.csvData.wallBack);
          if (item.csvData.wallLeft) item.fields.wcl = String(item.csvData.wallLeft);
          if (item.csvData.wallRight) item.fields.wcr = String(item.csvData.wallRight);
        }
        
        delete item.csvData;
      });
      
      renderItems();
    }, 50);
    
    // Show summary
    var msg = 'CSV Import Complete\n';
    msg += '━━━━━━━━━━━━━━━━━━━━\n';
    msg += 'Imported: ' + imported + ' item(s)\n';
    
    if (errors.length > 0) {
      msg += 'Skipped: ' + errors.length + ' row(s)\n\n';
      msg += 'Errors:\n';
      var showErrors = errors.slice(0, 8);
      for (var e = 0; e < showErrors.length; e++) {
        msg += '• ' + showErrors[e] + '\n';
      }
      if (errors.length > 8) {
        msg += '... and ' + (errors.length - 8) + ' more\n';
      }
    }
    
    if (stockWarnings.length > 0) {
      msg += '\nStock Warnings:\n';
      var showStockWarn = stockWarnings.slice(0, 5);
      for (var sw = 0; sw < showStockWarn.length; sw++) {
        msg += '⚠ ' + showStockWarn[sw] + '\n';
      }
      if (stockWarnings.length > 5) {
        msg += '... and ' + (stockWarnings.length - 5) + ' more\n';
      }
    }
    
    if (imported > 0) {
      var needsMaterial = newItems.filter(function(it) { return it.matIdx === null; }).length;
      if (needsMaterial > 0) {
        msg += '\n→ ' + needsMaterial + ' item(s) need material selection.';
      } else {
        msg += '\n→ All items have materials assigned. Click Calculate.';
      }
    }
    
    alert(msg);
  }

  // ============================================================================
  // JSON JOB EXPORT / IMPORT
  // ============================================================================

  /**
   * Export current job (settings + all items) as a downloadable JSON file
   */
  function exportJob() {
    if (items.length === 0) {
      alert('Nothing to export — add some items first.');
      return;
    }

    var library = Materials.getLibrary();

    // Snapshot each item's editable state
    var exportItems = items.map(function(item) {
      var mat = item.matIdx !== null ? Materials.getFromLibrary(item.matIdx) : null;
      return {
        type: item.type,
        name: item.name,
        matIdx: item.matIdx,
        materialName: mat ? mat.name : null,
        fields: item.fields || {}
      };
    });

    var job = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      items: exportItems
    };

    var blob = new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'estimator-job.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import a job from a JSON file (settings + items)
   */
  function handleJobImport(event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var job = JSON.parse(e.target.result);
      } catch (err) {
        alert('Invalid JSON file.');
        return;
      }

      if (!job.version || !job.items || !Array.isArray(job.items)) {
        alert('This file does not look like an estimator job.');
        return;
      }

      // Restore settings
      if (job.settings) {
        var s = job.settings;
        if (s.maxSpan && $('globalMaxSpan'))   $('globalMaxSpan').value = s.maxSpan;
        if (s.ribThickness && $('globalRibT')) $('globalRibT').value = s.ribThickness;
        if (s.kerf && $('globalKerf'))         $('globalKerf').value = s.kerf;
        if (s.caseInset && $('globalCaseInset')) $('globalCaseInset').value = s.caseInset;
      }

      // Build a name→index lookup for the current material library
      var library = Materials.getLibrary();
      var nameToIdx = {};
      for (var mi = 0; mi < library.length; mi++) {
        nameToIdx[library[mi].name] = mi;
      }

      // Create items
      var imported = 0;
      for (var i = 0; i < job.items.length; i++) {
        var ji = job.items[i];
        itemCounter++;

        // Try to resolve material: match by name first, fall back to index
        var matIdx = null;
        if (ji.materialName && nameToIdx[ji.materialName] !== undefined) {
          matIdx = nameToIdx[ji.materialName];
        } else if (ji.matIdx !== null && ji.matIdx !== undefined && library[ji.matIdx]) {
          matIdx = ji.matIdx;
        }

        var newItem = {
          id: 'item-' + itemCounter,
          type: ji.type || '',
          name: ji.name || ('Item ' + itemCounter),
          matIdx: matIdx,
          fields: ji.fields || {}
        };
        items.push(newItem);
        imported++;
      }

      renderItems();
      alert('Imported ' + imported + ' item(s) from job file.');
    };

    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    event.target.value = '';
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    Materials.initWithDefault();
    renderMaterials();
    updateItemMaterialDropdown();
    
    // Setup CSV upload handler
    var csvInput = $('csvUpload');
    if (csvInput) {
      csvInput.addEventListener('change', handleCSVUpload);
    }

    // Setup JSON job import handler
    var jobInput = $('jobImport');
    if (jobInput) {
      jobInput.addEventListener('change', handleJobImport);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  return {
    init: init,
    updateMatOptions: updateMatOptions,
    updateMatSizes: updateMatSizes,
    updateMatThickness: updateMatThickness,
    addMaterial: addMaterial,
    removeMaterial: removeMaterial,
    toggleFavorite: toggleFavorite,
    filterStockDropdown: filterStockDropdown,
    addItem: addItem,
    removeItem: removeItem,
    updateItemName: updateItemName,
    updateItemType: updateItemType,
    updateItemMaterial: updateItemMaterial,
    saveItemField: saveItemField,
    calculateAll: calculateAll,
    handleCSVUpload: handleCSVUpload,
    exportJob: exportJob,
    handleJobImport: handleJobImport,
    updateCombinedHighlight: updateCombinedHighlight
  };

})();

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', App.init);
