import React from 'react';
import { 
  Plus, 
  Copy, 
  Edit3, 
  Trash2, 
  Smartphone, 
  BatteryCharging, 
  Camera, 
  Volume2, 
  Zap, 
  Layers, 
  Package,
  Eye,
  Building2,
  Store,
  Tag
} from 'lucide-react';

// Title case formatter preserving hardware acronyms
const formatTitleCase = (str) => {
  if (!str) return '';
  const acronyms = new Set(['IP', 'IPHONE', 'PRO', 'MAX', 'PLUS', 'MINI', 'OLED', 'LCD', 'IC', 'WS', '5G', '4G', 'SE', 'AS', 'OG', 'CC', 'AMOLED', 'TFT']);
  return str.replace(/\b[A-Za-z0-9-]+\b/g, (word) => {
    const upper = word.toUpperCase();
    if (acronyms.has(upper)) return upper;
    if (upper.startsWith('IP') && upper.length > 2 && /\d/.test(upper)) return upper;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

// Margin calculation helper
const calculateMargin = (salePrice, purchasePrice) => {
  const sale = Number(salePrice || 0);
  const cost = Number(purchasePrice || 0);
  if (sale <= 0 || cost <= 0) return null;
  const profit = sale - cost;
  const marginPct = ((profit / sale) * 100).toFixed(1);
  return {
    profit,
    marginPct,
    isProfit: profit > 0,
    isNeutral: profit === 0,
    isLoss: profit < 0,
  };
};

// Brand cleaner
const cleanBrandName = (brand) => {
  const b = String(brand || '').trim();
  if (!b || b.toLowerCase() === 'generic' || b.toLowerCase() === 'no brand') return 'Generic';
  if (b.toLowerCase() === 'app' || b.toUpperCase() === 'APP') return 'Apple';
  return b;
};

// Non-redundant compatibility text
const getCleanCompatibility = (item) => {
  const full = String(item.full_model_list || item.compatible_models || '').trim();
  const short = String(item.short_name || '').trim();
  const name = String(item.name || '').trim();
  if (!full) return null;
  if (full.toLowerCase() === short.toLowerCase() || full.toLowerCase() === name.toLowerCase()) return null;
  return full;
};

// Category icon selector
const getCategoryIcon = (category = '') => {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('display') || cat.includes('screen') || cat.includes('combo') || cat.includes('touch') || cat.includes('folder') || cat.includes('oled') || cat.includes('lcd')) {
    return Smartphone;
  }
  if (cat.includes('battery') || cat.includes('cell') || cat.includes('power')) {
    return BatteryCharging;
  }
  if (cat.includes('camera') || cat.includes('lens') || cat.includes('cam')) {
    return Camera;
  }
  if (cat.includes('speaker') || cat.includes('ringer') || cat.includes('mic') || cat.includes('audio')) {
    return Volume2;
  }
  if (cat.includes('charging') || cat.includes('charge') || cat.includes('port') || cat.includes('flex')) {
    return Zap;
  }
  if (cat.includes('housing') || cat.includes('glass') || cat.includes('back glass') || cat.includes('frame')) {
    return Layers;
  }
  return Package;
};

/**
 * Modern High-Density SaaS Stock Item Card
 * Unclamped, full detail layout for whole-card visibility on both mobile & desktop
 */
const StockCardItem = React.memo(function StockCardItem({
  item,
  data = {},
  role,
  productName = (it) => it.short_name || it.name || 'Product',
  priceLabel = (price) => price !== null && price !== undefined ? `₹${Number(price).toLocaleString('en-IN')}` : '—',
  onCloneProduct,
  onEditProduct,
  handleDeleteProductConfirm,
  setForms,
  setColorSplitQuantities,
  setIsSetStockOpen,
  setIsAddProductOpen,
  setEditingProductId,
  showCost = false,
  onViewDetails,
}) {
  const shopThreshold = data.shops?.find((s) => s.id === item.shop_id)?.low_stock_threshold || 4;
  const isLowStock = item.quantity > 0 && item.quantity <= shopThreshold;
  const isOutOfStock = Number(item.quantity) === 0;
  const retailPrice = item.retail_price ?? item.sale_price ?? item.official_price;
  const wholesalePrice = item.wholesale_price;
  const hasRetailPrice = retailPrice !== null && retailPrice !== undefined && retailPrice !== '';
  const hasWholesalePrice = wholesalePrice !== null && wholesalePrice !== undefined && wholesalePrice !== '';
  const hasSalePrice = item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== '';
  const hasPurchasePrice = item.purchase_price !== null && item.purchase_price !== undefined && item.purchase_price !== '';
  const marginInfo = calculateMargin(retailPrice || item.sale_price, item.purchase_price);
  const cleanBrand = cleanBrandName(item.brand);
  const compatText = getCleanCompatibility(item);
  const displayName = productName(item);
  const CategoryIcon = getCategoryIcon(item.part_category || item.category);

  // Quick Stock Action
  const handleAddStock = (e) => {
    e?.stopPropagation();
    if (setForms) {
      const prod = (data.products || []).find((p) => String(p.id) === String(item.product_id)) || item;
      setForms((prev) => ({
        ...prev,
        stock: {
          product_id: String(item.product_id),
          quantity: '',
          colour: '',
          purchase_price: prod?.purchase_price !== undefined && prod?.purchase_price !== null 
            ? String(prod.purchase_price) 
            : (prod?.avg_cost_price !== undefined && prod?.avg_cost_price !== null ? String(prod.avg_cost_price) : ''),
          sale_price: prod?.sale_price !== undefined && prod?.sale_price !== null 
            ? String(prod.sale_price) 
            : (prod?.retail_price !== undefined && prod?.retail_price !== null ? String(prod.retail_price) : ''),
          retail_price: prod?.retail_price !== undefined && prod?.retail_price !== null 
            ? String(prod.retail_price) 
            : (prod?.sale_price !== undefined && prod?.sale_price !== null ? String(prod.sale_price) : ''),
          supplier_id: prod?.supplier_id ? String(prod.supplier_id) : (item?.supplier_id ? String(item.supplier_id) : ''),
        },
      }));
    }
    if (setColorSplitQuantities) setColorSplitQuantities({});
    if (setIsSetStockOpen) setIsSetStockOpen(true);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  // Duplicate / Clone Action
  const handleClone = (e) => {
    e?.stopPropagation();
    if (onCloneProduct) {
      onCloneProduct(item);
    } else if (onEditProduct) {
      onEditProduct(item);
      if (setEditingProductId) setEditingProductId('');
    }
    if (setIsAddProductOpen) setIsAddProductOpen(true);
  };

  // Edit Action
  const handleEdit = (e) => {
    e?.stopPropagation();
    if (onEditProduct) onEditProduct(item);
    if (setIsAddProductOpen) setIsAddProductOpen(true);
  };

  // Delete Action
  const handleDelete = (e) => {
    e?.stopPropagation();
    if (handleDeleteProductConfirm) handleDeleteProductConfirm(item);
  };

  // View Details Modal Action
  const handleViewDetails = (e) => {
    e?.stopPropagation();
    if (onViewDetails) {
      const fullProd = (data.products || []).find((p) => String(p.id) === String(item.product_id || item.id)) || item;
      onViewDetails(fullProd);
    }
  };

  return (
    <div className="group relative bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-4 sm:p-4.5 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-3.5">
      {/* Upper Card Content */}
      <div className="space-y-3">
        {/* Header: Icon + Full Title + Pill Badges */}
        <div className="flex items-start gap-3 min-w-0">
          {/* Subtle tinted icon wrapper / thumbnail (tap to view details) */}
          <div 
            onClick={handleViewDetails}
            className="cursor-pointer shrink-0 mt-0.5"
            title="Click to view complete details"
          >
            {item.image_url ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-800 border border-slate-200/80 dark:border-zinc-700/50 flex items-center justify-center hover:opacity-90 transition-opacity">
                <img
                  src={item.image_url}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.parentElement?.querySelector('.icon-fallback');
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
                <div className="icon-fallback hidden w-full h-full flex items-center justify-center text-slate-500 dark:text-zinc-400">
                  <CategoryIcon className="w-6 h-6 text-teal-600" strokeWidth={1.8} />
                </div>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-zinc-800 border border-teal-100/80 dark:border-zinc-700/50 flex items-center justify-center text-teal-700 dark:text-teal-400 hover:scale-105 transition-transform">
                <CategoryIcon className="w-6 h-6" strokeWidth={1.8} />
              </div>
            )}
          </div>

          {/* Full Unclamped Title & Tag Badges */}
          <div className="flex-1 min-w-0">
            <h4
              onClick={handleViewDetails}
              className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-zinc-100 leading-snug cursor-pointer hover:text-teal-700 transition-colors break-words"
              title={`${displayName} - Click to view full details`}
            >
              {formatTitleCase(displayName)}
            </h4>

            {/* Pill Badges: Category, Brand, Quality, Mfg, Supplier */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-full bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200/60">
                {item.part_category || item.category || 'Display'}
              </span>
              {cleanBrand && (
                <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/60">
                  {cleanBrand}
                </span>
              )}
              {item.quality_variant && (
                <span className="px-2 py-0.5 text-[10.5px] font-extrabold rounded-full bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60">
                  {item.quality_variant}
                </span>
              )}
              {item.manufacturing_brand_name && (
                <span className="px-2 py-0.5 text-[10.5px] font-medium rounded-full bg-slate-50 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 border border-slate-200/60">
                  Mfg: {item.manufacturing_brand_name}
                </span>
              )}
              {item.supplier_name && (
                <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60">
                  📦 {item.supplier_name}
                </span>
              )}
              {item.shop_name && !data?.warehouse?.id && (
                <span className="px-2 py-0.5 text-[10.5px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200/60">
                  📍 {item.shop_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Compatibility Box: Full visible text (No line clamp!) */}
        {compatText && (
          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/70 dark:border-zinc-700/60 text-xs">
            <span className="font-black text-slate-400 dark:text-zinc-400 uppercase tracking-wider text-[10px] block mb-0.5">
              Compatible Models:
            </span>
            <span className="font-semibold text-slate-700 dark:text-zinc-200 leading-relaxed break-words">
              {compatText}
            </span>
          </div>
        )}

        {/* Variant / Colour Stock Chips */}
        {item.colour_stock && Object.keys(item.colour_stock).length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-black text-slate-400 dark:text-zinc-500 tracking-wider block">
              Color Breakdown:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(item.colour_stock).map(([colName, colQty]) => (
                <span
                  key={colName}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      Number(colQty) > 0 ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-rose-400'
                    }`}
                  />
                  <span>{colName}:</span>
                  <span className="font-extrabold text-slate-900 dark:text-zinc-100">{colQty}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Location Stock Breakdown: Warehouse vs Shop Assigned */}
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-teal-50/40 dark:bg-zinc-800/40 border border-teal-100/80 dark:border-zinc-700/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 flex items-center justify-center shrink-0">
              <Building2 size={14} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-400 block leading-tight">
                {role === 'shopkeeper' ? 'Branch Stock' : 'Warehouse'}
              </span>
              <strong className="text-xs sm:text-sm font-black text-slate-800 dark:text-zinc-100">
                {item.owner_quantity !== undefined && item.owner_quantity !== null ? item.owner_quantity : item.quantity || 0} pcs
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 flex items-center justify-center shrink-0">
              <Store size={14} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-400 block leading-tight">
                {role === 'shopkeeper' ? 'My Assigned' : 'Shop Assigned'}
              </span>
              <strong className="text-xs sm:text-sm font-black text-slate-800 dark:text-zinc-100">
                {role === 'shopkeeper' ? (item.my_quantity || 0) : (item.shopkeeper_quantity || 0)} pcs
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Lower Card Section: Full Pricing, Status & Action Footer */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
        {/* Full Price Row & Stock Status Badge */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-black text-slate-400 dark:text-zinc-500 tracking-wider block leading-none mb-1.5">
              Pricing Structure
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 uppercase border border-indigo-200/50">W/S</span>
                <span className="font-mono text-sm font-black text-indigo-700 dark:text-indigo-300 tracking-tight">
                  {hasWholesalePrice ? priceLabel(wholesalePrice) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[8.5px] font-bold rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 uppercase border border-slate-200/50">Ret</span>
                <span className="font-mono text-xs font-bold text-slate-700 dark:text-zinc-300 tracking-tight">
                  {hasRetailPrice ? priceLabel(retailPrice) : hasSalePrice ? priceLabel(item.sale_price) : '—'}
                </span>
              </div>
              {/* Cost & Margin (Shown when showCost is active or admin role) */}
              {(showCost || role === 'superadmin' || role === 'owner') && hasPurchasePrice && (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="px-1.5 py-0.5 text-[8.5px] font-bold rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 uppercase border border-amber-200/50">Cost</span>
                  <span className="font-mono text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    {priceLabel(item.purchase_price)}
                  </span>
                  {marginInfo && (
                    <span
                      className={`text-[9.5px] font-black px-1.5 py-0.2 rounded ${
                        marginInfo.isProfit
                          ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                          : marginInfo.isLoss
                          ? 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40'
                          : 'text-slate-600 bg-slate-100 dark:text-zinc-400'
                      }`}
                    >
                      {marginInfo.isProfit ? `+${marginInfo.marginPct}%` : `${marginInfo.marginPct}%`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-black text-slate-400 dark:text-zinc-500 tracking-wider block leading-none mb-1.5">
              Total Live Stock
            </span>
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Out of Stock
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Low: {item.quantity} pcs
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {item.quantity} pcs
              </span>
            )}
          </div>
        </div>

        {/* Action Footer: Clear button row with prominent "+ Stock" and Icon Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-zinc-800/80">
          {/* Left: Compact "+ Stock" Button */}
          <button
            type="button"
            onClick={handleAddStock}
            className="h-8.5 px-3.5 text-xs font-black rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>+ Stock</span>
          </button>

          {/* Right: Action Buttons Group (Always visible on mobile & desktop) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="View Complete Details"
              onClick={handleViewDetails}
              className="h-8.5 w-8.5 rounded-xl flex items-center justify-center text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 dark:text-teal-300 dark:bg-teal-950/40 transition-colors cursor-pointer active:scale-95 shadow-2xs"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Duplicate / Clone"
              onClick={handleClone}
              className="h-8.5 w-8.5 rounded-xl flex items-center justify-center text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 dark:text-zinc-300 dark:bg-zinc-800 transition-colors cursor-pointer active:scale-95 shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Edit Product"
              onClick={handleEdit}
              className="h-8.5 w-8.5 rounded-xl flex items-center justify-center text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 dark:text-zinc-300 dark:bg-zinc-800 transition-colors cursor-pointer active:scale-95 shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            {(role === 'superadmin' || role === 'shopkeeper' || role === 'admin') && (
              <button
                type="button"
                title="Delete Product"
                onClick={handleDelete}
                className="h-8.5 w-8.5 rounded-xl flex items-center justify-center text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 dark:text-rose-400 dark:bg-rose-950/40 transition-colors cursor-pointer active:scale-95 shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default StockCardItem;
