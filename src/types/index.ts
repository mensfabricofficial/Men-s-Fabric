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
  upazila?: string;
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

export type PaymentMethod = 'cod' | 'bkash' | 'nagad' | 'rocket';

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
  | 'completed'
  | 'returned'
  | 'cancelled';

export interface OrderPipelineStepLog {
  stage: OrderPipelineStage;
  handlerName: string;
  handlerEmail?: string;
  action: string;
  note?: string;
  timestamp: string;
}

export interface OrderPipelineData {
  currentStage: OrderPipelineStage;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedAt?: string;
  paymentNote?: string;
  inventoryHandledBy?: string;
  inventoryHandledAt?: string;
  inventoryNote?: string;
  deliveryHandledBy?: string;
  deliveryDispatchedAt?: string;
  deliveredAt?: string;
  returnedBy?: string;
  returnedAt?: string;
  returnNote?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelNote?: string;
  courierName?: string;
  trackingNumber?: string;
  deliveryNote?: string;
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
  | 'pnl'
  | 'pipeline'
  | 'orders'
  | 'products'
  | 'purchases'
  | 'suppliers'
  | 'expenses'
  | 'categories'
  | 'customers'
  | 'reviews'
  | 'coupons'
  | 'delivery'
  | 'banners'
  | 'notifications'
  | 'settings'
  | 'admins'
  | 'audit';

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
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  orderChannel?: 'online' | 'pos';
  pipeline?: OrderPipelineData;
  timeline: OrderTimeline[];
  adminNotes?: string;
  createdAt: any;
  updatedAt: any;
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
  monthlyAmountTarget: number;
  monthlyPcsTarget: number;
  monthlyProfitTarget: number;
  updatedAt?: string;
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
  | 'admin_new_order';

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

