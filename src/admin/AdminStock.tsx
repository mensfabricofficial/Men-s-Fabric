import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  AlertTriangle,
  Sliders,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Product, Category, StockMovementEntry, SalesTargetsConfig } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { posService } from '../services/posService';
import { useAuth } from '../context/AuthContext';
import { computeStockAudit } from '../lib/accountingUtils';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

export const AdminStock: React.FC = () => {
  const { currentUser, staffProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [categories, setCategories] = useState<Category[]>(() => productService.getInstantCategories() ?? []);
  const [movements, setMovements] = useState<StockMovementEntry[]>(() =>
    productService.getInstantStockMovements()
  );
  const [targets, setTargets] = useState<SalesTargetsConfig>(() => posService.getInstantTargets());
  const [loading, setLoading] = useState(() => productService.getInstantAllProducts().length === 0);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [viewMode, setViewMode] = useState<'inventory' | 'history'>('inventory');

  const [thresholdDraft, setThresholdDraft] = useState<number>(
    () => posService.getInstantTargets().lowStockThresholdDefault || 5
  );
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Quick Stock Adjustment Modal
  const [quickStockProduct, setQuickStockProduct] = useState<Product | null>(null);
  const [quickStockMode, setQuickStockMode] = useState<'set' | 'add' | 'damaged'>('set');
  const [quickStockValue, setQuickStockValue] = useState<number>(0);
  const [quickStockReason, setQuickStockReason] = useState('');
  const [quickStockSaving, setQuickStockSaving] = useState(false);

  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubProducts = productService.subscribeToAllProductsAdmin(
      (prods) => {
        setProducts(prods);
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsubCats = productService.subscribeToCategories(setCategories);
    const unsubMovements = productService.subscribeToStockMovements(setMovements);
    const unsubTargets = posService.subscribeToTargets((t) => {
      setTargets(t);
      setThresholdDraft(t.lowStockThresholdDefault || 5);
    });

    return () => {
      unsubProducts();
      unsubCats();
      unsubMovements();
      unsubTargets();
    };
  }, []);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3200);
  };

  const handleOpenQuickStock = (prod: Product) => {
    setQuickStockProduct(prod);
    setQuickStockMode('set');
    setQuickStockValue(prod.totalStock || 0);
    setQuickStockReason('');
  };

  const handleSaveQuickStock = async () => {
    if (!quickStockProduct) return;
    setQuickStockSaving(true);
    const actor = staffProfile?.name || currentUser?.email || 'Admin';
    const prevStock = quickStockProduct.totalStock || 0;
    try {
      const updatedProd = await productService.adjustProductStockWithMovement({
        productId: quickStockProduct.id,
        mode: quickStockMode,
        quantity: quickStockValue,
        reason: quickStockReason,
        staffName: actor,
      });
      const finalStock = updatedProd?.totalStock ?? quickStockValue;
      if (currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            quickStockMode === 'damaged' ? 'DAMAGED_STOCK_WRITE_OFF' : 'UPDATE_STOCK',
            quickStockProduct.id,
            `Stock ${quickStockMode} to ${finalStock} units for ${quickStockProduct.name}`,
            {
              entityType: 'product_stock',
              beforeValue: `${prevStock} pcs`,
              afterValue: `${finalStock} pcs`,
            }
          )
          .catch(() => {});
      }
      if (updatedProd) {
        setProducts((prev) =>
          prev.map((p) => (p.id === quickStockProduct.id ? updatedProd : p))
        );
      }
      setQuickStockProduct(null);
      showToast(`Stock for "${quickStockProduct.name}" updated to ${finalStock} pcs.`);
    } catch (e: any) {
      showToast('Failed to update stock: ' + (e.message || 'Unknown error'));
    } finally {
      setQuickStockSaving(false);
    }
  };

  const handleSaveThreshold = async () => {
    setSavingThreshold(true);
    try {
      const next = await posService.saveTargets({
        ...targets,
        lowStockThresholdDefault: Math.max(1, Number(thresholdDraft) || 5),
      });
      setTargets(next);
      showToast(`Low stock alert threshold set to ${next.lowStockThresholdDefault} pcs.`);
    } finally {
      setSavingThreshold(false);
    }
  };

  const globalLowThreshold = Math.max(1, Number(targets.lowStockThresholdDefault) || 5);
  const stockAudit = computeStockAudit({
    products,
    purchases: [],
    orders: [],
    lowStockThreshold: globalLowThreshold,
  });

  const filteredProducts = products.filter((p) => {
    if (filterCat !== 'all' && p.category !== filterCat) return false;
    const stock = Math.max(0, Number(p.totalStock) || 0);
    const threshold =
      typeof p.minStock === 'number' && p.minStock > 0 ? p.minStock : globalLowThreshold;
    if (stockFilter === 'out' && stock > 0) return false;
    if (stockFilter === 'low' && (stock <= 0 || stock > threshold)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.fabric?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredMovements = movements.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.productName.toLowerCase().includes(q) ||
      m.sku?.toLowerCase().includes(q) ||
      m.reason?.toLowerCase().includes(q) ||
      m.referenceId?.toLowerCase().includes(q) ||
      m.staffName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Stock & Inventory Control"
        subtitle="Live inventory levels, stock value, alerts & movement logs"
      />

      {/* Stock Valuation & Alert Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Total Stock Qty
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            {stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs
          </p>
          <span className="text-[11px] text-neutral-400">
            {stockAudit.activeProducts} active products
          </span>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Stock Cost Value
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
          </p>
          <span className="text-[11px] text-neutral-400">Wholesale cost in hand</span>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Stock Selling Value
          </span>
          <p className="text-2xl font-black font-mono text-emerald-700 mt-1">
            ৳{stockAudit.stockSellingValue.toLocaleString('en-BD')}
          </p>
          <span className="text-[11px] text-neutral-400">Potential retail value</span>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Low &amp; Out of Stock
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-mono text-amber-700">
              {stockAudit.lowStockCount}
            </span>
            <span className="text-xs text-neutral-400">low ·</span>
            <span className="text-2xl font-black font-mono text-red-700">
              {stockAudit.outOfStockCount}
            </span>
            <span className="text-xs text-neutral-400">out</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-neutral-500">Min Alert ≤</span>
            <input
              type="number"
              min={1}
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 px-1.5 py-0.5 text-[11px] font-mono bg-neutral-50 border border-neutral-300 rounded text-center"
            />
            <button
              type="button"
              disabled={savingThreshold}
              onClick={handleSaveThreshold}
              className="px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded cursor-pointer hover:bg-neutral-800 disabled:opacity-40"
            >
              {savingThreshold ? '...' : 'Set'}
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switch + Search & Category Filter */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start shrink-0">
          <button
            type="button"
            onClick={() => {
              setViewMode('inventory');
              setStockFilter('all');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              viewMode === 'inventory' && stockFilter === 'all'
                ? 'bg-white text-black shadow-xs'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            All Stock ({products.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('inventory');
              setStockFilter('low');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
              viewMode === 'inventory' && stockFilter === 'low'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            <AlertTriangle className="w-3 h-3" /> Low Stock ({stockAudit.lowStockCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('inventory');
              setStockFilter('out');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              viewMode === 'inventory' && stockFilter === 'out'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-700 hover:bg-red-50'
            }`}
          >
            Out of Stock ({stockAudit.outOfStockCount})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('history')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
              viewMode === 'history'
                ? 'bg-black text-white shadow-xs'
                : 'text-neutral-600 hover:text-black'
            }`}
          >
            <History className="w-3 h-3" /> Movement Log ({movements.length})
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewMode === 'history'
                ? 'Search movements by product, SKU, reason, or staff...'
                : 'Search stock by product name or SKU...'
            }
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>

        {viewMode === 'inventory' && (
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black cursor-pointer font-semibold"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main Content */}
      {viewMode === 'history' ? (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          {filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-500">
              <History className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
              <p className="font-bold text-neutral-900">No stock movements logged yet</p>
              <p className="text-neutral-400 mt-0.5">
                Purchases, POS sales, Stage 3 order cuts, returns, and manual adjustments will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-3.5">Date &amp; Time</th>
                    <th className="p-3.5">Product &amp; SKU</th>
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5 text-right">Change</th>
                    <th className="p-3.5 text-right">Before → After</th>
                    <th className="p-3.5">Staff &amp; Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                        {formatDateTime(m.timestamp)}
                      </td>
                      <td className="p-3.5">
                        <p className="font-bold text-neutral-900">{m.productName}</p>
                        <p className="text-[10px] font-mono text-neutral-400">{m.sku || '—'}</p>
                      </td>
                      <td className="p-3.5 uppercase font-bold text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-neutral-800">
                          {m.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td
                        className={`p-3.5 text-right font-mono font-black ${
                          m.change >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {m.change >= 0 ? `+${m.change}` : m.change} pcs
                      </td>
                      <td className="p-3.5 text-right font-mono text-neutral-600">
                        {m.previousStock} → <b className="text-neutral-900">{m.newStock}</b>
                      </td>
                      <td className="p-3.5 text-neutral-600">
                        <b className="text-neutral-900">{m.staffName}</b>
                        {m.reason && <span className="block text-[11px] text-neutral-500">{m.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-8 text-center text-xs text-neutral-500">Loading stock inventory...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <Package className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-neutral-900">No products match this stock filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                  <tr>
                    <th className="p-3.5">Product</th>
                    <th className="p-3.5">SKU / Code</th>
                    <th className="p-3.5 text-right">Cost Price</th>
                    <th className="p-3.5 text-right">Selling Price</th>
                    <th className="p-3.5 text-right">Current Stock</th>
                    <th className="p-3.5 text-right">Min Limit</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Adjust</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                  {filteredProducts.map((prod) => {
                    const qty = Math.max(0, Number(prod.totalStock) || 0);
                    const minLim =
                      typeof prod.minStock === 'number' && prod.minStock > 0
                        ? prod.minStock
                        : globalLowThreshold;
                    const sellP =
                      prod.salePrice && prod.salePrice > 0 ? prod.salePrice : prod.price;
                    const isOut = qty === 0;
                    const isLow = qty > 0 && qty <= minLim;

                    return (
                      <tr key={prod.id} className="hover:bg-neutral-50/50">
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                prod.images?.[0] ||
                                prod.thumbnail ||
                                '/assets/aistudio/selvee1_8ff37f5b.jpg'
                              }
                              alt={prod.name}
                              className="w-10 h-10 rounded-md object-cover border border-neutral-200 shrink-0"
                            />
                            <div>
                              <p className="font-bold text-neutral-900">{prod.name}</p>
                              <p className="text-[10px] text-neutral-400">
                                Stock Value: ৳{((prod.costPrice || 0) * qty).toLocaleString('en-BD')}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-neutral-600">{prod.sku || '—'}</td>
                        <td className="p-3.5 text-right font-mono text-neutral-700">
                          {prod.costPrice ? `৳${prod.costPrice.toLocaleString('en-BD')}` : '—'}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                          ৳{sellP.toLocaleString('en-BD')}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-neutral-900">
                          {qty} pcs
                        </td>
                        <td className="p-3.5 text-right font-mono text-neutral-500">
                          {minLim} pcs
                        </td>
                        <td className="p-3.5">
                          {isOut ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800 border border-red-200">
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              Low Stock
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenQuickStock(prod)}
                            className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Adjust</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quick Stock Adjustment Modal */}
      {quickStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Adjust Stock — {quickStockProduct.name}
                </h3>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Current Stock: {quickStockProduct.totalStock || 0} pcs · SKU: {quickStockProduct.sku}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickStockProduct(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 bg-neutral-100 p-1 rounded-lg">
              {([
                { id: 'set', label: 'Set Exact' },
                { id: 'add', label: '+ Add Stock' },
                { id: 'damaged', label: 'Damaged (-)' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setQuickStockMode(m.id);
                    setQuickStockValue(m.id === 'set' ? quickStockProduct.totalStock || 0 : 1);
                  }}
                  className={`py-1.5 rounded-md font-bold cursor-pointer ${
                    quickStockMode === m.id
                      ? m.id === 'damaged'
                        ? 'bg-red-600 text-white'
                        : 'bg-black text-white'
                      : 'text-neutral-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                {quickStockMode === 'set'
                  ? 'New Total Quantity (Pcs)'
                  : quickStockMode === 'add'
                  ? 'Quantity to Add (Pcs)'
                  : 'Damaged / Write-Off Quantity (Pcs)'}
              </label>
              <input
                type="number"
                min={0}
                value={quickStockValue}
                onChange={(e) => setQuickStockValue(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                Reason / Note
              </label>
              <input
                type="text"
                value={quickStockReason}
                onChange={(e) => setQuickStockReason(e.target.value)}
                placeholder="e.g. Physical recount / New batch / Damaged piece"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setQuickStockProduct(null)}
                className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={quickStockSaving}
                onClick={handleSaveQuickStock}
                className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
              >
                {quickStockSaving ? 'Saving...' : 'Update Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}
    </div>
  );
};
