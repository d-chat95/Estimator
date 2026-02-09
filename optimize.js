/**
 * optimize.js - Sheet Nesting / Bin Packing Algorithm
 * 
 * Contains:
 * - Rectangle class (parts to be placed)
 * - Sheet class (with free rectangle tracking)
 * - nestParts() - Main bin-packing algorithm
 * - Drawing function for canvas visualization
 * 
 * This is a self-contained optimization module with no dependencies
 * on the rest of the application.
 */

var Optimize = (function() {

  // ============================================================================
  // RECTANGLE CLASS
  // ============================================================================
  
  /**
   * Represents a part to be nested
   * @param {number} w - Width
   * @param {number} h - Height (called 'l' elsewhere for length)
   * @param {number} id - Unique identifier
   * @param {string} name - Display name
   * @param {string} category - Category for coloring (skin, wall, rib, etc.)
   * @param {string} sourceItemId - Source item ID (optional)
   * @param {string} sourceItemName - Source item display name (optional)
   */
  function Rectangle(w, h, id, name, category, sourceItemId, sourceItemName) {
    this.w = w;
    this.h = h;
    this.id = id;
    this.name = name;
    this.category = category || 'panel';
    this.sourceItemId = sourceItemId || null;
    this.sourceItemName = sourceItemName || null;
  }

  // ============================================================================
  // SHEET CLASS
  // ============================================================================
  
  /**
   * Represents a sheet with placements and free space tracking
   * @param {number} w - Sheet width
   * @param {number} h - Sheet height
   * @param {number} index - Sheet number (1-based)
   * @param {number} kerf - Kerf/gap between parts
   */
  function Sheet(w, h, index, kerf) {
    this.w = w;
    this.h = h;
    this.index = index;
    this.kerf = kerf || 0;
    this.placements = [];
    this.freeRects = [{ x: 0, y: 0, w: w, h: h }];
  }

  /**
   * Add a part placement to the sheet
   */
  Sheet.prototype.addPlacement = function(rect, x, y, rotated) {
    var p = { 
      rect: rect, 
      x: x, 
      y: y, 
      w: rotated ? rect.h : rect.w, 
      h: rotated ? rect.w : rect.h, 
      rotated: rotated 
    };
    this.placements.push(p);
    this.updateFreeRects(p);
    return p;
  };

  /**
   * Update free rectangles after a placement (Guillotine split)
   */
  Sheet.prototype.updateFreeRects = function(placement) {
    var newFree = [];
    var kerf = this.kerf;
    var occX = placement.x;
    var occY = placement.y;
    var occW = placement.w + kerf;
    var occH = placement.h + kerf;
    
    for (var i = 0; i < this.freeRects.length; i++) {
      var f = this.freeRects[i];
      
      // No overlap - keep this free rect
      if (occX >= f.x + f.w || occX + occW <= f.x || 
          occY >= f.y + f.h || occY + occH <= f.y) {
        newFree.push(f);
        continue;
      }
      
      // Split around the occupied area
      // Left piece
      if (occX > f.x) {
        newFree.push({ x: f.x, y: f.y, w: occX - f.x, h: f.h });
      }
      // Right piece
      if (occX + occW < f.x + f.w) {
        newFree.push({ x: occX + occW, y: f.y, w: (f.x + f.w) - (occX + occW), h: f.h });
      }
      // Top piece
      if (occY > f.y) {
        newFree.push({ x: f.x, y: f.y, w: f.w, h: occY - f.y });
      }
      // Bottom piece
      if (occY + occH < f.y + f.h) {
        newFree.push({ x: f.x, y: occY + occH, w: f.w, h: (f.y + f.h) - (occY + occH) });
      }
    }
    
    this.freeRects = this.removeDuplicateRects(newFree);
  };

  /**
   * Remove rectangles that are fully contained within other rectangles
   */
  Sheet.prototype.removeDuplicateRects = function(rects) {
    var result = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var contained = false;
      
      for (var j = 0; j < rects.length; j++) {
        if (i === j) continue;
        var o = rects[j];
        if (r.x >= o.x && r.y >= o.y && 
            r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h) {
          contained = true;
          break;
        }
      }
      
      if (!contained && r.w > 0 && r.h > 0) {
        result.push(r);
      }
    }
    return result;
  };

  /**
   * Find the best position for a rectangle (Best Short Side Fit)
   */
  Sheet.prototype.findBestPosition = function(rectW, rectH, kerf) {
    var best = null;
    var bestScore = Infinity;
    
    for (var i = 0; i < this.freeRects.length; i++) {
      var f = this.freeRects[i];
      
      // Try normal orientation
      if (rectW <= f.w && rectH <= f.h) {
        var score = Math.min(f.w - rectW, f.h - rectH);
        if (score < bestScore) {
          bestScore = score;
          best = { x: f.x, y: f.y, rotated: false };
        }
      }
      
      // Try rotated orientation
      if (rectH <= f.w && rectW <= f.h) {
        var score2 = Math.min(f.w - rectH, f.h - rectW);
        if (score2 < bestScore) {
          bestScore = score2;
          best = { x: f.x, y: f.y, rotated: true };
        }
      }
    }
    
    return best;
  };

  // ============================================================================
  // NESTING ALGORITHM
  // ============================================================================
  
  /**
   * Nest parts onto sheets using First Fit Decreasing algorithm
   * @param {array} parts - Array of { name, qty, w, l, category, sourceItemId, sourceItemName }
   * @param {number} sheetW - Sheet width
   * @param {number} sheetL - Sheet length
   * @param {number} kerf - Kerf/gap between parts
   * @returns {object} - { sheets: Array of Sheet objects, unplaced: Array of unplaceable rects }
   */
  function nestParts(parts, sheetW, sheetL, kerf) {
    // Expand parts array into individual rectangles
    var rects = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      for (var j = 0; j < p.qty; j++) {
        rects.push(new Rectangle(p.w, p.l, rects.length, p.name, p.category, p.sourceItemId, p.sourceItemName));
      }
    }
    
    // Sort by area (largest first), then by longest dimension
    rects.sort(function(a, b) {
      var areaA = a.w * a.h;
      var areaB = b.w * b.h;
      if (areaB !== areaA) return areaB - areaA;
      return Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });
    
    // Place each rectangle
    var sheets = [];
    var unplaced = [];
    
    for (var r = 0; r < rects.length; r++) {
      var rect = rects[r];
      var placed = false;
      
      // Check if part can ever fit on a fresh sheet
      var canFit = partFits(rect.w, rect.h, sheetW, sheetL);
      if (!canFit) {
        unplaced.push(rect);
        continue;
      }
      
      // Try to fit in existing sheets
      for (var s = 0; s < sheets.length; s++) {
        var pos = sheets[s].findBestPosition(rect.w, rect.h, kerf);
        if (pos) {
          sheets[s].addPlacement(rect, pos.x, pos.y, pos.rotated);
          placed = true;
          break;
        }
      }
      
      // Create new sheet if needed
      if (!placed) {
        var newSheet = new Sheet(sheetW, sheetL, sheets.length + 1, kerf);
        var pos2 = newSheet.findBestPosition(rect.w, rect.h, kerf);
        if (pos2) {
          newSheet.addPlacement(rect, pos2.x, pos2.y, pos2.rotated);
          sheets.push(newSheet);
        }
      }
    }
    
    // Return object with sheets and any unplaced (oversized) parts
    return { sheets: sheets, unplaced: unplaced };
  }

  // ============================================================================
  // VISUALIZATION
  // ============================================================================
  
  // Color mapping for part categories
  var CATEGORY_COLORS = {
    'skin': '#3b82f6',   // Blue
    'wall': '#8b5cf6',   // Purple
    'rib': '#f59e0b',    // Orange
    'panel': '#a855f7',  // Violet
    'case': '#fbbf24',   // Yellow
    'obo': '#10b981',    // Green
    'hdpe': '#06b6d4'    // Cyan
  };
  
  var DEFAULT_COLORS = ['#10b981', '#06b6d4', '#ec4899', '#ef4444'];

  /**
   * Draw a sheet layout on a canvas
   * @param {Sheet} sheet - Sheet object with placements
   * @param {number} sheetW - Sheet width
   * @param {number} sheetL - Sheet length
   * @param {string} canvasId - DOM ID of canvas element
   * @param {function} fmtIn - Formatter function for inches (optional)
   * @param {string} highlightItemId - If set, dim parts not from this item (optional)
   */
  function drawSheetLayout(sheet, sheetW, sheetL, canvasId, fmtIn, highlightItemId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    // Default formatter
    fmtIn = fmtIn || function(x) { return x.toFixed(2) + '"'; };
    
    var scale = Math.min(700 / sheetW, 500 / sheetL);
    var padding = 20;
    
    canvas.width = sheetW * scale + padding * 2;
    canvas.height = sheetL * scale + padding * 2;
    
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw sheet background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padding, padding, sheetW * scale, sheetL * scale);
    
    // Draw sheet border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, padding, sheetW * scale, sheetL * scale);
    
    // Draw each placement
    for (var i = 0; i < sheet.placements.length; i++) {
      var p = sheet.placements[i];
      var x = padding + p.x * scale;
      var y = padding + p.y * scale;
      var w = p.w * scale;
      var h = p.h * scale;
      
      // Check if this part should be dimmed (highlight mode active, part from different item)
      var isDimmed = highlightItemId && p.rect.sourceItemId && p.rect.sourceItemId !== highlightItemId;
      
      // Determine color
      var color;
      if (isDimmed) {
        color = '#9ca3af';  // Neutral gray for dimmed parts
      } else {
        color = CATEGORY_COLORS[p.rect.category] || 
                DEFAULT_COLORS[p.rect.id % DEFAULT_COLORS.length];
      }
      
      // Fill with semi-transparent color (lighter if dimmed)
      ctx.fillStyle = isDimmed ? '#e5e7eb' : (color + '40');
      ctx.fillRect(x, y, w, h);
      
      // Draw border
      ctx.strokeStyle = color;
      ctx.lineWidth = isDimmed ? 1 : 2;
      ctx.strokeRect(x, y, w, h);
      
      // Draw label
      ctx.fillStyle = isDimmed ? '#9ca3af' : '#1e293b';
      ctx.font = 'bold ' + Math.max(10, Math.min(14, w / 8)) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Build label - include source item name for combined layouts
      var label = p.rect.name;
      if (p.rect.sourceItemName) {
        label = p.rect.name + ' — ' + p.rect.sourceItemName;
      }
      label += (p.rotated ? ' (R)' : '');
      
      // Clip to part bounds
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillText(label, x + w/2, y + h/2 - 8, w - 8);
      ctx.font = Math.max(9, Math.min(11, w / 10)) + 'px Arial';
      ctx.fillText(fmtIn(p.w) + ' × ' + fmtIn(p.h), x + w/2, y + h/2 + 8, w - 8);
      ctx.restore();
    }
    
    // Draw sheet label
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Sheet ' + sheet.index + ' (' + fmtIn(sheetW) + ' × ' + fmtIn(sheetL) + ')', padding, padding - 5);
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  /**
   * Check if a part fits on a sheet (in either orientation)
   */
  function partFits(partW, partL, sheetW, sheetL) {
    var fitsNormal = (partW <= sheetW && partL <= sheetL);
    var fitsRotated = (partL <= sheetW && partW <= sheetL);
    return fitsNormal || fitsRotated;
  }

  /**
   * Calculate how many parts fit per sheet (for estimates)
   */
  function partsPerSheet(partW, partL, sheetW, sheetL, kerf) {
    var pw = partW + kerf;
    var pl = partL + kerf;
    var fit1 = Math.floor(sheetW / pw) * Math.floor(sheetL / pl);
    var fit2 = Math.floor(sheetW / pl) * Math.floor(sheetL / pw);
    return Math.max(fit1, fit2);
  }

  /**
   * Calculate full sheets needed for an oversized panel
   */
  function calcOversizedPanel(partW, partL, sheetW, sheetL) {
    if (partFits(partW, partL, sheetW, sheetL)) {
      return { count: 0, fits: true, desc: 'Fits on sheet' };
    }
    
    var opt1 = { 
      wide: Math.ceil(partW / sheetW), 
      long: Math.ceil(partL / sheetL) 
    };
    opt1.count = opt1.wide * opt1.long;
    
    var opt2 = { 
      wide: Math.ceil(partW / sheetL), 
      long: Math.ceil(partL / sheetW) 
    };
    opt2.count = opt2.wide * opt2.long;
    
    var best = opt1.count <= opt2.count ? opt1 : opt2;
    
    return {
      count: best.count,
      fits: false,
      wide: best.wide,
      long: best.long,
      desc: best.wide + '×' + best.long + ' layout (' + best.count + ' full sheets)'
    };
  }

  /**
   * Create a full-sheet visualization (for oversized parts)
   */
  function createFullSheetViz(sheetW, sheetL, index, kerf, partName, category) {
    var sheet = new Sheet(sheetW, sheetL, index, kerf);
    var rect = new Rectangle(sheetW, sheetL, 0, partName, category);
    sheet.addPlacement(rect, 0, 0, false);
    return sheet;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  return {
    // Classes (exposed for external use if needed)
    Rectangle: Rectangle,
    Sheet: Sheet,
    
    // Main functions
    nestParts: nestParts,
    drawSheetLayout: drawSheetLayout,
    
    // Helpers
    partFits: partFits,
    partsPerSheet: partsPerSheet,
    calcOversizedPanel: calcOversizedPanel,
    createFullSheetViz: createFullSheetViz,
    
    // Constants
    CATEGORY_COLORS: CATEGORY_COLORS
  };

})();
