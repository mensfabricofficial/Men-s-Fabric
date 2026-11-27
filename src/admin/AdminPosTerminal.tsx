import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  Receipt,
  User,
  UserPlus,
  PauseCircle,
  Pause,
  Folder,
  PlayCircle,
  Truck,
  Tag,
  X,
} from 'lucide-react';
import {
  Product,
  OrderItem,
  PaymentMethod,
  Order,
  CustomerProfile,
  Coupon,
  DeliveryZone,
  HeldPosSale,
} from '../types';
import { productService } from '../services/productService';
import { orderService } from '../services/orderService';
import { settingsService } from '../services/settingsService';
import { posService } from '../services/posService';
import { getOrderPaidAndDue } from '../lib/accountingUtils';
import { useAuth } from '../context/AuthContext';
import { printElementById } from '../lib/printHelper';
import { ThermalPosReceipt } from '../components/common/ThermalPosReceipt';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

interface PosCartLine extends OrderItem {
  availableStock: number;
}

interface PosCustomerOption {
  uid: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  division?: string;
  district?: string;
  totalDue: number;
  orderCount: number;
  recentOrders: Order[];
}

export const AdminPosTerminal: React.FC = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [orders, setOrders] = useState<Order[]>(() => orderService.getInstantOrders());
  const [crmCustomers, setCrmCustomers] = useState<CustomerProfile[]>(() =>
    posService.getInstantCrmCustomers()
  );
  const [coupons, setCoupons] = useState<Coupon[]>(() => settingsService.getInstantCoupons());
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(() =>
    settingsService.getInstantDeliveryZones()
  );
  const [heldSales, setHeldSales] = useState<HeldPosSale[]>(() => posService.getInstantHeldSales());

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Active POS Cart
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [selectedCustomerUid, setSelectedCustomerUid] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);

  // Add New Customer Modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustFirstName, setNewCustFirstName] = useState('');
  const [newCustLastName, setNewCustLastName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustDivision, setNewCustDivision] = useState('Dhaka');
  const [newCustDistrict, setNewCustDistrict] = useState('Dhaka');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Discount & Coupon
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');

  // Delivery Options
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [deliveryZoneId, setDeliveryZoneId] = useState('dhaka');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryChargeInput, setDeliveryChargeInput] = useState<number>(70);

  // Payment & Partial Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [trxId, setTrxId] = useState('');
  const [senderNumber, setSenderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modals: Variant Picker, Held Sales, Cancel Sale, Completed Receipt
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);
  const [chosenSize, setChosenSize] = useState('');
  const [chosenColor, setChosenColor] = useState('');
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [activeBillTab, setActiveBillTab] = useState<'none' | 'discount' | 'coupon' | 'delivery' | 'note'>('none');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  useEffect(() => {
    const unsubProds = productService.subscribeToAllProductsAdmin((prods) => setProducts(prods));
    const unsubCrm = posService.subscribeToCrmCustomers((list) => setCrmCustomers(list));
    const unsubCoupons = settingsService.subscribeToCoupons((list) => setCoupons(list));
    const unsubHeld = posService.subscribeToHeldSales((list) => setHeldSales(list));

    orderService.getAllOrdersAdmin().then(setOrders).catch(() => {});
    settingsService.getDeliveryZones().then((zones) => {
      if (zones.length > 0) {
        setDeliveryZones(zones);
        const firstActive = zones.find((z) => z.active !== false) || zones[0];
        setDeliveryZoneId(firstActive.id);
        setDeliveryChargeInput(firstActive.charge || 0);
      }
    }).catch(() => {});

    return () => {
      unsubProds();
      unsubCrm();
      unsubCoupons();
      unsubHeld();
    };
  }, []);

  // Build unified customer list (CRM customers + orders) with due & previous order tracking
  const customerOptions = useMemo<PosCustomerOption[]>(() => {
    const map = new Map<string, PosCustomerOption>();
    const normalizePhoneKey = (p?: string) => (p || '').replace(/[\s\-+()]/g, '').replace(/^88/, '');

    crmCustomers.forEach((c) => {
      const key = normalizePhoneKey(c.phone) || c.uid || c.email;
      if (!key) return;
      map.set(key, {
        uid: c.uid,
        name: c.name,
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        division: c.division || 'Dhaka',
        district: c.district || 'Dhaka',
        totalDue: 0,
        orderCount: 0,
        recentOrders: [],
      });
    });

    orders.forEach((ord) => {
      const phone = ord.customerPhone || ord.shippingAddress?.phone || '';
      const key = normalizePhoneKey(phone) || (ord.customerId !== 'walk-in-pos' ? ord.customerId : '') || ord.customerEmail || ord.customerName;
      if (!key || key === 'N/A') return;
      const { due } = getOrderPaidAndDue(ord);
      const existing = map.get(key) || {
        uid: ord.customerId && ord.customerId !== 'guest' ? ord.customerId : `CUS-${key.slice(-5)}`,
        name: ord.customerName || ord.shippingAddress?.fullName || 'Customer',
        phone,
        email: ord.customerEmail || ord.shippingAddress?.email || '',
        address: ord.shippingAddress?.address || '',
        division: ord.shippingAddress?.division || 'Dhaka',
        district: ord.shippingAddress?.district || 'Dhaka',
        totalDue: 0,
        orderCount: 0,
        recentOrders: [],
      };
      if (ord.orderStatus !== 'cancelled' && ord.orderStatus !== 'returned') {
        existing.orderCount += 1;
        existing.totalDue += due;
      }
      existing.recentOrders.push(ord);
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.orderCount - a.orderCount);
  }, [crmCustomers, orders]);

  const selectedCustomerObj = useMemo(
    () =>
      customerOptions.find(
        (c) =>
          (selectedCustomerUid && c.uid === selectedCustomerUid) ||
          (customerPhone.trim().length >= 6 && c.phone === customerPhone.trim())
      ) || null,
    [customerOptions, selectedCustomerUid, customerPhone]
  );

  const matchingCustomerDropdown = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customerOptions.slice(0, 8);
    return customerOptions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          c.uid.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [customerOptions, customerSearchQuery]);

  const categories = Array.from(
    new Set(products.map((p) => p.categoryName || p.category).filter(Boolean))
  );

  const filteredProducts = products.filter((p) => {
    if (p.active === false) return false;
    const cat = p.categoryName || p.category;
    if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.fabric || '').toLowerCase().includes(q)
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
          ...(typeof prod.costPrice === 'number' && prod.costPrice > 0
            ? { unitCost: prod.costPrice }
            : {}),
          totalPrice: unitPrice,
          sku: prod.sku,
          productCode: prod.sku,
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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exactSku = filteredProducts.find(
      (p) => p.sku?.toLowerCase() === q || p.barcode?.toLowerCase() === q
    );
    if (exactSku) {
      e.preventDefault();
      handleProductTileClick(exactSku);
      setSearch('');
      return;
    }
    if (filteredProducts.length === 1) {
      e.preventDefault();
      handleProductTileClick(filteredProducts[0]);
      setSearch('');
    }
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

  // Totals & Discounts Calculation
  const subtotal = cart.reduce((sum, l) => sum + l.totalPrice, 0);
  const manualDiscount =
    discountType === 'percent'
      ? Math.min(subtotal, Math.round((subtotal * Math.max(0, Math.min(100, Number(discountInput) || 0))) / 100))
      : Math.min(subtotal, Math.max(0, Number(discountInput) || 0));

  let couponDiscount = 0;
  let effectiveDeliveryCharge = deliveryRequired ? Math.max(0, Number(deliveryChargeInput) || 0) : 0;

  if (appliedCoupon) {
    if (appliedCoupon.discountType === 'free_delivery') {
      effectiveDeliveryCharge = 0;
    } else if (appliedCoupon.discountType === 'percentage') {
      const pctAmt = Math.round((subtotal * appliedCoupon.discountAmount) / 100);
      couponDiscount = appliedCoupon.maxDiscount ? Math.min(pctAmt, appliedCoupon.maxDiscount) : pctAmt;
    } else {
      couponDiscount = Math.min(appliedCoupon.discountAmount, Math.max(0, subtotal - manualDiscount));
    }
  }

  const totalDiscount = Math.min(subtotal, manualDiscount + couponDiscount);
  const grandTotal = Math.max(0, subtotal - totalDiscount + effectiveDeliveryCharge);

  // Payment Breakdown
  const resolvedPaidAmount =
    paymentMethod === 'due'
      ? Math.min(grandTotal, Math.max(0, Number(paidAmountInput) || 0))
      : paidAmountInput.trim() === ''
        ? grandTotal
        : Math.min(grandTotal, Math.max(0, Number(paidAmountInput) || 0));
  const resolvedDueAmount = Math.max(0, grandTotal - resolvedPaidAmount);

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const match = settingsService.findBestCouponByCode(coupons, code);
    if (!match) {
      setCouponError('Coupon code not found.');
      return;
    }
    if (!settingsService.isCouponValidForUse(match)) {
      setCouponError('Coupon expired, inactive, or limit reached.');
      return;
    }
    if (subtotal < (Number(match.minOrderAmount) || 0)) {
      setCouponError(`Minimum order ৳${match.minOrderAmount} required.`);
      return;
    }
    setAppliedCoupon(match);
    setCouponError('');
    showToast(`Coupon ${match.code} applied!`);
  };

  const handleSelectCustomer = (opt: PosCustomerOption) => {
    setSelectedCustomerUid(opt.uid);
    setCustomerName(opt.name);
    setCustomerPhone(opt.phone);
    setCustomerEmail(opt.email || '');
    if (opt.address && !deliveryAddress) {
      setDeliveryAddress(opt.address);
    }
    setCustomerSearchQuery('');
    setShowCustomerDropdown(false);
  };

  const handleCreateCrmCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustFirstName.trim() || !newCustPhone.trim()) return;
    setSavingCustomer(true);
    try {
      const saved = await posService.saveCrmCustomer({
        firstName: newCustFirstName.trim(),
        lastName: newCustLastName.trim(),
        phone: newCustPhone.trim(),
        email: newCustEmail.trim(),
        division: newCustDivision.trim() || 'Dhaka',
        district: newCustDistrict.trim() || 'Dhaka',
        address: newCustAddress.trim(),
      });
      setSelectedCustomerUid(saved.uid);
      setCustomerName(saved.name);
      setCustomerPhone(saved.phone || newCustPhone.trim());
      setCustomerEmail(saved.email || '');
      if (saved.address) setDeliveryAddress(saved.address);
      setShowAddCustomerModal(false);
      setNewCustFirstName('');
      setNewCustLastName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustAddress('');
      showToast(`Customer ${saved.name} (${saved.uid}) added!`);
    } finally {
      setSavingCustomer(false);
    }
  };

  const resetBillState = () => {
    setCart([]);
    setSelectedCustomerUid('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setDiscountInput(0);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
    setDeliveryRequired(false);
    setDeliveryAddress('');
    setPaymentMethod('cash');
    setPaidAmountInput('');
    setTrxId('');
    setSenderNumber('');
    setNotes('');
    setActiveBillTab('none');
    setErrorMsg('');
  };

  const handleHoldSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Add items before holding the POS ticket.');
      return;
    }
    const staffName = currentUser?.displayName || currentUser?.email || 'POS Cashier';
    const selectedZone = deliveryZones.find((z) => z.id === deliveryZoneId);
    const held = await posService.saveHeldSale({
      customerId: selectedCustomerUid || undefined,
      customerName: customerName.trim() || 'Walk-in Customer',
      customerPhone: customerPhone.trim() || '',
      customerEmail: customerEmail.trim() || '',
      deliveryRequired,
      deliveryZoneId: deliveryRequired ? selectedZone?.id || deliveryZoneId : undefined,
      deliveryAddress: deliveryRequired ? deliveryAddress.trim() : undefined,
      deliveryCharge: effectiveDeliveryCharge,
      items: cart.map(({ availableStock: _a, ...rest }) => rest),
      subtotal,
      discountType,
      discountInput,
      discount: totalDiscount,
      couponCode: appliedCoupon?.code,
      couponDiscount,
      total: grandTotal,
      paymentMethod,
      paidAmountInput: paidAmountInput.trim() ? Number(paidAmountInput) : undefined,
      notes,
      createdBy: staffName,
    });
    resetBillState();
    showToast(`Ticket ${held.holdNumber} saved on Hold.`);
  };

  const handleResumeHeldSale = async (hold: HeldPosSale) => {
    const restoredLines: PosCartLine[] = hold.items.map((it) => {
      const catProd = products.find((p) => p.id === it.productId);
      return {
        ...it,
        availableStock: typeof catProd?.totalStock === 'number' ? catProd.totalStock : 0,
      };
    });
    setCart(restoredLines);
    setSelectedCustomerUid(hold.customerId || '');
    setCustomerName(hold.customerName === 'Walk-in Customer' ? '' : hold.customerName);
    setCustomerPhone(hold.customerPhone || '');
    setCustomerEmail(hold.customerEmail || '');
    setDeliveryRequired(Boolean(hold.deliveryRequired));
    if (hold.deliveryZoneId) setDeliveryZoneId(hold.deliveryZoneId);
    setDeliveryAddress(hold.deliveryAddress || '');
    setDeliveryChargeInput(hold.deliveryCharge || 0);
    setDiscountType(hold.discountType || 'fixed');
    setDiscountInput(hold.discountInput || 0);
    setCouponInput(hold.couponCode || '');
    setAppliedCoupon(
      hold.couponCode ? coupons.find((c) => c.code === hold.couponCode) || null : null
    );
    setPaymentMethod(hold.paymentMethod || 'cash');
    setPaidAmountInput(
      typeof hold.paidAmountInput === 'number' ? String(hold.paidAmountInput) : ''
    );
    setNotes(hold.notes || '');
    await posService.deleteHeldSale(hold.id);
    setShowHeldModal(false);
    showToast(`Resumed ticket ${hold.holdNumber}`);
  };

  const handleCancelPosTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    const reason = cancelReasonInput.trim() || 'Cancelled by cashier';
    const cashierName = currentUser?.displayName || currentUser?.email || 'POS Counter';
    setSubmitting(true);
    try {
      const selectedZone = deliveryZones.find((z) => z.id === deliveryZoneId);
      const res = await orderService.createPosOrder({
        customerId: selectedCustomerUid || undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || 'N/A',
        customerEmail: customerEmail.trim(),
        deliveryRequired,
        deliveryZone: deliveryRequired ? selectedZone?.name || 'Custom Delivery' : undefined,
        deliveryAddress: deliveryRequired ? deliveryAddress.trim() : undefined,
        deliveryCharge: effectiveDeliveryCharge,
        couponCode: appliedCoupon?.code,
        items: cart.map(({ availableStock: _a, ...rest }) => rest),
        subtotal,
        discount: totalDiscount,
        total: grandTotal,
        paymentMethod,
        paidAmount: 0,
        dueAmount: 0,
        cashierName,
        notes,
        orderStatusOverride: 'cancelled',
        cancelReason: reason,
      });

      if (res.success && res.order && currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'POS_SALE_CANCELLED',
            res.order.orderNumber,
            `Cancelled POS ticket ৳${grandTotal} (${reason})`,
            { entityType: 'pos_sale', beforeValue: `৳${grandTotal}`, afterValue: `Cancelled: ${reason}` }
          )
          .catch(() => {});
        setOrders((prev) => [res.order!, ...prev]);
      }

      setShowCancelModal(false);
      setCancelReasonInput('');
      resetBillState();
      showToast('POS ticket cancelled and logged.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      setErrorMsg('Please select at least one product first.');
      return;
    }
    if (resolvedDueAmount > 0 && !customerName.trim() && !customerPhone.trim()) {
      setErrorMsg('Please enter Customer Name or Phone for due/partial payment tracking.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const cashierName = currentUser?.displayName || currentUser?.email || 'POS Counter';
      const selectedZone = deliveryZones.find((z) => z.id === deliveryZoneId);
      const res = await orderService.createPosOrder({
        customerId: selectedCustomerUid || undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim() || 'N/A',
        customerEmail: customerEmail.trim(),
        deliveryRequired,
        deliveryZone: deliveryRequired ? selectedZone?.name || 'Delivery Zone' : undefined,
        deliveryAddress: deliveryRequired ? deliveryAddress.trim() : undefined,
        deliveryCharge: effectiveDeliveryCharge,
        couponCode: appliedCoupon?.code,
        items: cart.map(({ availableStock: _a, ...rest }) => rest),
        subtotal,
        discount: totalDiscount,
        total: grandTotal,
        paymentMethod,
        paidAmount: resolvedPaidAmount,
        dueAmount: resolvedDueAmount,
        trxId: trxId.trim() || undefined,
        senderNumber: senderNumber.trim() || undefined,
        cashierName,
        notes,
      });

      if (!res.success || !res.order) {
        setErrorMsg(res.error || 'Failed to complete POS sale.');
        return;
      }

      if (appliedCoupon) {
        settingsService.markCouponUsed(appliedCoupon.id, false, selectedCustomerUid || undefined).catch(() => {});
      }

      if (currentUser) {
        settingsService
          .logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'POS_SALE',
            res.order.orderNumber,
            `POS sale ৳${grandTotal} · Paid ৳${resolvedPaidAmount}${resolvedDueAmount > 0 ? ` · Due ৳${resolvedDueAmount}` : ''} (${paymentMethod.toUpperCase()})`,
            { entityType: 'pos_sale', afterValue: `৳${grandTotal} (${paymentMethod.toUpperCase()})` }
          )
          .catch(() => {});
      }

      setOrders((prev) => [res.order!, ...prev]);
      setCompletedOrder(res.order);
      resetBillState();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-0 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <AdminPageHeader
        title="Point of Sale"
        subtitle={`${filteredProducts.length} active products · Search by name, SKU, or barcode`}
        actions={
          <button
            type="button"
            onClick={() => setShowHeldModal(true)}
            className="px-3 py-2 bg-white border border-neutral-200 hover:border-neutral-900 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
          >
            <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Held Bills ({heldSales.length})</span>
          </button>
        }
      />

      {/* Split POS Register Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 items-stretch lg:flex-1 lg:min-h-0">
        {/* LEFT: Product Register */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 lg:h-full lg:min-h-0">
          {/* Search Input */}
          <div className="relative shrink-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search Product Name, SKU or Barcode (Press Enter on exact SKU)..."
              className="w-full pl-10 pr-9 py-2.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900 focus:bg-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Horizontal Quick Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-neutral-950 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-neutral-950 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="flex-1 py-16 text-center text-xs text-neutral-500 flex flex-col items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="font-semibold text-neutral-800">No matching active products</p>
              <p className="text-neutral-400 mt-0.5">Try clearing your search or selecting All Items.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:flex-1 lg:min-h-0 overflow-y-auto pr-1 content-start">
              {filteredProducts.map((prod) => {
                const hasDiscount = Boolean(prod.salePrice && prod.salePrice > 0 && prod.salePrice < prod.price);
                const effectivePrice = hasDiscount ? prod.salePrice! : prod.price;
                const discountPct = hasDiscount
                  ? Math.round(((prod.price - effectivePrice) / prod.price) * 100)
                  : 0;
                const stock = prod.totalStock ?? 0;
                const outOfStock = stock <= 0;
                const qtyInBill = cart
                  .filter((c) => c.productId === prod.id)
                  .reduce((sum, c) => sum + c.quantity, 0);

                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleProductTileClick(prod)}
                    className={`group text-left border rounded-lg overflow-hidden transition-all cursor-pointer flex flex-col justify-between bg-white relative active:scale-[0.98] ${
                      qtyInBill > 0
                        ? 'border-neutral-950 ring-1 ring-neutral-950/20'
                        : outOfStock
                          ? 'border-neutral-200 opacity-65 hover:border-neutral-400'
                          : 'border-neutral-200 hover:border-neutral-900 hover:shadow-sm'
                    }`}
                  >
                    <div className="aspect-square bg-neutral-100 relative overflow-hidden">
                      <img
                        src={prod.thumbnail || prod.images?.[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                        alt={prod.name}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      />
                      {hasDiscount && discountPct > 0 && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-neutral-950 text-white text-[10px] font-mono font-bold rounded">
                          -{discountPct}%
                        </span>
                      )}
                      {qtyInBill > 0 ? (
                        <span className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1.5 bg-neutral-950 text-white text-[10px] font-mono font-bold rounded flex items-center justify-center tabular-nums">
                          {qtyInBill}
                        </span>
                      ) : outOfStock ? (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase rounded">
                          Out
                        </span>
                      ) : null}
                    </div>
                    <div className="p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-mono text-neutral-400 truncate">{prod.sku || 'NO-SKU'}</p>
                        <span
                          className={`text-[10px] font-semibold tabular-nums shrink-0 ${
                            outOfStock ? 'text-red-600' : stock <= (prod.minStock || 5) ? 'text-amber-600' : 'text-neutral-500'
                          }`}
                        >
                          Stock: {stock}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-900 line-clamp-1">{prod.name}</p>
                      <div className="flex items-baseline gap-1.5 pt-0.5 tabular-nums">
                        <span className="text-xs font-bold font-mono text-neutral-950">
                          ৳{effectivePrice.toLocaleString('en-BD')}
                        </span>
                        {hasDiscount && (
                          <span className="text-[10px] font-mono text-neutral-400 line-through">
                            ৳{prod.price.toLocaleString('en-BD')}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Current POS Bill Register */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col lg:h-full lg:min-h-0">
          {/* Bill Header */}
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between gap-2 bg-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Receipt className="w-4 h-4 text-neutral-950 shrink-0" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-950 truncate">
                Current POS Bill
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0 tabular-nums text-[11px]">
              <span className="text-neutral-500 font-medium">
                {cart.reduce((s, l) => s + l.quantity, 0)} {cart.reduce((s, l) => s + l.quantity, 0) === 1 ? 'item' : 'items'}
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelReasonInput('');
                    setShowCancelModal(true);
                  }}
                  className="font-semibold text-red-600 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Cancel Sale
                </button>
              )}
            </div>
          </div>

          {/* Customer Bar */}
          <div className="px-4 py-2.5 bg-neutral-50/70 border-b border-neutral-200 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={customerSearchQuery}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  placeholder="Search saved customer (name / phone)..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
                {showCustomerDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-300 rounded-lg shadow-xl z-30 max-h-52 overflow-y-auto">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-100 bg-neutral-50 text-[10px] font-bold uppercase text-neutral-500">
                      <span>Select Customer</span>
                      <button
                        type="button"
                        onClick={() => setShowCustomerDropdown(false)}
                        className="text-neutral-500 hover:text-black cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    {matchingCustomerDropdown.length === 0 ? (
                      <p className="p-3 text-xs text-neutral-400 text-center">No matching saved customers</p>
                    ) : (
                      matchingCustomerDropdown.map((opt) => (
                        <button
                          key={`${opt.uid}-${opt.phone}`}
                          type="button"
                          onClick={() => handleSelectCustomer(opt)}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-neutral-900 truncate">{opt.name}</p>
                            <p className="text-[10px] font-mono text-neutral-500">{opt.phone || opt.email || opt.uid}</p>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <span className="text-[10px] text-neutral-500 block">{opt.orderCount} orders</span>
                            {opt.totalDue > 0 && (
                              <span className="text-[10px] font-mono font-bold text-red-600">
                                Due: ৳{opt.totalDue.toLocaleString('en-BD')}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="px-2.5 py-1.5 bg-white border border-neutral-200 hover:border-neutral-900 rounded-lg inline-flex items-center gap-1 text-[11px] font-bold text-neutral-900 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {selectedCustomerObj ? (
              <div className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg flex items-center justify-between gap-2 text-[11px] tabular-nums">
                <div className="min-w-0 truncate">
                  <span className="font-bold text-neutral-900 mr-1.5">{selectedCustomerObj.name}</span>
                  <span className="text-neutral-400 mr-1.5">·</span>
                  <span className="font-mono text-neutral-600">{selectedCustomerObj.phone}</span>
                  {selectedCustomerObj.totalDue > 0 && (
                    <>
                      <span className="text-neutral-400 mx-1.5">·</span>
                      <span className="font-mono font-bold text-red-600">
                        Due ৳{selectedCustomerObj.totalDue.toLocaleString('en-BD')}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCustomerHistoryModal(true)}
                    className="text-[11px] font-bold text-neutral-900 hover:underline cursor-pointer"
                  >
                    History
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerUid('');
                      setCustomerName('');
                      setCustomerPhone('');
                      setCustomerEmail('');
                    }}
                    aria-label="Clear selected customer"
                    className="text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                  />
                </div>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone (01XXXXXXXXX)"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
              </div>
            )}
          </div>

          {/* Scrollable Cart Items List */}
          <div className="flex-1 min-h-[160px] lg:min-h-0 overflow-y-auto px-4 divide-y divide-neutral-100">
            {cart.length === 0 ? (
              <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center py-6 space-y-1.5">
                <ShoppingBag className="w-7 h-7 text-neutral-300" />
                <p className="text-xs font-semibold text-neutral-700">Ready for New Sale</p>
                <p className="text-[11px] text-neutral-400 max-w-[240px]">
                  Click any product from the catalog or scan a barcode / SKU to start ringing up the bill.
                </p>
              </div>
            ) : (
              cart.map((line, idx) => (
                <div
                  key={`${line.productId}-${line.size}-${line.color}`}
                  className="flex items-center justify-between gap-2.5 py-2.5 text-xs"
                >
                  <img
                    src={line.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                    alt={line.productName}
                    className="w-10 h-10 rounded-lg object-cover border border-neutral-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-900 truncate">{line.productName}</p>
                    <p className="text-[11px] text-neutral-500 tabular-nums truncate">
                      {line.size} · {line.color} · ৳{line.unitPrice.toLocaleString('en-BD')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(idx, -1)}
                      aria-label="Decrease quantity"
                      className="w-6 h-6 border border-neutral-200 rounded flex items-center justify-center hover:border-neutral-900 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-mono font-bold tabular-nums text-neutral-900">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(idx, 1)}
                      aria-label="Increase quantity"
                      className="w-6 h-6 border border-neutral-200 rounded flex items-center justify-center hover:border-neutral-900 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-16 text-right font-mono font-bold tabular-nums text-neutral-950">
                      ৳{line.totalPrice.toLocaleString('en-BD')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove item"
                      className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Compact Adjustment Toolbar (Discount, Coupon, Delivery, Note) */}
          <div className="px-4 py-2 border-t border-neutral-200 bg-white space-y-2 shrink-0">
            <div className="grid grid-cols-4 gap-1.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveBillTab((t) => (t === 'discount' ? 'none' : 'discount'))}
                className={`py-1.5 px-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  activeBillTab === 'discount'
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : manualDiscount > 0
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-900'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-900'
                }`}
              >
                {manualDiscount > 0 ? `-৳${manualDiscount}` : '+ Discount'}
              </button>
              <button
                type="button"
                onClick={() => setActiveBillTab((t) => (t === 'coupon' ? 'none' : 'coupon'))}
                className={`py-1.5 px-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  activeBillTab === 'coupon'
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : appliedCoupon
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-900'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-900'
                }`}
              >
                {appliedCoupon ? appliedCoupon.code : '+ Coupon'}
              </button>
              <button
                type="button"
                onClick={() => setActiveBillTab((t) => (t === 'delivery' ? 'none' : 'delivery'))}
                className={`py-1.5 px-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  activeBillTab === 'delivery'
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : deliveryRequired
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-900'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-900'
                }`}
              >
                {deliveryRequired ? `+৳${effectiveDeliveryCharge}` : '+ Delivery'}
              </button>
              <button
                type="button"
                onClick={() => setActiveBillTab((t) => (t === 'note' ? 'none' : 'note'))}
                className={`py-1.5 px-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap truncate ${
                  activeBillTab === 'note'
                    ? 'bg-neutral-950 text-white border-neutral-950'
                    : notes.trim()
                      ? 'bg-neutral-100 text-neutral-950 border-neutral-900'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:border-neutral-900'
                }`}
              >
                {notes.trim() ? 'Note ✓' : '+ Note'}
              </button>
            </div>

            {activeBillTab === 'discount' && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex border border-neutral-200 rounded-md overflow-hidden text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2.5 py-1.5 cursor-pointer ${discountType === 'fixed' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600'}`}
                  >
                    ৳
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2.5 py-1.5 cursor-pointer ${discountType === 'percent' ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-600'}`}
                  >
                    %
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={discountType === 'percent' ? 100 : undefined}
                  value={discountInput || ''}
                  onChange={(e) => setDiscountInput(Number(e.target.value) || 0)}
                  placeholder={discountType === 'percent' ? 'Discount %' : 'Discount amount (৳)'}
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
                {discountInput > 0 && (
                  <button
                    type="button"
                    onClick={() => setDiscountInput(0)}
                    className="text-xs text-red-600 font-semibold px-2 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {activeBillTab === 'coupon' && (
              <div className="space-y-1 pt-1">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-mono font-bold text-neutral-900">
                    <span>Applied: {appliedCoupon.code}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponInput('');
                      }}
                      className="text-red-600 hover:underline font-sans text-[11px] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Enter promo / coupon code"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono uppercase bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="px-3 py-1.5 bg-neutral-950 text-white text-xs font-bold uppercase rounded-lg cursor-pointer shrink-0 hover:bg-neutral-800"
                    >
                      Apply
                    </button>
                  </div>
                )}
                {couponError && <p className="text-[11px] text-red-600">{couponError}</p>}
              </div>
            )}

            {activeBillTab === 'delivery' && (
              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between cursor-pointer text-xs font-semibold text-neutral-800 px-1">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Add Home Delivery Charge</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={deliveryRequired}
                    onChange={(e) => setDeliveryRequired(e.target.checked)}
                    className="accent-black w-4 h-4 cursor-pointer"
                  />
                </label>
                {deliveryRequired && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={deliveryZoneId}
                        onChange={(e) => {
                          const zid = e.target.value;
                          setDeliveryZoneId(zid);
                          const z = deliveryZones.find((item) => item.id === zid);
                          if (z) setDeliveryChargeInput(z.charge);
                        }}
                        className="col-span-2 px-2 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                      >
                        {deliveryZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} (৳{z.charge})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={deliveryChargeInput}
                        onChange={(e) => setDeliveryChargeInput(Number(e.target.value) || 0)}
                        placeholder="Fee ৳"
                        className="px-2 py-1.5 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                      />
                    </div>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Delivery full address..."
                      className="w-full px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                    />
                  </div>
                )}
              </div>
            )}

            {activeBillTab === 'note' && (
              <div className="pt-1">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional counter note or alteration details..."
                  className="w-full px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
              </div>
            )}
          </div>

          {/* Payment, Totals & Bottom Action Dock */}
          <div className="px-4 py-3.5 bg-neutral-50 border-t border-neutral-200 space-y-3 shrink-0">
            {/* Payment Methods */}
            <div className="grid grid-cols-5 gap-1 text-[11px] font-bold">
              {[
                { id: 'cash', label: 'Cash' },
                { id: 'bkash', label: 'bKash' },
                { id: 'nagad', label: 'Nagad' },
                { id: 'rocket', label: 'Rocket' },
                { id: 'due', label: 'Due' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m.id as PaymentMethod);
                    if (m.id === 'due') setPaidAmountInput('0');
                    else setPaidAmountInput('');
                  }}
                  className={`py-1.5 rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    paymentMethod === m.id
                      ? 'bg-neutral-950 text-white border-neutral-950'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {(paymentMethod === 'bkash' || paymentMethod === 'nagad' || paymentMethod === 'rocket') && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="Sender Number"
                  className="px-2.5 py-1.5 text-xs font-mono bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
                <input
                  type="text"
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  placeholder="TrxID (Optional)"
                  className="px-2.5 py-1.5 text-xs font-mono bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
                />
              </div>
            )}

            {/* Inline Paid Amount */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-700">Paid Amount (৳)</span>
              <div className="flex items-center gap-1.5">
                {paidAmountInput.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setPaidAmountInput('')}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 cursor-pointer"
                  >
                    Full
                  </button>
                )}
                <input
                  type="number"
                  min={0}
                  max={grandTotal}
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  placeholder={`${grandTotal}`}
                  className="w-28 px-2.5 py-1 text-right text-xs font-mono font-bold bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900 tabular-nums"
                />
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="pt-2 border-t border-neutral-200 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between text-neutral-500">
                <span>Subtotal ({cart.reduce((s, l) => s + l.quantity, 0)} pcs)</span>
                <span className="font-mono font-medium text-neutral-800">৳{subtotal.toLocaleString('en-BD')}</span>
              </div>
              {manualDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono font-medium">-৳{manualDiscount.toLocaleString('en-BD')}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Coupon ({appliedCoupon?.code})
                  </span>
                  <span className="font-mono font-medium">-৳{couponDiscount.toLocaleString('en-BD')}</span>
                </div>
              )}
              {deliveryRequired && (
                <div className="flex justify-between text-neutral-600">
                  <span>Delivery Charge</span>
                  <span className="font-mono font-medium">+৳{effectiveDeliveryCharge.toLocaleString('en-BD')}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-neutral-200">
                <span className="text-sm font-extrabold uppercase tracking-wide text-neutral-950">
                  Net Payable
                </span>
                <span className="text-xl font-mono font-black text-neutral-950">
                  ৳{grandTotal.toLocaleString('en-BD')}
                </span>
              </div>
              {resolvedDueAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-red-600">
                  <span>Customer Due</span>
                  <span className="font-mono">৳{resolvedDueAmount.toLocaleString('en-BD')}</span>
                </div>
              )}
            </div>

            {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}

            {/* Primary Black Complete Sale & Print Button + Hold / Held / Clear */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleCompleteSale}
                className="w-full py-3.5 px-4 bg-neutral-950 hover:bg-neutral-800 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {submitting
                    ? 'Processing Sale...'
                    : `COMPLETE SALE & PRINT (৳${grandTotal.toLocaleString('en-BD')})`}
                </span>
              </button>

              <div className="grid grid-cols-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleHoldSale}
                  className="py-2 px-2 bg-white hover:bg-amber-50/70 border border-amber-400 text-amber-600 rounded-l-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>Hold</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHeldModal(true)}
                  className="py-2 px-2 bg-white hover:bg-neutral-100 border-y border-neutral-300 text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap tabular-nums"
                >
                  <Folder className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>Held ({heldSales.length})</span>
                </button>
                <button
                  type="button"
                  onClick={resetBillState}
                  className="py-2 px-2 bg-white hover:bg-red-50/70 border border-red-400 text-red-600 rounded-r-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-black" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                  Add New Customer
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCrmCustomer} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustFirstName}
                    onChange={(e) => setNewCustFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newCustLastName}
                    onChange={(e) => setNewCustLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    placeholder="customer@mail.com"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    Division
                  </label>
                  <input
                    type="text"
                    value={newCustDivision}
                    onChange={(e) => setNewCustDivision(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                    District
                  </label>
                  <input
                    type="text"
                    value={newCustDistrict}
                    onChange={(e) => setNewCustDistrict(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  placeholder="House, Road, Area..."
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg font-semibold text-neutral-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-5 py-2 bg-black text-white font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer"
                >
                  {savingCustomer ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Customer History Quick Modal */}
      {showCustomerHistoryModal && selectedCustomerObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                  {selectedCustomerObj.name}
                </h3>
                <p className="text-[11px] font-mono text-neutral-500">
                  {selectedCustomerObj.uid} · {selectedCustomerObj.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerHistoryModal(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-[10px] font-bold uppercase text-neutral-500 block">Total Orders</span>
                <span className="text-base font-black font-mono">{selectedCustomerObj.orderCount}</span>
              </div>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-[10px] font-bold uppercase text-neutral-500 block">Current Due</span>
                <span className="text-base font-black font-mono text-red-600">
                  ৳{selectedCustomerObj.totalDue.toLocaleString('en-BD')}
                </span>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {selectedCustomerObj.recentOrders.map((ord) => {
                const { paid, due } = getOrderPaidAndDue(ord);
                return (
                  <div key={ord.id} className="p-2.5 border border-neutral-200 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-neutral-900">{ord.orderNumber}</p>
                      <p className="text-[10px] text-neutral-500">{formatDateTime(ord.createdAt)}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="font-bold text-neutral-900">৳{ord.total.toLocaleString('en-BD')}</p>
                      <p className="text-[10px] text-neutral-500">
                        Paid ৳{paid.toLocaleString('en-BD')} {due > 0 && <span className="text-red-600 font-bold">· Due ৳{due.toLocaleString('en-BD')}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Held Bills Modal */}
      {showHeldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                Held POS Bills ({heldSales.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowHeldModal(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {heldSales.length === 0 ? (
              <p className="py-8 text-center text-neutral-400">No held tickets right now.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2.5">
                {heldSales.map((h) => (
                  <div key={h.id} className="p-3 border border-neutral-200 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-neutral-900">{h.holdNumber}</span>
                        <span className="ml-2 text-neutral-600 font-semibold">{h.customerName}</span>
                      </div>
                      <span className="font-mono font-bold text-neutral-900">
                        ৳{h.total.toLocaleString('en-BD')}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      {h.items.reduce((s, i) => s + i.quantity, 0)} pcs · Held by {h.createdBy} · {formatDateTime(h.createdAt)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleResumeHeldSale(h)}
                        className="flex-1 py-1.5 bg-black text-white text-[11px] font-bold uppercase rounded cursor-pointer flex items-center justify-center gap-1"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Resume Bill</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => posService.deleteHeldSale(h.id)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-[11px] font-bold uppercase rounded cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Sale Reason Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-extrabold uppercase tracking-tight text-red-700">
                Cancel POS Ticket
              </h3>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCancelPosTicket} className="space-y-3">
              <p className="text-neutral-600">
                Stock will not be deducted. This cancelled ticket (৳{grandTotal.toLocaleString('en-BD')}) will be logged in audit and sales records.
              </p>
              <div>
                <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                  Cancel Reason *
                </label>
                <input
                  type="text"
                  required
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  placeholder="e.g. Customer changed mind / Price issue"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg font-semibold cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 text-white font-bold uppercase rounded-lg cursor-pointer hover:bg-red-700"
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Variant Picker Modal */}
      {variantModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">{variantModalProduct.name}</h3>
                <p className="text-xs font-mono text-neutral-500">
                  ৳{(variantModalProduct.salePrice || variantModalProduct.price).toLocaleString('en-BD')} · Stock: {variantModalProduct.totalStock ?? 0}
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

            <div id="printable-pos-receipt">
              <ThermalPosReceipt order={completedOrder} receiptTitle="POS Counter Receipt" />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => printElementById('printable-pos-receipt', completedOrder.orderNumber, 'thermal')}
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

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-70 bg-neutral-950 text-white text-xs font-medium py-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-neutral-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

