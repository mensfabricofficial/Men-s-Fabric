# MEN'S FABRIC — E-Commerce Platform

A production-ready clothing e-commerce website for **MEN'S FABRIC**, tailored for the Bangladesh market.

---

## 💎 Features

- **No Demo Data**: The store initializes with an empty database. All products, categories, banners, and orders are driven exclusively by live Firebase data.
- **Brand Identity**: Monochromatic Black (`#000000`) & White (`#FFFFFF`) luxury fashion aesthetic inspired by clean Bangladeshi boutique storefronts.
- **Official Brand Assets**: Features the official `MEN'S FABRIC (Clothing Brand)` logo across customer headers, mobile drawers, invoices, and the admin panel.
- **Bangladesh Localization**:
  - Currency: BDT (৳)
  - Timezone: `Asia/Dhaka`
  - Delivery Zones: Inside Dhaka (৳70) & Nationwide Outside Dhaka (৳130)
  - Payment: Cash on Delivery (COD) with full customer inspection prior to payment.
- **Security & Authorization**:
  - Primary Administrator UID: `HvhASQq3i8M7cFdrHRTC7f6hbuH3` (`me@admin.com`)
  - Server-side atomic order verification and inventory deduction.
  - Zero-trust client pricing: Discounts, item prices, and delivery charges are re-verified against Firestore.
  - Least-privilege `firestore.rules` and `storage.rules`.
- **Admin Panel (`/admin`)**:
  - Real metrics: Orders, Pending, Revenue, Product count, Low-stock alerts, Customers.
  - Product catalog management with Size × Color variant inventory matrix.
  - Category manager, order fulfillment with timeline updates, and printable invoices.
  - Coupon management, delivery zone configuration, banners, reviews moderation, and audit logs.
- **Optimized for cPanel (Apache) Static Deployment**:
  - Pre-configured `public/.htaccess` with mod_rewrite rules for Single Page Application (SPA) routing (prevents 404 errors on page reload).
  - Dedicated `src/lib/firebaseConfig.ts` for editing credentials.

---

## 🛠 Technology Stack

- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Backend / DB**: Firebase Web SDK (Firestore, Auth, Storage)
- **Deployment Target**: Apache / cPanel / Netlify / Vercel / Firebase Hosting

---

## 📁 Project Structure

```
├── public/
│   ├── .htaccess                # Apache SPA routing rules for cPanel
│   ├── logo.jpg                 # Official MEN'S FABRIC logo
│   └── assets/                  # Original brand assets
├── src/
│   ├── admin/                   # Admin portal components (/admin)
│   │   ├── AdminLayout.tsx
│   │   ├── AdminLogin.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── AdminProducts.tsx
│   │   ├── AdminCategories.tsx
│   │   ├── AdminOrders.tsx
│   │   ├── AdminCoupons.tsx
│   │   ├── AdminDelivery.tsx
│   │   ├── AdminBanners.tsx
│   │   ├── AdminCustomers.tsx
│   │   ├── AdminReviews.tsx
│   │   ├── AdminSettings.tsx
│   │   └── AdminAudit.tsx
│   ├── components/
│   │   ├── cart/CartDrawer.tsx
│   │   ├── common/EmptyState.tsx
│   │   ├── common/SkeletonLoader.tsx
│   │   ├── layout/Header.tsx
│   │   ├── layout/Footer.tsx
│   │   └── product/ProductCard.tsx & ProductGrid.tsx
│   ├── context/
│   │   ├── AuthContext.tsx       # Auth & Admin role checking
│   │   ├── CartContext.tsx       # Cart, zones, coupon calculations
│   │   └── WishlistContext.tsx   # Wishlist state
│   ├── lib/
│   │   ├── firebase.ts           # Centralized Firebase initialization
│   │   └── firebaseConfig.ts     # Firebase API credentials & Admin UID
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── ShopPage.tsx
│   │   ├── ProductDetailsPage.tsx
│   │   ├── CheckoutPage.tsx
│   │   ├── OrderConfirmationPage.tsx
│   │   ├── TrackOrderPage.tsx
│   │   ├── AccountPage.tsx
│   │   ├── WishlistPage.tsx
│   │   └── StaticPages.tsx       # About, Contact, FAQ, Size Guide, Policies
│   ├── services/
│   │   ├── productService.ts     # Catalog queries & image upload
│   │   ├── orderService.ts       # Atomic checkout transactions & order tracking
│   │   └── settingsService.ts    # Store settings, banners, coupons, reviews
│   ├── types/index.ts            # TypeScript definitions
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Composite indexes
├── storage.rules                 # Firebase Storage security rules
├── vite.config.ts
└── package.json
```

---

## 🚀 How to Build & Deploy to cPanel (Apache)

1. **Build the production bundle**:
   ```bash
   npm run build
   ```
   This generates the compiled static files in the `dist/` directory, including `.htaccess`.

2. **Upload to cPanel**:
   - Log in to your **cPanel**.
   - Navigate to **File Manager** -> `public_html` (or your domain/subdomain root folder).
   - Upload all files from inside the local `dist/` folder into `public_html/`.
   - Ensure the `.htaccess` file is uploaded. In cPanel File Manager, make sure **"Show Hidden Files (dotfiles)"** is enabled in Settings.

3. **Verify Routing**:
   - The included `.htaccess` automatically routes all requests (`/shop`, `/checkout`, `/admin`, `/product/...`) to `index.html`, eliminating 404 errors on browser refresh.

---

## 🔐 Administrator Access

- **Admin URL**: `https://your-domain.com/admin`
- **Configured Admin UID**: `HvhASQq3i8M7cFdrHRTC7f6hbuH3`
- **Configured Admin Email**: `me@admin.com`

---

## 🛡️ Firestore & Storage Rules Deployment

Deploy the provided rules to your Firebase project:

```bash
firebase deploy --only firestore:rules,storage,firestore:indexes
```
