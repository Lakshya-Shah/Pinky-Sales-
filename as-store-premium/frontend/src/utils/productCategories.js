/**
 * Unified Category Classification System
 * Single Source of Truth for Product Categorization Across the App
 */

// Helper to extract normalized category & name strings
function getProductMeta(product) {
  const cat = String(product?.part_category || product?.part_category_name || product?.category || '').trim().toLowerCase();
  const name = String(product?.short_name || product?.name || '').trim().toLowerCase();
  return { cat, name };
}

/**
 * 1. TOOLS & EQUIPMENT
 * Workshop repair machines, screwdrivers, tweezers, soldering equipment, cutters, opening tools.
 */
export function isToolsProduct(product) {
  if (!product) return false;
  const { cat, name } = getProductMeta(product);

  // Explicit tool category
  if (
    cat === 'tools' ||
    cat === 'tool' ||
    cat === 'equipment' ||
    cat === 'tools & equipment' ||
    cat.includes('tool') ||
    cat.includes('blade') ||
    cat.includes('cutter') ||
    cat.includes('tweezer') ||
    cat.includes('machine') ||
    cat.includes('soldering') ||
    cat.includes('screw') ||
    cat.includes('opening') ||
    cat.includes('equipment') ||
    cat.includes('cleaning') ||
    cat.includes('solvent') ||
    cat.includes('stencil')
  ) {
    return true;
  }

  // Tool keywords in product name
  if (
    name.includes('screw') ||
    name.includes('tweezer') ||
    name.includes('opener') ||
    name.includes('opening tool') ||
    name.includes('spudger') ||
    name.includes('pry tool') ||
    name.includes('suction cup') ||
    name.includes('soldering') ||
    name.includes('solder wire') ||
    name.includes('solder paste') ||
    name.includes('solder iron') ||
    name.includes('desoldering') ||
    name.includes('hot air') ||
    name.includes('heat gun') ||
    name.includes('bga stencil') ||
    name.includes('rework station') ||
    name.includes('dc power supply') ||
    name.includes('boot cable') ||
    name.includes('microscope') ||
    name.includes('multimeter') ||
    name.includes('separator machine') ||
    name.includes('laminating machine') ||
    name.includes('bubble remover') ||
    name.includes('glue remover') ||
    name.includes('oca remover') ||
    name.includes('battery activator') ||
    name.includes('battery booster') ||
    name.includes('battery tester')
  ) {
    return true;
  }

  return false;
}

/**
 * 2. BATTERIES
 * Mobile phone batteries, high capacity cells, replacement batteries.
 * Excludes battery repair tools and flex cables.
 */
export function isBatteryProduct(product) {
  if (!product) return false;
  // Tools always take precedence
  if (isToolsProduct(product)) return false;

  const { cat, name } = getProductMeta(product);

  // Exclude battery connector flex / spares
  if (name.includes('connector flex') || name.includes('fpc') || cat.includes('flex')) {
    return false;
  }

  if (
    cat === 'battery' ||
    cat === 'batteries' ||
    cat.includes('battery') ||
    cat.includes('batt')
  ) {
    return true;
  }

  if (
    name.includes('battery') ||
    name.includes('batt.') ||
    name.includes('batt ') ||
    name.endsWith('batt') ||
    /\bbt\b/i.test(name) ||
    /bt\s*\(/i.test(name) ||
    /bt\s*$/i.test(name) ||
    /bt\s*-\s*/i.test(name)
  ) {
    return true;
  }

  return false;
}

/**
 * 3. DISPLAY / COMBO / FOLDER / SCREEN
 * Mobile screen folders, combos, LCDs, OLEDs, TFTs, Incell assemblies.
 * Must be checked BEFORE pure OCA glass to ensure combo screens are never misclassified as OCA glass.
 */
export function isDisplayProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product)) return false;

  const { cat, name } = getProductMeta(product);

  // Explicit Display Category
  if (
    cat === 'display' ||
    cat.includes('display') ||
    cat.includes('combo') ||
    cat.includes('folder') ||
    cat.includes('screen') ||
    cat.includes('lcd') ||
    cat.includes('oled') ||
    cat.includes('tft') ||
    cat.includes('incell') ||
    cat.includes('in-cell')
  ) {
    // If it's specifically "Touch Plate" or "OCA Glass", handled by OCA
    if (cat.includes('touch plate') || cat.includes('oca')) return false;
    return true;
  }

  // Name indicates complete screen assembly
  if (
    name.includes('combo') ||
    name.includes('folder') ||
    name.includes('incell') ||
    name.includes('in-cell') ||
    name.includes('oled') ||
    name.includes('tft') ||
    name.includes('lcd screen') ||
    name.includes('display with') ||
    name.includes('screen assembly') ||
    (name.includes('display') && !name.includes('display glass') && !name.includes('touch'))
  ) {
    return true;
  }

  return false;
}

/**
 * 4. OCA GLASS & TOUCH PLATE
 * Pure OCA sheets, outer front glass, touch digitizers, touch plates.
 * STRICTLY EXCLUDES:
 * - Complete screen assemblies (combos, folders, lcd, oled, incell)
 * - Back glass / Rear glass (housing/spare)
 * - Camera glass / Lens (camera/spare)
 * - Workshop tools & machines (glass separators, cutters, oca removers)
 * - Tempered glass / Screen protectors
 */
export function isOcaGlassProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product)) return false;

  const { cat, name } = getProductMeta(product);

  // Exclude spares that happen to contain "glass"
  if (
    cat.includes('back glass') ||
    cat.includes('housing') ||
    cat.includes('camera') ||
    name.includes('back glass') ||
    name.includes('rear glass') ||
    name.includes('camera glass') ||
    name.includes('camera lens') ||
    name.includes('tempered') ||
    name.includes('screen guard') ||
    name.includes('screen protector') ||
    name.includes('uv glass')
  ) {
    return false;
  }

  // OCA and Touch Plate categories
  if (
    cat.includes('oca') ||
    cat.includes('touch plate') ||
    cat.includes('touch panel') ||
    cat === 'oca glass' ||
    cat === 'oca glass & touch' ||
    cat === 'touch' ||
    cat === 'outer glass' ||
    cat === 'front glass'
  ) {
    return true;
  }

  // OCA and Touch Plate names
  if (
    name.includes('oca') ||
    name.includes('touch plate') ||
    name.includes('touch panel') ||
    name.includes('outer glass') ||
    name.includes('front glass') ||
    name.includes(' tp ') ||
    name.endsWith(' tp') ||
    /tp\s*\(/i.test(name) ||
    /\(tp\)/i.test(name) ||
    name.includes('digitizer')
  ) {
    return true;
  }

  // Plain "glass" in category or name (when NOT display, tool, back glass, camera glass)
  if (
    (cat.includes('glass') && !cat.includes('back glass')) ||
    (name.includes('glass') && !name.includes('back glass') && !name.includes('camera') && !name.includes('combo') && !name.includes('folder') && !name.includes('display'))
  ) {
    return true;
  }

  return false;
}

/**
 * 5. HARDWARE SPARES & SUB-CATEGORIES
 */
export function isCameraProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product) || isOcaGlassProduct(product)) return false;
  const { cat, name } = getProductMeta(product);
  return cat.includes('camera') || 
         name.includes('camera') || 
         name.includes('cam glass') || 
         name.includes('camera glass') || 
         name.includes('cam lens');
}

export function isSpeakerProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product) || isOcaGlassProduct(product)) return false;
  const { cat, name } = getProductMeta(product);
  return cat.includes('speaker') || 
         cat.includes('ringer') || 
         cat.includes('buzzer') || 
         cat.includes('earpiece') || 
         cat.includes('mic') || 
         name.includes('speaker') || 
         name.includes('ringer') || 
         name.includes('buzzer') || 
         name.includes('earpiece') || 
         name.includes('mic');
}

export function isChargingProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product) || isOcaGlassProduct(product)) return false;
  const { cat, name } = getProductMeta(product);
  return cat.includes('charging') || 
         cat.includes('sub board') || 
         cat.includes('cc board') || 
         name.includes('charging') || 
         name.includes('cc board') || 
         name.includes('sub board') || 
         name.includes('charging flex') || 
         name.includes('charging port');
}

export function isHousingProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product) || isOcaGlassProduct(product)) return false;
  const { cat, name } = getProductMeta(product);
  return cat.includes('housing') || 
         cat.includes('body') || 
         cat.includes('middle') || 
         cat.includes('back glass') || 
         cat.includes('frame') || 
         name.includes('housing') || 
         name.includes('back glass') || 
         name.includes('rear glass') || 
         name.includes('back cover') || 
         name.includes('middle frame');
}

export function isSparesProduct(product) {
  if (!product) return false;
  if (isToolsProduct(product) || isBatteryProduct(product) || isDisplayProduct(product) || isOcaGlassProduct(product)) return false;

  // Includes camera, speaker, charging, and housing sub-categories
  if (isCameraProduct(product) || isSpeakerProduct(product) || isChargingProduct(product) || isHousingProduct(product)) {
    return true;
  }

  const { cat, name } = getProductMeta(product);
  return cat.includes('spare') || 
         cat.includes('flex') || 
         cat.includes('ic') || 
         cat.includes('sim') || 
         cat.includes('button') || 
         cat.includes('pcb') || 
         cat.includes('vibrat') || 
         cat.includes('sensor') ||
         name.includes('flex') ||
         name.includes('ic') ||
         name.includes('sim tray') ||
         name.includes('button') ||
         name.includes('vibrator') ||
         name.includes('fingerprint');
}

/**
 * 6. OTHER CATEGORIES
 * Consumables, tempered glass, cables, chargers, cases, etc.
 */
export function isOtherCategoryProduct(product) {
  if (!product) return false;
  return !isToolsProduct(product) && 
         !isBatteryProduct(product) && 
         !isDisplayProduct(product) && 
         !isOcaGlassProduct(product) && 
         !isSparesProduct(product);
}

/**
 * General Category Matcher
 */
export function isProductMatchingCategory(product, catId) {
  if (!product) return false;
  if (!catId) return true;
  const lower = String(catId).toLowerCase().trim();

  if (lower === 'display') return isDisplayProduct(product);
  if (lower === 'battery' || lower === 'batteries') return isBatteryProduct(product);
  if (lower === 'ocaglass' || lower === 'oca-glass' || lower === 'oca glass' || lower === 'oca') return isOcaGlassProduct(product);
  if (lower === 'tools' || lower === 'tool') return isToolsProduct(product);
  if (lower === 'spares' || lower === 'spare') return isSparesProduct(product);
  if (lower === 'camera') return isCameraProduct(product);
  if (lower === 'speaker') return isSpeakerProduct(product);
  if (lower === 'charging port' || lower === 'charging') return isChargingProduct(product);
  if (lower === 'housing') return isHousingProduct(product);
  if (lower === 'other-category' || lower === 'other') return isOtherCategoryProduct(product);

  const { cat } = getProductMeta(product);
  return cat.includes(lower);
}
