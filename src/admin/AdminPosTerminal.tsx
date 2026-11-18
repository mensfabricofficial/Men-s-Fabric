import React, { useState, useEffect } from 'react';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  Receipt,
  CreditCard,
  Banknote,
  User,
  X,
} from 'lucide-react';
import { Product, OrderItem, PaymentMethod, Order } from '../types';
import { productService } from '../services/productService';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';
import { printElementById } from '../lib/printHelper';
import { BrandLogo } from '../components/common/BrandLogo';
import { formatDateTime } from '../lib/dateFormat';

interface PosCartLine extends OrderItem {
  availableStock: number;
}

export const AdminPosTerminal: React.FC = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>(() => productService.getLocalProducts());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Active POS Cart
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Variant selector modal
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);
  const [chosenSize, setChosenSize] = useState('');
  const [chosenColor, setChosenColor] = useState('');

  // Completed POS Receipt Modal
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  useEffect(() => {
    const unsub = productService.subscribeToAllProductsAdmin((prods) => {
      setProducts(prods);
    });
    return () => unsub();
  }, []);

  const categories = Array.from(new Set(products.map((p) => p.categoryName || p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    if (p.active === false) return false;
    const cat = p.categoryName || p.category;
    if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
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

  const addLineToCart = (prod: Product, size: string, color: string) => {
    const unitPrice = prod.salePrice && prod.salePrice > 0 ? prod.salePrice : prod.price;
    const stock = typeof prod.totalStock === 'number' ? prod.totalStock : 0;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (c) => c.productId === prod.id && c.size === size && c.color === color
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        const nextQty = next[existingIdx].quantity + 1;
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: nextQty,
          totalPrice: nextQty * unitPrice,
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          productImage: prod.thumbnail || prod.images?.[0] || '',
          size,
          color,
          quantity: 1,
          unitPrice,
          ...(typeof prod.costPrice === 'number' && prod.costPrice > 0 ? { unitCost: prod.costPrice } : {}),
          totalPrice: unitPrice,
          sku: prod.sku,
          availableStock: stock,
        },
      ];
    });
    setErrorMsg('');
  };

  const handleProductTileClick = (prod: Product) => {
    const sizes = prod.sizes?.length ? prod.sizes : ['Standard'];
    const colors = prod.colors?.length ? prod.colors.map((c) => c.name) : ['Standard'];

    if (sizes.length === 1 && colors.length === 1) {
      addLineToCart(prod, sizes[0], colors[0]);
      return;
    }
    setChosenSize(sizes[0]);
    setChosenColor(colors[0]);
    setVariantModalProduct(prod);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((line, i) => {
          if (i !== idx) return line;
          const nextQty = line.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...line,
            quantity: nextQty,
            totalPrice: nextQty * line.unitPrice,
          };
        })
        .filter(Boolean) as PosCartLine[]
    );
  };

  const subtotal = cart.reduce((sum, l) => sum + l.totalPrice, 0);
  const safeDiscount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const grandTotal = Math.max(0, subtotal - safeDiscount);

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Please select at least one product first.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const cashierName = currentUser?.displayName || currentUser?.email || 'POS Counter';
      const res = await orderService.createPosOrder({
        customerName,
        customerPhone,
        items: cart.map(({ availableStock: _a, ...rest }) => rest),
        subtotal,
        discount: safeDiscount,
        total: grandTotal,
        paymentMethod,
        cashierName,
        notes,
      });

      if (!res.success || !res.order) {
        setErrorMsg(res.error || 'Failed to complete POS sale.');
        return;
      }

      if (currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'POS_SALE',
            res.order.orderNumber,
            `POS counter sale ৳${grandTotal} (${paymentMethod.toUpperCase()})`
          )
          .catch(() => {});
      }

      setCompletedOrder(res.order);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDiscount(0);
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            POS Counter Terminal
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Create instant in-store sales, automatically deduct inventory, and print 80mm thermal receipts.
          </p>
        </div>
        <div className="text-xs font-mono text-neutral-500 tabular-nums">
          Catalog Ready: <b className="text-neutral-900">{products.length}</b> items
        </div>
      </div>

      {/* Split POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT: Product Selector Grid */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white border border-neutral-200 rounded-xl p-4 space-y-4">
          {/* Search & Category Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product name or SKU code..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black font-semibold cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Grid */}
          {filteredProducts.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-500">
              <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="font-semibold text-neutral-800">No matching active products</p>
              <p className="text-neutral-400 mt-0.5">Try clearing your search or adding inventory first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[68vh] overflow-y-auto pr-1">
              {filteredProducts.map((prod) => {
                const effectivePrice = prod.salePrice && prod.salePrice > 0 ? prod.salePrice : prod.price;
                const outOfStock = (prod.totalStock || 0) <= 0;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleProductTileClick(prod)}
                    className={`text-left border rounded-lg overflow-hidden transition-all cursor-pointer flex flex-col justify-between bg-white ${
                      outOfStock
                        ? 'border-neutral-200 opacity-60 hover:border-neutral-400'
                        : 'border-neutral-200 hover:border-black'
                    }`}
                  >
                    <div className="aspect-square bg-neutral-100 relative overflow-hidden">
                      <img
                        src={prod.thumbnail || prod.images?.[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2.5 space-y-1">
                      <p className="text-[10px] font-mono text-neutral-400 truncate">{prod.sku || 'NO-SKU'}</p>
                      <p className="text-xs font-semibold text-neutral-900 line-clamp-1">{prod.name}</p>
                      <div className="flex items-center justify-between pt-0.5 tabular-nums">
                        <span className="text-xs font-bold font-mono text-neutral-900">
                          ৳{effectivePrice.toLocaleString('en-BD')}
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            outOfStock ? 'text-red-600' : 'text-neutral-500'
                          }`}
                        >
                          Stock: {prod.totalStock ?? 0}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Active POS Ticket */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-neutral-900" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Current POS Bill
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
              >
                Clear Bill
              </button>
            )}
          </div>

          {/* Walk-in Customer Fields */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                Customer Name
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  className="w-full pl-8 pr-2.5 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                Phone (Optional)
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full px-2.5 py-2 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {/* Cart Items */}
          <div className="border-t border-b border-neutral-100 py-3 max-h-[260px] overflow-y-auto space-y-2.5">
            {cart.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-6">
                Tap products on the left to add them to this POS receipt.
              </p>
            ) : (
              cart.map((line, idx) => (
                <div key={`${line.productId}-${line.size}-${line.color}`} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-900 truncate">{line.productName}</p>
                    <p className="text-[11px] text-neutral-500 tabular-nums">
                      {line.size} · {line.color} · ৳{line.unitPrice.toLocaleString('en-BD')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(idx, -1)}
                      className="w-6 h-6 border border-neutral-200 rounded flex items-center justify-center hover:border-black cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-mono font-bold tabular-nums">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(idx, 1)}
                      className="w-6 h-6 border border-neutral-200 rounded flex items-center justify-center hover:border-black cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-16 text-right font-mono font-bold tabular-nums text-neutral-900">
                      ৳{line.totalPrice.toLocaleString('en-BD')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method & Discount */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                {[
                  { id: 'cod', label: 'Cash' },
                  { id: 'bkash', label: 'bKash' },
                  { id: 'nagad', label: 'Nagad' },
                  { id: 'rocket', label: 'Rocket' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                    className={`py-2 rounded-lg border transition-colors cursor-pointer ${
                      paymentMethod === m.id
                        ? 'bg-black text-white border-black'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-black'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                  Discount (৳)
                </label>
                <input
                  type="number"
                  min={0}
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-2.5 py-2 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                  Counter Note
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note"
                  className="w-full px-2.5 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="pt-3 border-t border-neutral-200 space-y-1.5 text-xs tabular-nums">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal ({cart.reduce((s, l) => s + l.quantity, 0)} pcs)</span>
              <span className="font-mono">৳{subtotal.toLocaleString('en-BD')}</span>
            </div>
            {safeDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Counter Discount</span>
                <span className="font-mono">-৳{safeDiscount.toLocaleString('en-BD')}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-neutral-900 pt-1">
              <span>Grand Total</span>
              <span className="font-mono">৳{grandTotal.toLocaleString('en-BD')}</span>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
          )}

          <button
            type="button"
            disabled={submitting || cart.length === 0}
            onClick={handleCompleteSale}
            className="w-full py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {paymentMethod === 'cod' ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
            <span>{submitting ? 'Processing Sale...' : `Complete POS Sale · ৳${grandTotal.toLocaleString('en-BD')}`}</span>
          </button>
        </div>
      </div>

      {/* Variant Picker Modal */}
      {variantModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">{variantModalProduct.name}</h3>
                <p className="text-xs font-mono text-neutral-500">
                  ৳{(variantModalProduct.salePrice || variantModalProduct.price).toLocaleString('en-BD')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVariantModalProduct(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">
                Size
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(variantModalProduct.sizes?.length ? variantModalProduct.sizes : ['Standard']).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setChosenSize(sz)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                      chosenSize === sz ? 'bg-black text-white border-black' : 'bg-white text-neutral-800 border-neutral-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(variantModalProduct.colors?.length
                  ? variantModalProduct.colors.map((c) => c.name)
                  : ['Standard']
                ).map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setChosenColor(col)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                      chosenColor === col ? 'bg-black text-white border-black' : 'bg-white text-neutral-800 border-neutral-200'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                addLineToCart(variantModalProduct, chosenSize || 'Standard', chosenColor || 'Standard');
                setVariantModalProduct(null);
              }}
              className="w-full py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer"
            >
              Add to POS Bill
            </button>
          </div>
        </div>
      )}

      {/* Printable 80mm POS Receipt Modal */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">POS Sale Completed</h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletedOrder(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              id="printable-pos-receipt"
              className="max-w-[320px] mx-auto bg-white p-4 border border-dashed border-neutral-300 font-mono text-[11px] text-neutral-900 space-y-2.5"
            >
              <div className="text-center pb-2 border-b border-dashed border-neutral-400 space-y-1">
                <BrandLogo variant="dark" imgClassName="h-6 mx-auto" />
                <p className="text-[10px] text-neutral-600">POS Counter Receipt</p>
              </div>
              <div className="space-y-0.5 text-[10px] pb-2 border-b border-dashed border-neutral-400">
                <div className="flex justify-between">
                  <span>RECEIPT:</span>
                  <span className="font-bold">{completedOrder.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{formatDateTime(completedOrder.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CUSTOMER:</span>
                  <span>{completedOrder.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAYMENT:</span>
                  <span className="uppercase font-bold">
                    {completedOrder.paymentMethod === 'cod' ? 'CASH' : completedOrder.paymentMethod} (PAID)
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 pb-2 border-b border-dashed border-neutral-400">
                {completedOrder.items.map((it, i) => (
                  <div key={i}>
                    <p className="font-bold">{it.productName}</p>
                    <div className="flex justify-between text-[10px] text-neutral-700">
                      <span>{it.size} / {it.color}</span>
                      <span>{it.quantity} x ৳{it.unitPrice} = ৳{it.totalPrice}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>৳{completedOrder.subtotal.toLocaleString('en-BD')}</span>
                </div>
                {completedOrder.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-৳{completedOrder.discount.toLocaleString('en-BD')}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-xs pt-1 border-t border-neutral-300">
                  <span>TOTAL PAID:</span>
                  <span>৳{completedOrder.total.toLocaleString('en-BD')}</span>
                </div>
              </div>
              <p className="text-center text-[10px] text-neutral-500 pt-2">Thank you for shopping with Selvee!</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => printElementById('printable-pos-receipt', completedOrder.orderNumber)}
                className="flex-1 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print 80mm Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedOrder(null)}
                className="px-4 py-2.5 border border-neutral-300 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg hover:border-black cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
