/**
 * estimate.js - Estimation Logic for All Product Types
 * 
 * Contains:
 * - calcSheet() - Simple flat panel calculation
 * - calcPlatform() - Ribbed platform/pedestal calculation
 * - calcCase() - Case with Obo/HDPE panels calculation
 * - Shared helper functions (ribPlan, etc.)
 * 
 * Dependencies: Materials, Optimize (must be loaded first)
 * 
 * PRODUCT TYPE COMPARISON:
 * ========================
 * 
 * | Feature          | Platform      | Pedestal      | Case          |
 * |------------------|---------------|---------------|---------------|
 * | Walls (default)  | 2 per side    | 1 per side    | 1 per side    |
 * | Top Layers       | 2 (default)   | 1 (default)   | 0 (Obo+HDPE)  |
 * | Bottom Layers    | 0 (default)   | 0 (default)   | 1 (MDO)       |
 * | Has Ribs         | Yes           | Yes           | No            |
 * | Multi-Material   | No            | No            | Yes (MDO+Obo+HDPE) |
 * | Uses OD Input    | Yes           | Yes           | Yes           |
 */

var Estimate = (function() {

  // ============================================================================
  // SHARED UTILITIES
  // ============================================================================
  
  /**
   * Calculate rib layout for a given span
   * @param {number} D - Internal dimension to span
   * @param {number} S - Maximum clear span allowed
   * @param {number} T - Rib thickness
   * @returns {object} - { bays, ribs, clear }
   */
  function ribPlan(D, S, T) {
    var bays = Math.ceil((D + T) / (S + T));
    if (bays < 1) bays = 1;
    var ribs = Math.max(0, bays - 1);
    var clear = (D - ribs * T) / bays;
    return { bays: bays, ribs: ribs, clear: clear };
  }

  // ============================================================================
  // UNIFIED OVERSIZED PANEL SPLITTING
  // ============================================================================

  /**
   * Check if a material allows seams (splitting)
   * Acrylic/glass materials do NOT allow seams
   * @param {string} materialName - Material name
   * @returns {boolean}
   */
  function allowsSeams(materialName) {
    return true;
  }

  /**
   * Check if a part fits on stock (either orientation)
   */
  function partFitsStock(partW, partL, stockW, stockL) {
    return (partW <= stockW && partL <= stockL) || 
           (partL <= stockW && partW <= stockL);
  }

  /**
   * Calculate strip layout for splitting in one direction
   * @param {number} splitDim - Dimension being split into strips
   * @param {number} keepDim - Dimension that stays whole
   * @param {number} stockW - Stock width
   * @param {number} stockL - Stock length
   * @param {number} seamGap - Gap between strips when assembled
   * @returns {object|null} - { pieces, stripCount } or null if not possible
   */
  function calcStripLayout(splitDim, keepDim, stockW, stockL, seamGap) {
    // The "keep" dimension must fit on stock (possibly rotated)
    var keepFitsInW = (keepDim <= stockW);
    var keepFitsInL = (keepDim <= stockL);
    
    if (!keepFitsInW && !keepFitsInL) {
      return null; // Can't make strips this way
    }
    
    // Determine max strip size for the split dimension
    var maxStripDim;
    if (keepFitsInL && keepFitsInW) {
      // Keep dim fits both ways, use larger option for strip
      maxStripDim = Math.max(stockW, stockL);
    } else if (keepFitsInL) {
      maxStripDim = stockW;  // Keep uses L, strip uses W
    } else {
      maxStripDim = stockL;  // Keep uses W, strip uses L
    }
    
    if (maxStripDim <= 0) return null;
    
    // Calculate number of strips needed
    // With N strips and (N-1) seam gaps:
    // N * stripSize + (N-1) * seamGap = splitDim
    // Each strip: stripSize = (splitDim - (N-1)*seamGap) / N
    var stripCount = Math.ceil(splitDim / maxStripDim);
    
    // Refine strip count to account for seam gaps
    for (var tries = 0; tries < 10; tries++) {
      var totalGap = (stripCount - 1) * seamGap;
      var materialNeeded = splitDim - totalGap;
      var stripSize = materialNeeded / stripCount;
      
      if (stripSize <= maxStripDim && stripSize > 0.5) {
        break; // This works
      }
      stripCount++;
    }
    
    // Calculate final strip size
    var totalGap = (stripCount - 1) * seamGap;
    var stripSize = (splitDim - totalGap) / stripCount;
    
    if (stripSize <= 0 || stripSize > maxStripDim) {
      return null;
    }
    
    return {
      stripSize: stripSize,
      keepDim: keepDim,
      stripCount: stripCount
    };
  }

  /**
   * Calculate a 2D grid layout when BOTH dimensions exceed stock.
   * Tries both stock orientations, picks the one with fewest total pieces.
   * Accounts for seam gaps in both directions.
   *
   * @param {number} partW - Part width
   * @param {number} partL - Part length
   * @param {number} stockW - Stock sheet width
   * @param {number} stockL - Stock sheet length
   * @param {number} seamGap - Gap between pieces (kerf)
   * @returns {object|null} - { cols, rows, total, pieceW, pieceL } or null
   */
  function calcGridLayout(partW, partL, stockW, stockL, seamGap) {
    var orientations = [
      { sw: stockW, sl: stockL },
      { sw: stockL, sl: stockW }
    ];
    var best = null;

    for (var o = 0; o < orientations.length; o++) {
      var sw = orientations[o].sw;
      var sl = orientations[o].sl;

      // Initial grid counts
      var cols = Math.ceil(partW / sw);
      var rows = Math.ceil(partL / sl);

      // Refine cols for seam gaps (same iterative pattern as calcStripLayout)
      for (var t1 = 0; t1 < 10; t1++) {
        var pw = (partW - (cols - 1) * seamGap) / cols;
        if (pw <= sw && pw > 0.5) break;
        cols++;
      }
      // Refine rows for seam gaps
      for (var t2 = 0; t2 < 10; t2++) {
        var pl = (partL - (rows - 1) * seamGap) / rows;
        if (pl <= sl && pl > 0.5) break;
        rows++;
      }

      var pieceW = (partW - (cols - 1) * seamGap) / cols;
      var pieceL = (partL - (rows - 1) * seamGap) / rows;

      if (pieceW > 0.5 && pieceL > 0.5 && pieceW <= sw && pieceL <= sl) {
        var total = cols * rows;
        if (!best || total < best.total) {
          best = { cols: cols, rows: rows, total: total, pieceW: pieceW, pieceL: pieceL };
        }
      }
    }

    return best;
  }

  /**
   * Fit a panel on stock, or split into strips if oversized
   * This is the UNIFIED helper for all panel types
   * 
   * @param {number} partW - Panel width
   * @param {number} partL - Panel length
   * @param {number} stockW - Stock sheet width
   * @param {number} stockL - Stock sheet length
   * @param {number} seamGap - Gap between strips (kerf)
   * @param {boolean} canSplit - If false, no splitting allowed
   * @returns {object} - { fits, pieces: [{w, l, suffix}], stripCount, warning }
   */
  function fitOrSplit(partW, partL, stockW, stockL, seamGap, canSplit) {
    seamGap = seamGap || 0;
    
    // Check if it fits as-is (try both orientations)
    if (partFitsStock(partW, partL, stockW, stockL)) {
      return {
        fits: true,
        pieces: [{ w: partW, l: partL, suffix: '' }],
        stripCount: 1,
        warning: null
      };
    }
    
    // Can't fit, and splitting not allowed
    if (!canSplit) {
      return {
        fits: false,
        pieces: [{ w: partW, l: partL, suffix: '' }],
        stripCount: 1,
        warning: 'exceeds stock (seams not allowed)',
        noSplit: true
      };
    }
    
    // Try strip splitting in both orientations
    // Option A: Split along width (strips are narrower, keep full length)
    var optA = calcStripLayout(partW, partL, stockW, stockL, seamGap);
    
    // Option B: Split along length (strips are shorter, keep full width)
    var optB = calcStripLayout(partL, partW, stockW, stockL, seamGap);
    
    // Choose best option (fewer strips, or the one that works)
    var best = null;
    var splitAxis = null;
    
    if (optA && optB) {
      if (optA.stripCount <= optB.stripCount) {
        best = optA;
        splitAxis = 'width';
      } else {
        best = optB;
        splitAxis = 'length';
      }
    } else if (optA) {
      best = optA;
      splitAxis = 'width';
    } else if (optB) {
      best = optB;
      splitAxis = 'length';
    }
    
    if (!best) {
      // Neither 1D strip option works — try 2D grid split
      var grid = calcGridLayout(partW, partL, stockW, stockL, seamGap);
      if (grid) {
        var gridPieces = [];
        var idx = 0;
        for (var r = 0; r < grid.rows; r++) {
          for (var c = 0; c < grid.cols; c++) {
            idx++;
            gridPieces.push({
              w: grid.pieceW,
              l: grid.pieceL,
              suffix: ' [' + idx + '/' + grid.total + ']'
            });
          }
        }
        return {
          fits: false,
          pieces: gridPieces,
          stripCount: grid.total,
          warning: 'will be split into ' + grid.cols + '\u00d7' + grid.rows + ' grid (' + grid.total + ' pieces)'
        };
      }

      // Truly can't split — return as-is (will be unplaced)
      return {
        fits: false,
        pieces: [{ w: partW, l: partL, suffix: '' }],
        stripCount: 1,
        warning: 'cannot be split to fit stock',
        noSplit: true
      };
    }
    
    // Generate pieces
    var pieces = [];
    for (var i = 0; i < best.stripCount; i++) {
      var pieceW, pieceL;
      if (splitAxis === 'width') {
        pieceW = best.stripSize;
        pieceL = best.keepDim;
      } else {
        pieceW = best.keepDim;
        pieceL = best.stripSize;
      }
      pieces.push({ 
        w: pieceW, 
        l: pieceL, 
        suffix: ' [' + (i + 1) + '/' + best.stripCount + ']'
      });
    }
    
    return {
      fits: false,
      pieces: pieces,
      stripCount: best.stripCount,
      warning: 'will be split into ' + best.stripCount + ' pieces'
    };
  }

  /**
   * Run fitOrSplit on a part and push resulting piece(s) into a parts array.
   * Also pushes any warning into the warnings array.
   * This centralises the oversize-check → split → warn pattern.
   *
   * @param {string} partName - Display name of the part (e.g. 'Wall (Dim1)')
   * @param {number} qty - Quantity of the part
   * @param {number} partW - Part width
   * @param {number} partL - Part length
   * @param {number} stockW - Stock sheet width
   * @param {number} stockL - Stock sheet length
   * @param {number} kerf - Kerf / seam gap
   * @param {boolean} canSplit - Whether the material allows seam-splitting
   * @param {string} category - Part category tag
   * @param {string} materialName - Material name tag
   * @param {Array} partsArr - Array to push part(s) into
   * @param {Array} warningsArr - Array to push warnings into
   */
  function splitAndPush(partName, qty, partW, partL, stockW, stockL, kerf, canSplit, category, materialName, partsArr, warningsArr) {
    var result = fitOrSplit(partW, partL, stockW, stockL, kerf, canSplit);

    if (result.fits) {
      partsArr.push({ name: partName, qty: qty, w: partW, l: partL, category: category, material: materialName });
    } else if (result.noSplit) {
      warningsArr.push(partName + ' ' + partW.toFixed(2) + '"×' + partL.toFixed(2) + '" ' + result.warning);
      partsArr.push({ name: partName, qty: qty, w: partW, l: partL, category: category, material: materialName });
    } else {
      warningsArr.push(partName + ' ' + partW.toFixed(2) + '"×' + partL.toFixed(2) + '" ' + result.warning);
      for (var i = 0; i < result.pieces.length; i++) {
        var piece = result.pieces[i];
        partsArr.push({ name: partName + piece.suffix, qty: qty, w: piece.w, l: piece.l, category: category, material: materialName });
      }
    }
  }

  /**
   * Calculate skin panels needed (handles oversized)
   * @param {number} skinW - Skin width
   * @param {number} skinL - Skin length
   * @param {number} sheetW - Sheet width
   * @param {number} sheetL - Sheet length
   * @returns {object} - { count, pieceW, pieceL, fullSheets, desc? }
   */
  function calcSkinPanels(skinW, skinL, sheetW, sheetL) {
    var fitsNormal = (skinW <= sheetW && skinL <= sheetL);
    var fitsRotated = (skinL <= sheetW && skinW <= sheetL);
    
    if (fitsNormal || fitsRotated) {
      return { count: 1, pieceW: skinW, pieceL: skinL, fullSheets: false };
    }
    
    // Need multiple sheets - calculate grid layout
    var opt1 = { 
      wide: Math.ceil(skinW / sheetW), 
      long: Math.ceil(skinL / sheetL) 
    };
    opt1.count = opt1.wide * opt1.long;
    
    var opt2 = { 
      wide: Math.ceil(skinW / sheetL), 
      long: Math.ceil(skinL / sheetW) 
    };
    opt2.count = opt2.wide * opt2.long;
    
    var best = opt1.count <= opt2.count ? opt1 : opt2;
    var useOpt1 = (best === opt1);
    
    return { 
      count: best.count, 
      pieceW: useOpt1 ? sheetW : sheetL, 
      pieceL: useOpt1 ? sheetL : sheetW,
      fullSheets: true,
      wide: best.wide,
      long: best.long,
      desc: best.wide + '×' + best.long + ' layout (' + best.count + ' full sheets)'
    };
  }

  /**
   * Multiply parts array by quantity
   */
  function multiplyParts(parts, qty) {
    return parts.map(function(p) {
      return { 
        name: p.name, 
        qty: p.qty * qty, 
        w: p.w, 
        l: p.l, 
        category: p.category, 
        material: p.material,
        fullSheet: p.fullSheet
      };
    });
  }

  // ============================================================================
  // SHEET CALCULATION
  // ============================================================================
  
  /**
   * Calculate a simple flat sheet/panel
   * @param {object} params - { qty, w, l }
   * @param {object} mat - Material { name, w, l, t }
   * @param {number} kerf - Kerf/gap
   * @returns {object} - Calculation result
   */
  function calcSheet(params, mat, kerf) {
    var qty = params.qty || 1;
    var w = params.w;
    var l = params.l;
    
    if (!w || !l) {
      return { error: 'Enter width and length' };
    }
    
    var canSplit = allowsSeams(mat.name);
    var splitResult = fitOrSplit(w, l, mat.w, mat.l, kerf, canSplit);
    
    var parts = [];
    var warnings = [];
    var baseName = params.name || 'Sheet';
    
    if (splitResult.fits) {
      // Fits as single piece
      parts.push({ 
        name: baseName, 
        qty: 1, 
        w: w, 
        l: l, 
        category: 'panel', 
        material: mat.name 
      });
    } else if (splitResult.noSplit) {
      // Can't fit or split - add as-is (will be unplaced)
      warnings.push(baseName + ' ' + w.toFixed(2) + '"×' + l.toFixed(2) + '" ' + splitResult.warning);
      parts.push({ 
        name: baseName, 
        qty: 1, 
        w: w, 
        l: l, 
        category: 'panel', 
        material: mat.name 
      });
    } else {
      // Split into multiple pieces
      warnings.push(baseName + ' ' + w.toFixed(2) + '"×' + l.toFixed(2) + '" ' + splitResult.warning);
      for (var i = 0; i < splitResult.pieces.length; i++) {
        var piece = splitResult.pieces[i];
        parts.push({ 
          name: baseName + piece.suffix, 
          qty: 1, 
          w: piece.w, 
          l: piece.l, 
          category: 'panel', 
          material: mat.name 
        });
      }
    }
    
    var nestResult = Optimize.nestParts(parts, mat.w, mat.l, kerf);
    
    return {
      parts: parts,
      nestedSheets: nestResult.sheets,
      unplaced: nestResult.unplaced,
      warnings: warnings,
      sheetW: mat.w,
      sheetL: mat.l,
      quantity: qty,
      totalSheets: nestResult.sheets.length
    };
  }

  // ============================================================================
  // PLATFORM / PEDESTAL CALCULATION
  // ============================================================================
  
  /**
   * Calculate a ribbed platform or pedestal
   * @param {object} params - Dimensions and configuration
   * @param {object} mat - Material { name, w, l, t }
   * @param {object} settings - { maxSpan, ribThickness, kerf }
   * @returns {object} - Calculation result
   */
  function calcPlatform(params, mat, settings) {
    var qty = params.qty || 1;
    var o1 = params.o1;      // Overall dimension 1
    var o2 = params.o2;      // Overall dimension 2
    var oh = params.oh;      // Overall height
    var w1 = params.w1 || 0; // Walls on dim1 sides
    var w2 = params.w2 || 0; // Walls on dim2 sides
    var topLayers = params.topLayers || 0;
    var botLayers = params.botLayers || 0;
    
    var t = mat.t;           // Material thickness
    var S = settings.maxSpan || 24;
    var ribT = settings.ribThickness || 0.75;
    var kerf = settings.kerf || 0.125;
    var sheetW = mat.w;
    var sheetL = mat.l;
    
    // Validation
    if (!o1 || !o2 || !oh) {
      return { error: 'Enter all dimensions' };
    }
    
    // Calculate interior dimensions
    var layers = topLayers + botLayers;
    var i1 = o1 - (t * w1 * 2);  // Interior dim 1
    var i2 = o2 - (t * w2 * 2);  // Interior dim 2
    var ih = oh - (t * layers);  // Interior height
    
    if (i1 <= 0 || i2 <= 0 || ih <= 0) {
      return { error: 'Dimensions too small for walls/layers' };
    }
    
    // Calculate rib plans
    var p1 = ribPlan(i1, S, ribT);
    var p2 = ribPlan(i2, S, ribT);
    
    // Build parts list
    var parts = [];
    var warnings = [];
    
    // Check if material allows seams
    var canSplit = allowsSeams(mat.name);
    
    // Top skins - use unified fitOrSplit
    if (topLayers > 0) {
      var topSplit = fitOrSplit(o1, o2, sheetW, sheetL, kerf, canSplit);
      
      if (topSplit.fits) {
        parts.push({ 
          name: 'Top Skin', 
          qty: topLayers, 
          w: o1, 
          l: o2, 
          category: 'skin', 
          material: mat.name 
        });
      } else if (topSplit.noSplit) {
        // Can't split - add as-is (will be unplaced)
        warnings.push('Top skin ' + o1.toFixed(2) + '"×' + o2.toFixed(2) + '" ' + topSplit.warning);
        parts.push({ 
          name: 'Top Skin', 
          qty: topLayers, 
          w: o1, 
          l: o2, 
          category: 'skin', 
          material: mat.name 
        });
      } else {
        // Split into strips
        warnings.push('Top skin ' + o1.toFixed(2) + '"×' + o2.toFixed(2) + '" ' + topSplit.warning);
        for (var ti = 0; ti < topSplit.pieces.length; ti++) {
          var tpiece = topSplit.pieces[ti];
          parts.push({ 
            name: 'Top Skin' + tpiece.suffix, 
            qty: topLayers, 
            w: tpiece.w, 
            l: tpiece.l, 
            category: 'skin', 
            material: mat.name 
          });
        }
      }
    }
    
    // Bottom skins - use unified fitOrSplit
    if (botLayers > 0) {
      var botSplit = fitOrSplit(o1, o2, sheetW, sheetL, kerf, canSplit);
      
      if (botSplit.fits) {
        parts.push({ 
          name: 'Bottom Skin', 
          qty: botLayers, 
          w: o1, 
          l: o2, 
          category: 'skin', 
          material: mat.name 
        });
      } else if (botSplit.noSplit) {
        // Can't split - add as-is (will be unplaced)
        warnings.push('Bottom skin ' + o1.toFixed(2) + '"×' + o2.toFixed(2) + '" ' + botSplit.warning);
        parts.push({ 
          name: 'Bottom Skin', 
          qty: botLayers, 
          w: o1, 
          l: o2, 
          category: 'skin', 
          material: mat.name 
        });
      } else {
        // Split into strips
        warnings.push('Bottom skin ' + o1.toFixed(2) + '"×' + o2.toFixed(2) + '" ' + botSplit.warning);
        for (var bi = 0; bi < botSplit.pieces.length; bi++) {
          var bpiece = botSplit.pieces[bi];
          parts.push({ 
            name: 'Bottom Skin' + bpiece.suffix, 
            qty: botLayers, 
            w: bpiece.w, 
            l: bpiece.l, 
            category: 'skin', 
            material: mat.name 
          });
        }
      }
    }
    
    // Walls
    if (w2 > 0) {
      splitAndPush('Wall (Dim1)', w2 * 2, o1, oh, sheetW, sheetL, kerf, canSplit, 'wall', mat.name, parts, warnings);
    }
    if (w1 > 0) {
      splitAndPush('Wall (Dim2)', w1 * 2, o2, oh, sheetW, sheetL, kerf, canSplit, 'wall', mat.name, parts, warnings);
    }

    // Ribs
    if (p1.ribs > 0) {
      splitAndPush('Rib (Dim2)', p1.ribs, ih, i2, sheetW, sheetL, kerf, canSplit, 'rib', mat.name, parts, warnings);
    }
    if (p2.ribs > 0) {
      splitAndPush('Rib (Dim1)', p2.ribs, ih, i1, sheetW, sheetL, kerf, canSplit, 'rib', mat.name, parts, warnings);
    }
    
    // Nest all parts (no more fullSheet filtering since we use strip splitting)
    var nestResult = Optimize.nestParts(parts, sheetW, sheetL, kerf);
    var nestedSheets = nestResult.sheets;
    
    // Track unplaced (oversized) parts
    if (nestResult.unplaced.length > 0) {
      for (var ui = 0; ui < nestResult.unplaced.length; ui++) {
        var up = nestResult.unplaced[ui];
        warnings.push('OVERSIZED: ' + up.name + ' (' + up.w.toFixed(2) + '"×' + up.h.toFixed(2) + '") cannot fit on sheet');
      }
    }
    
    return {
      parts: parts,
      nestedSheets: nestedSheets,
      nestedCount: nestedSheets.length,
      unplaced: nestResult.unplaced,
      sheetW: sheetW,
      sheetL: sheetL,
      quantity: qty,
      totalSheets: nestedSheets.length,
      warnings: warnings,
      ribPlan: {
        dim1: p1,
        dim2: p2,
        maxSpan: S
      },
      interior: { i1: i1, i2: i2, ih: ih }
    };
  }

  // ============================================================================
  // CASE CALCULATION
  // ============================================================================
  
  /**
   * Calculate a case (MDO box with Obo/HDPE panels)
   * @param {object} params - Dimensions and configuration
   * @param {object} mat - Primary material { name, w, l, t }
   * @param {object} settings - { kerf, caseInset }
   * @returns {object} - Calculation result
   */
  function calcCase(params, mat, settings) {
    var qty = params.qty || 1;
    var o1 = params.o1;           // Overall dimension 1
    var o2 = params.o2;           // Overall dimension 2
    var oh = params.oh;           // Overall height
    var wt = params.wallThickness || 0.75;
    var inset = settings.caseInset || 0.25;
    var hasChamber = params.hasChamber || false;
    var chamberH = params.chamberHeight || 5;
    var kerf = settings.kerf || 0.125;
    
    // Wall counts per side (default 1 for backward compatibility)
    var wcDim1A = params.wallCountDim1A || 1;
    var wcDim1B = params.wallCountDim1B || 1;
    var wcDim2A = params.wallCountDim2A || 1;
    var wcDim2B = params.wallCountDim2B || 1;
    
    // Validation
    if (!o1 || !o2 || !oh) {
      return { error: 'Enter overall dimensions' };
    }
    
    // Calculate interior dimensions
    var i1 = o1 - (wt * 2);
    var i2 = o2 - (wt * 2);
    var ih = oh - wt;  // Bottom only (no MDO top)
    
    // Obo/HDPE panel dimensions (inset from interior)
    var pw = i1 - (inset * 2);
    var pl = i2 - (inset * 2);
    
    // Sheet sizes
    var oboSheet = Materials.SHEET_SIZES.obo;
    var hdpeSheet = Materials.SHEET_SIZES.hdpe;
    
    // Use unified fitOrSplit for Obo and HDPE panels
    // Both Obo and HDPE allow seams (strip splitting)
    var oboSplit = fitOrSplit(pw, pl, oboSheet.w, oboSheet.l, kerf, true);
    var hdpeSplit = fitOrSplit(pw, pl, hdpeSheet.w, hdpeSheet.l, kerf, true);
    
    var warnings = [];
    if (!oboSplit.fits && oboSplit.warning) {
      warnings.push('Obo panel ' + pw.toFixed(2) + '"×' + pl.toFixed(2) + '" ' + oboSplit.warning);
    }
    if (!hdpeSplit.fits && hdpeSplit.warning) {
      warnings.push('HDPE panel ' + pw.toFixed(2) + '"×' + pl.toFixed(2) + '" ' + hdpeSplit.warning);
    }
    
    // Build parts lists by material
    var mdoParts = [];
    var oboParts = [];
    var hdpeParts = [];
    
    // MDO parts (bottom and walls - no top)
    var mdoCanSplit = allowsSeams(mat.name);
    splitAndPush('Bottom', 1, o1, o2, mat.w, mat.l, kerf, mdoCanSplit, 'case', 'MDO', mdoParts, warnings);

    // Wall (Dim1) - full width walls, use wcDim1A + wcDim1B count
    var wallDim1Count = wcDim1A + wcDim1B;
    splitAndPush('Wall (Dim1)', wallDim1Count, o1, oh, mat.w, mat.l, kerf, mdoCanSplit, 'wall', 'MDO', mdoParts, warnings);

    // Wall (Dim2) - interior width walls, use wcDim2A + wcDim2B count
    var wallDim2Count = wcDim2A + wcDim2B;
    splitAndPush('Wall (Dim2)', wallDim2Count, i2, oh, mat.w, mat.l, kerf, mdoCanSplit, 'wall', 'MDO', mdoParts, warnings);
    
    // Obo panel (top) - use strip splitting for oversized
    if (oboSplit.fits) {
      oboParts.push({ name: 'Obo Panel', qty: 1, w: pw, l: pl, category: 'obo', material: 'Obomodulan' });
    } else {
      // Split into strips
      for (var oi = 0; oi < oboSplit.pieces.length; oi++) {
        var opiece = oboSplit.pieces[oi];
        oboParts.push({ 
          name: 'Obo Panel' + opiece.suffix, 
          qty: 1, 
          w: opiece.w, 
          l: opiece.l, 
          category: 'obo', 
          material: 'Obomodulan'
        });
      }
    }
    
    // HDPE panel - use strip splitting for oversized
    if (hdpeSplit.fits) {
      hdpeParts.push({ name: 'HDPE Panel', qty: 1, w: pw, l: pl, category: 'hdpe', material: 'HDPE' });
    } else {
      // Split into strips
      for (var hi = 0; hi < hdpeSplit.pieces.length; hi++) {
        var hpiece = hdpeSplit.pieces[hi];
        hdpeParts.push({ 
          name: 'HDPE Panel' + hpiece.suffix, 
          qty: 1, 
          w: hpiece.w, 
          l: hpiece.l, 
          category: 'hdpe', 
          material: 'HDPE'
        });
      }
    }
    
    // Desiccant chamber (HDPE) - also check for oversized
    if (hasChamber) {
      // Chamber bottom might also need splitting
      var chamberBottomSplit = fitOrSplit(pw, pl, hdpeSheet.w, hdpeSheet.l, kerf, true);
      if (chamberBottomSplit.fits) {
        hdpeParts.push({ name: 'Chamber Bottom', qty: 1, w: pw, l: pl, category: 'hdpe', material: 'HDPE' });
      } else {
        for (var ci = 0; ci < chamberBottomSplit.pieces.length; ci++) {
          var cpiece = chamberBottomSplit.pieces[ci];
          hdpeParts.push({ 
            name: 'Chamber Bottom' + cpiece.suffix, 
            qty: 1, 
            w: cpiece.w, 
            l: cpiece.l, 
            category: 'hdpe', 
            material: 'HDPE'
          });
        }
        warnings.push('Chamber bottom ' + pw.toFixed(2) + '"×' + pl.toFixed(2) + '" ' + chamberBottomSplit.warning);
      }
      splitAndPush('Chamber Wall (W)', 2, pw, chamberH, hdpeSheet.w, hdpeSheet.l, kerf, true, 'hdpe', 'HDPE', hdpeParts, warnings);
      splitAndPush('Chamber Wall (L)', 2, pl - 1, chamberH, hdpeSheet.w, hdpeSheet.l, kerf, true, 'hdpe', 'HDPE', hdpeParts, warnings);
    }
    
    // Multiply by quantity for nesting (no more fullSheet filtering)
    var mdoPartsQty = multiplyParts(mdoParts, qty);
    var oboPartsQty = multiplyParts(oboParts, qty);
    var hdpePartsQty = multiplyParts(hdpeParts, qty);
    
    // Nest each material
    var mdoNest = Optimize.nestParts(mdoPartsQty, mat.w, mat.l, kerf);
    var hdpeNest = Optimize.nestParts(hdpePartsQty, hdpeSheet.w, hdpeSheet.l, kerf);
    var oboNest = Optimize.nestParts(oboPartsQty, oboSheet.w, oboSheet.l, kerf);
    
    var mdoSheets = mdoNest.sheets;
    var hdpeSheets = hdpeNest.sheets;
    var oboSheets = oboNest.sheets;
    
    // Collect all unplaced parts with material info
    var allUnplaced = [];
    mdoNest.unplaced.forEach(function(u) { allUnplaced.push({ rect: u, material: 'MDO' }); });
    hdpeNest.unplaced.forEach(function(u) { allUnplaced.push({ rect: u, material: 'HDPE' }); });
    oboNest.unplaced.forEach(function(u) { allUnplaced.push({ rect: u, material: 'Obo' }); });
    
    // Add warnings for unplaced
    allUnplaced.forEach(function(up) {
      warnings.push('OVERSIZED (' + up.material + '): ' + up.rect.name + ' (' + up.rect.w.toFixed(2) + '"×' + up.rect.h.toFixed(2) + '") cannot fit');
    });
    
    // All parts for cut list (per unit)
    var allParts = mdoParts.concat(oboParts).concat(hdpeParts);
    
    return {
      parts: allParts,
      materialNesting: {
        mdo: { sheets: mdoSheets, w: mat.w, l: mat.l, name: mat.name, unplaced: mdoNest.unplaced },
        hdpe: { sheets: hdpeSheets, w: hdpeSheet.w, l: hdpeSheet.l, name: hdpeSheet.name, unplaced: hdpeNest.unplaced },
        obo: { sheets: oboSheets, w: oboSheet.w, l: oboSheet.l, name: oboSheet.name, unplaced: oboNest.unplaced }
      },
      // Backwards compat
      nestedSheets: mdoSheets,
      unplaced: allUnplaced,
      sheetW: mat.w,
      sheetL: mat.l,
      quantity: qty,
      warnings: warnings,
      dimensions: {
        overall: { o1: o1, o2: o2, oh: oh },
        interior: { i1: i1, i2: i2, ih: ih },
        panel: { pw: pw, pl: pl }
      }
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  return {
    // Calculation functions
    calcSheet: calcSheet,
    calcPlatform: calcPlatform,
    calcCase: calcCase,
    
    // Helpers
    ribPlan: ribPlan,
    calcSkinPanels: calcSkinPanels,
    multiplyParts: multiplyParts,
    fitOrSplit: fitOrSplit,
    allowsSeams: allowsSeams
  };

})();
