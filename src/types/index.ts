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
  brand: string;
  gender: 'men' | 'women' | 'unisex' | 'kids';
  fabric: string;
  images: string[];
  thumbnail: string;
  price: number;
  salePrice?: number;
  costPrice?: number; // Admin only
  sizes: string[];
  colors: ProductColor[];
  variants: ProductVariant[];
  totalStock: number;
  weight?: string;
  tags: string[];
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  active: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: any;
  updatedAt: any;
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
  totalPrice: number;
  sku?: string;
}

export interface OrderTimeline {
  status: OrderStatus;
  timestamp: string;
  note?: string;
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
  couponCode?: string;
  deliveryCharge: number;
  deliveryZone: string;
  total: number;
  paymentMethod: 'cod' | 'bkash' | 'nagad' | 'card';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  timeline: OrderTimeline[];
  adminNotes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountAmount: number;
  minOrderAmount: number;
  maxDiscount?: number;
  expiryDate: string;
  usageLimit?: number;
  usedCount: number;
  active: boolean;
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
  announcementText?: string;
  announcementActive: boolean;
  freeDeliveryThreshold?: number;
}

export interface CustomerProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  createdAt: any;
  disabled?: boolean;
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
