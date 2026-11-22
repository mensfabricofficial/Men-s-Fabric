export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  price?: number;
  salePrice?: number;
}

export interface ProductColor {
  name: string;
  code: string;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription?: string;
  category: string;
  categoryName?: string;
  subcategory?: string;
  brand?: string;
  gender: 'men' | 'women' | 'unisex' | 'kids';
  fabric: string;
  images: string[];
  thumbnail: string;
  price: number;
  salePrice?: number;
  costPrice?: number; // Admin only
  sizes: string[];
  colors: ProductColor[];
  variants?: ProductVariant[];
  totalStock: number;
  minStock?: number;
  damagedStock?: number;
  weight?: string;
  tags?: string[];
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  active: boolean;
  seoTitle?: string;
  seoDescription?: string;
  views?: number;
  salesCount?: number;
  createdAt?: any;
  updatedAt?: any;
}

export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'return'
  | 'manual'
  | 'damaged'
  | 'adjustment';

export interface StockMovementEntry {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  size?: string;
  color?: string;
  previousStock: number;
  change: number;
  newStock: number;
  type: StockMovementType;
  reason?: string;
  referenceId?: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  active: boolean;
  sortOrder: number;
  productCount?: number;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  image: string;
  buttonText: string;
  buttonLink: string;
  active: boolean;
  sortOrder: number;
}

export interface CartItem {
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string;
  size: string;
  color: string;
  quantity: number;
  price: number; // Regular price
  salePrice?: number; // Discounted price
  availableStock: number;
  sku: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  division: string;
  district: string;
  thana?: string;
  upazila?: string;
  postCode?: string;
  notes?: string;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  totalPrice: number;
  sku?: string;
  productCode?: string;
}

export interface OrderTimeline {
  status: OrderStatus;
  timestamp: string;
  note?: string;
}

export type PaymentMethod = 'cod' | 'cash' | 'bkash' | 'nagad' | 'rocket' | 'due';

export interface CustomerPaymentLog {
  id: string;
  amount: number;
  method: PaymentMethod;
  trxId?: string;
  senderNumber?: string;
  receivedBy: string;
  note?: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
}

export interface PaymentDetails {
  method: PaymentMethod;
  senderNumber?: string;
  transactionId?: string;
  proofUrl?: string;
  onlineDiscountApplied?: number;
  paidAt?: string;
  advanceDeliveryPaid?: boolean;
  advanceGateway?: 'bkash' | 'nagad' | 'rocket';
  advanceAmount?: number;
  dueOnDelivery?: number;
}

export type OrderPipelineStage =
  | 'order_verification'
  | 'payment_verification'
  | 'inventory_packing'
  | 'delivery_dispatch'
  | 'cod_reconciliation'
  | 'completed'
  | 'returned'
  | 'cancelled';

export type OrderPipelineSubStatus =
  | 'NEW'
  | 'ORDER_CHECKING'
  | 'ORDER_CHECKED'
  | 'INITIAL_PAYMENT_VERIFIED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_VERIFIED'
  | 'ORDER_APPROVED'
  | 'STOCK_PENDING'
  | 'STOCK_APPROVED'
  | 'STOCK_UPDATED'
  | 'PACKING'
  | 'PACKED'
  | 'COURIER_CONFIRMED'
  | 'TRACKING_ADDED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COD_AWAITING_COLLECTION'
  | 'RECONCILIATION_REQUIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_APPROVED'
  | 'RETURNED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type CustomerVerificationFieldKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'division'
  | 'district'
  | 'thana'
  | 'postCode'
  | 'address';

export type VerificationFieldStatus = 'pending' | 'verified' | 'needs_correction';

export interface FieldVerificationEntry {
  status: VerificationFieldStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  correctionNote?: string;
  correctedValue?: string;
  correctedBy?: string;
  correctedAt?: string;
}

export interface InitialPaymentVerificationState {
  paymentAmount: FieldVerificationEntry;
  paymentMethod: FieldVerificationEntry;
  completed?: boolean;
  completedBy?: string;
  completedAt?: string;
}

export interface OrderFinancialSnapshot {
  productPrice: number;
  discount: number;
  couponDiscount: number;
  onlineDiscount?: number;
  shippingCharge: number;
  codCharge: number;
  finalPayable: number;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  capturedAt: string;
  capturedBy: string;
}

export type PaymentVerifyStepKey =
  | 'productPrice'
  | 'onlineDiscount'
  | 'discount'
  | 'couponDiscount'
  | 'shipping'
  | 'codCharge'
  | 'finalPayable'
  | 'advancePaid'
  | 'dueOnDelivery'
  | 'senderNumber'
  | 'trxId'
  | 'proof'
  | 'confirmation';

export interface RoleCPaymentVerificationState {
  transactionChecked?: boolean;
  trxIdVerified?: boolean;
  amountVerified?: boolean;
  paymentConfirmed?: boolean;
  codAwaitingCollection?: boolean;
  statusLabel?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  steps?: Partial<Record<PaymentVerifyStepKey, FieldVerificationEntry>>;
}

export type StockVerifyFieldKey =
  | 'product'
  | 'sku'
  | 'size'
  | 'color'
  | 'quantity'
  | 'currentStock'
  | 'stockUpdate';

export interface StockUpdateSnapshotItem {
  productId: string;
  productName: string;
  sku: string;
  size: string;
  color: string;
  stockBefore: number;
  orderQuantity: number;
  stockAfter: number;
}

export interface RoleBStockVerificationState {
  stockVerified?: boolean;
  stockUpdated?: boolean;
  itemsSnapshot?: StockUpdateSnapshotItem[];
  verifiedItemIndices?: number[];
  stepEntries?: Record<string, FieldVerificationEntry>;
  updatedBy?: string;
  updatedAt?: string;
}

export type DeliveryStepKey =
  | 'productCheck'
  | 'sizeCheck'
  | 'colourCheck'
  | 'quantityCheck'
  | 'packing'
  | 'packed'
  | 'courierConfirmed'
  | 'trackingAdded'
  | 'shipped'
  | 'outForDelivery'
  | 'delivered';

export interface DeliveryStepRecord {
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  note?: string;
}

export type DeliveryProgressState = Partial<Record<DeliveryStepKey, DeliveryStepRecord>>;

export interface CodReconciliationState {
  expectedCash: number;
  collectedCash?: number;
  codCharge?: number;
  netCodCollected?: number;
  finalSaleAmount?: number;
  discrepancyAmount?: number;
  reconciliationRequired?: boolean;
  discrepancyNote?: string;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  collectedBy?: string;
  collectedAt?: string;
  reconciledBy?: string;
  reconciledAt?: string;
}

export interface OrderActivityLogEntry {
  id: string;
  stepKey: string;
  label: string;
  category:
    | 'order'
    | 'customer'
    | 'initial_payment'
    | 'payment'
    | 'stock'
    | 'delivery'
    | 'reconciliation';
  actorName: string;
  actorEmail?: string;
  roleLabel?: string;
  note?: string;
  timestamp: string;
}

export interface OrderPipelineStepLog {
  stage: OrderPipelineStage;
  subStatus?: OrderPipelineSubStatus;
  handlerName: string;
  handlerEmail?: string;
  action: string;
  note?: string;
  timestamp: string;
}

export interface OrderPipelineData {
  currentStage: OrderPipelineStage;
  subStatus?: OrderPipelineSubStatus;
  currentActionLabel?: string;
  // Granular Role A state
  customerVerification?: Partial<Record<CustomerVerificationFieldKey, FieldVerificationEntry>>;
  initialPaymentVerification?: InitialPaymentVerificationState;
  // Immutable Financial Snapshot + Role C Payment Verification
  financialSnapshot?: OrderFinancialSnapshot;
  paymentVerification?: RoleCPaymentVerificationState;
  // Role B Stock Verification & Idempotent Update
  stockVerification?: RoleBStockVerificationState;
  // Role D 11-step Packing & Delivery Progress
  deliveryProgress?: DeliveryProgressState;
  // Role C Post-Delivery COD Collection / Finance Reconciliation
  codReconciliation?: CodReconciliationState;
  // Immutable Activity Log
  activityLog?: OrderActivityLogEntry[];

  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedAt?: string;
  verifiedPaymentAmount?: number;
  paymentNote?: string;
  inventoryHandledBy?: string;
  inventoryHandledAt?: string;
  stockApprovedBy?: string;
  stockApprovedAt?: string;
  inventoryNote?: string;
  packedBy?: string;
  packedAt?: string;
  deliveryHandledBy?: string;
  deliveryDispatchedAt?: string;
  shippedBy?: string;
  shippedAt?: string;
  deliveredAt?: string;
  returnedBy?: string;
  returnedAt?: string;
  returnNote?: string;
  refundedBy?: string;
  refundedAt?: string;
  refundAmount?: number;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelledReason?: string;
  cancelNote?: string;
  courierName?: string;
  trackingNumber?: string;
  deliveryNote?: string;
  stockDeducted?: boolean;
  stockDeductedAt?: string;
  stockDeductedBy?: string;
  stockRestored?: boolean;
  stockRestoredAt?: string;
  handoffHistory?: OrderPipelineStepLog[];
}

export interface PartnerDeskConfig {
  stage: 'order_verification' | 'payment_verification' | 'inventory_packing' | 'delivery_dispatch';
  partnerName: string;
  partnerEmail?: string;
  partnerPhone?: string;
  roleTitle: string;
}

export type AdminTabId =
  | 'dashboard'
  | 'pos'
  | 'desk_order_verify'
  | 'desk_payment_verify'
  | 'desk_stock_packing'
  | 'desk_delivery_dispatch'
  | 'pipeline'
  | 'sales_history'
  | 'returns'
  | 'products'
  | 'stock'
  | 'categories'
  | 'purchases'
  | 'suppliers'
  | 'expenses'
  | 'pnl'
  | 'customers'
  | 'coupons'
  | 'delivery'
  | 'reviews'
  | 'banners'
  | 'notifications'
  | 'admins'
  | 'audit'
  | 'settings';

export type OrderActionPermission =
  | 'order_approve'
  | 'payment_verify'
  | 'packaging'
  | 'shipping'
  | 'order_return'
  | 'order_cancel';

export interface StaffAccount {
  id: string;
  name: string;
  designation: string;
  email: string;
  username: string;
  passwordPin?: string;
  phone?: string;
  role: 'super_admin' | 'store_manager' | 'inventory_editor' | 'support_staff' | 'custom_staff';
  isSuperAdmin?: boolean;
  fullAccess?: boolean;
  menuPermissions: AdminTabId[];
  orderPermissions: OrderActionPermission[];
  active: boolean;
  addedBy: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export interface StaffLoginLog {
  id: string;
  staffId: string;
  staffName: string;
  designation: string;
  email: string;
  username: string;
  device: string;
  status: 'online' | 'logged_out';
  loginTime: string;
  lastActiveTime: string;
  logoutTime?: string;
  durationMs?: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: ShippingAddress;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  onlineDiscount?: number;
  couponCode?: string;
  deliveryCharge: number;
  deliveryZone: string;
  freeDeliveryApplied?: boolean;
  total: number;
  paymentMethod: PaymentMethod;
  paymentDetails?: PaymentDetails;
  advanceDeliveryPaid?: boolean;
  advanceGateway?: 'bkash' | 'nagad' | 'rocket';
  advanceAmount?: number;
  dueOnDelivery?: number;
  paidAmount?: number;
  dueAmount?: number;
  codCharge?: number;
  netSaleAmount?: number;
  paymentHistory?: CustomerPaymentLog[];
  posCancelReason?: string;
  deliveryRequired?: boolean;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  orderChannel?: 'online' | 'pos';
  pipeline?: OrderPipelineData;
  timeline: OrderTimeline[];
  adminNotes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface HeldPosSale {
  id: string;
  holdNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryRequired: boolean;
  deliveryZoneId?: string;
  deliveryAddress?: string;
  deliveryCharge: number;
  items: OrderItem[];
  subtotal: number;
  discountType: 'fixed' | 'percent';
  discountInput: number;
  discount: number;
  couponCode?: string;
  couponDiscount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paidAmountInput?: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  category?: string;
  notes?: string;
  totalPurchased: number;
  totalPaid: number;
  dueAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseEntry {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  date: string; // YYYY-MM-DD
  items: PurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: 'cash' | 'bank' | 'bkash' | 'nagad' | 'credit';
  stockSynced?: boolean;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'rent'
  | 'salary'
  | 'packaging_courier'
  | 'marketing_ads'
  | 'utilities'
  | 'fabric_tailoring'
  | 'transport'
  | 'maintenance'
  | 'tax_fees'
  | 'other';

export interface ExpenseEntry {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD (Local calendar date)
  time?: string; // HH:mm (24h local time)
  paymentMethod: 'cash' | 'bank' | 'bkash' | 'nagad' | 'rocket';
  paidBy?: string;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SalesTargetsConfig {
  dailyAmountTarget: number;
  dailyPcsTarget: number;
  dailyProfitTarget?: number;
  dailyOrderTarget?: number;
  monthlyAmountTarget: number;
  monthlyPcsTarget: number;
  monthlyProfitTarget: number;
  monthlyOrderTarget?: number;
  lowStockThresholdDefault?: number;
  updatedAt?: string;
}

export interface TargetArchiveRecord {
  id: string; // 'daily_YYYY-MM-DD' or 'monthly_YYYY-MM'
  periodType: 'daily' | 'monthly';
  periodKey: string; // 'YYYY-MM-DD' or 'YYYY-MM'
  label: string;
  targetAmount: number;
  achievedAmount: number;
  targetPcs: number;
  achievedPcs: number;
  targetProfit?: number;
  achievedProfit: number;
  amountPct: number;
  pcsPct: number;
  profitPct?: number;
  orderCount: number;
  status: 'achieved' | 'in_progress' | 'missed';
  closedAt: string;
}

export interface SalesReturnItem {
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  totalRefund: number;
}

export interface SalesReturnEntry {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  returnType: 'full' | 'partial';
  items: SalesReturnItem[];
  totalRefundAmount: number;
  totalCostReversed: number;
  totalReturnedPcs: number;
  restocked: boolean;
  refundMethod: 'cash' | 'bkash' | 'nagad' | 'bank' | 'store_credit' | 'none';
  reason: string;
  date: string; // YYYY-MM-DD local
  processedBy: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed' | 'free_delivery';
  discountAmount: number;
  minOrderAmount: number;
  maxDiscount?: number;
  expiryDate: string;
  usageLimit?: number;
  usedCount: number;
  active: boolean;
  targetCustomerUid?: string;
  targetCustomerEmail?: string;
  targetCustomerPhone?: string;
  targetCustomerName?: string;
  autoApply?: boolean;
  createdAt?: any;
}

export interface DeliveryZone {
  id: string;
  name: string;
  charge: number;
  estimatedDays: string;
  minOrderFree?: number;
  active: boolean;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  customerId: string;
  customerName: string;
  rating: number;
  comment: string;
  verifiedPurchase: boolean;
  approved: boolean;
  createdAt: any;
}

export interface MfsGatewayConfig {
  enabled: boolean;
  accountType: 'Personal (Send Money)' | 'Merchant (Payment)' | 'Agent (Cash In)';
  number: string;
  instructions?: string;
  qrCodeUrl?: string;
}

export interface PaymentSettings {
  codEnabled: boolean;
  onlineDiscountType: 'percentage' | 'fixed';
  onlineDiscountValue: number; // e.g. 5% or ৳50
  onlineDiscountActive: boolean;
  bkash: MfsGatewayConfig;
  nagad: MfsGatewayConfig;
  rocket: MfsGatewayConfig;
}

export interface SiteSettings {
  storeName: string;
  storeDescription: string;
  phone: string;
  email: string;
  address: string;
  whatsapp: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  xUrl?: string;
  announcementText?: string;
  announcementActive: boolean;
  freeDeliveryThreshold?: number;
  paymentSettings?: PaymentSettings;
}

export interface CustomerProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  division?: string;
  thana?: string;
  postalCode?: string;
  createdAt: any;
  disabled?: boolean;
  verifiedDeviceId?: string;
  verifiedDeviceIds?: string[];
  emailVerifiedAt?: string;
  consumedCoupons?: string[];
}

export interface AuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  target: string;
  entityType?: string;
  beforeValue?: string;
  afterValue?: string;
  details?: string;
  timestamp: any;
}

export type NotificationType =
  | 'order_placed'
  | 'order_status'
  | 'payment_update'
  | 'offer'
  | 'coupon'
  | 'announcement'
  | 'admin_new_order'
  | 'admin_workflow_alert';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  audience: 'all' | 'customer' | 'authorized_devices';
  targetUid?: string;
  targetEmail?: string;
  targetPhone?: string;
  targetOrderNumber?: string;
  actionUrl?: string;
  couponCode?: string;
  important?: boolean;
  readBy?: string[];
  createdAt: any;
  createdAtMs: number;
  createdBy?: string;
}

