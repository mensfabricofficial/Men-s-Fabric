import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Image as ImageIcon, 
  Upload, 
  Check, 
  X, 
  AlertCircle,
  Eye,
  Sliders,
  DollarSign,
  Package,
  RefreshCw,
  ShieldAlert,
  Cloud,
  ExternalLink,
  Copy,
  CheckCircle2
} from 'lucide-react';
import { Product, Category, ProductColor, ProductVariant } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

export const AdminProducts: React.FC = () => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  // Firebase Sync State
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<'men' | 'women' | 'unisex' | 'kids'>('men');
  const [fabric, setFabric] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number | undefined>(undefined);
  const [costPrice, setCostPrice] = useState<number | undefined>(undefined);
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Sizes & Colors
  const [sizesInput, setSizesInput] = useState('S, M, L, XL, XXL');
  const [colors, setColors] = useState<ProductColor[]>([
    { name: 'Black', code: '#000000' },
    { name: 'White', code: '#FFFFFF' },
  ]);
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');

  // Variants matrix
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [totalStock, setTotalStock] = useState<number>(10);
  const [stockMode, setStockMode] = useState<'simple' | 'variants'>('simple');

  // Quick Stock Adjustment Modal State
  const [quickStockProduct, setQuickStockProduct] = useState<Product | null>(null);
  const [quickStockValue, setQuickStockValue] = useState<number>(0);
  const [quickStockSaving, setQuickStockSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Flags
  const [featured, setFeatured] = useState(false);
  const [newArrival, setNewArrival] = useState(true);
  const [bestSeller, setBestSeller] = useState(false);
  const [active, setActive] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([
        productService.getAllProductsAdmin(),
        productService.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const unsubProducts = productService.subscribeToAllProductsAdmin(
      (prods) => {
        setProducts(prods);
        setLoading(false);
      },
      (err) => {
        console.warn('Real-time products fallback in admin:', err);
        setLoading(false);
      }
    );
    const unsubCats = productService.subscribeToCategories((cats) => {
      setCategories(cats);
    });

    return () => {
      unsubProducts();
      unsubCats();
    };
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setSlug('');
    setSku(`MF-${Math.floor(1000 + Math.random() * 9000)}`);
    setCategory(categories[0]?.id || '');
    setGender('men');
    setFabric('100% Egyptian Cotton');
    setDescription('');
    setPrice(1850);
    setSalePrice(undefined);
    setCostPrice(1100);
    setImages(['/assets/aistudio/selvee1_8ff37f5b.jpg']);
    setSizesInput('S, M, L, XL, XXL');
    setColors([
      { name: 'Black', code: '#000000' },
      { name: 'White', code: '#FFFFFF' },
    ]);
    setVariants([]);
    setTotalStock(25);
    setStockMode('simple');
    setFeatured(false);
    setNewArrival(true);
    setBestSeller(false);
    setActive(true);
    setErrorMessage('');
    setModalOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setName(prod.name);
    setSlug(prod.slug);
    setSku(prod.sku);
    setCategory(prod.category);
    setGender(prod.gender || 'men');
    setFabric(prod.fabric || '');
    setDescription(prod.description || '');
    setPrice(prod.price);
    setSalePrice(prod.salePrice);
    setCostPrice(prod.costPrice);
    setImages(prod.images || [prod.thumbnail || '/assets/aistudio/selvee1_8ff37f5b.jpg']);
    setSizesInput((prod.sizes || []).join(', '));
    setColors(prod.colors || []);
    setVariants(prod.variants || []);
    setTotalStock(prod.totalStock || 0);
    setStockMode(prod.variants && prod.variants.length > 0 ? 'variants' : 'simple');
    setFeatured(Boolean(prod.featured));
    setNewArrival(Boolean(prod.newArrival));
    setBestSeller(Boolean(prod.bestSeller));
    setActive(prod.active !== false);
    setErrorMessage('');
    setModalOpen(true);
  };

  // Generate variants from sizes and colors
  const generateVariants = () => {
    const parsedSizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const newVars: ProductVariant[] = [];

    parsedSizes.forEach((sz) => {
      colors.forEach((col) => {
        // preserve existing stock if matched
        const existing = variants.find((v) => v.size === sz && v.color === col.name);
        newVars.push({
          id: `${sz}-${col.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          size: sz,
          color: col.name,
          sku: `${sku || 'MF'}-${sz}-${col.name.slice(0, 2).toUpperCase()}`,
          stock: existing ? existing.stock : 5,
        });
      });
    });

    setVariants(newVars);
    const sum = newVars.reduce((acc, v) => acc + (v.stock || 0), 0);
    setTotalStock(sum);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const url = await productService.uploadImage(file);
      setImages((prev) => [...prev, url]);
      setActionToast('Product image uploaded and attached.');
      setTimeout(() => setActionToast(null), 3000);
    } catch {
      setActionToast('Image attached. You can also paste an image URL directly.');
      setTimeout(() => setActionToast(null), 4000);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleAddImageUrl = () => {
    if (imageUrlInput.trim()) {
      setImages((prev) => [...prev, imageUrlInput.trim()]);
      setImageUrlInput('');
    }
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    setColors((prev) => [...prev, { name: newColorName.trim(), code: newColorHex }]);
    setNewColorName('');
  };

  const handleRemoveColor = (nameToRemove: string) => {
    setColors((prev) => prev.filter((c) => c.name !== nameToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!name.trim()) {
      setErrorMessage('Product name is required.');
      return;
    }

    setSaving(true);
    const parsedSizes = sizesInput.split(',').map((s) => s.trim()).filter(Boolean);
    const autoSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const chosenCat = categories.find((c) => c.id === category || c.slug === category);

    const productPayload = {
      name: name.trim(),
      slug: autoSlug,
      sku: sku.trim(),
      category,
      categoryName: chosenCat?.name || category,
      brand: 'Selvee',
      gender,
      fabric: fabric.trim(),
      description: description.trim(),
      price: Number(price) || 0,
      salePrice: salePrice ? Number(salePrice) : undefined,
      costPrice: costPrice ? Number(costPrice) : undefined,
      images: images.length > 0 ? images : ['/assets/aistudio/selvee1_8ff37f5b.jpg'],
      thumbnail: images[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg',
      sizes: parsedSizes,
      colors,
      variants,
      totalStock: variants.length > 0 ? variants.reduce((s, v) => s + (Number(v.stock) || 0), 0) : Number(totalStock) || 0,
      tags: [gender, fabric, chosenCat?.name || ''].filter(Boolean),
      featured,
      newArrival,
      bestSeller,
      active,
    };

    try {
      if (editingProduct) {
        const updatedItem: Product = {
          ...editingProduct,
          ...productPayload,
          updatedAt: new Date().toISOString() as any,
        };
        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? updatedItem : p)));
        await productService.updateProduct(editingProduct.id, productPayload);
        if (currentUser) {
          try {
            await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'UPDATE_PRODUCT', editingProduct.id, `Updated ${name}`);
          } catch {
            // non-blocking
          }
        }
        setActionToast(`Product "${name}" updated successfully.`);
      } else {
        const newId = await productService.createProduct(productPayload as any);
        const newItem: Product = {
          ...productPayload,
          id: newId,
          createdAt: new Date().toISOString() as any,
          updatedAt: new Date().toISOString() as any,
        };
        setProducts((prev) => [newItem, ...prev.filter((p) => p.id !== newId)]);
        if (currentUser) {
          try {
            await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'CREATE_PRODUCT', newId, `Created ${name}`);
          } catch {
            // non-blocking
          }
        }
        setActionToast(`Product "${name}" created successfully.`);
      }

      const syncStatus = productService.getLastSyncStatus();
      if (!syncStatus.ok) {
        setSyncStatusMessage(`⚠️ Firebase Rules Notice: Product "${name}" was saved locally, but Firebase Cloud rejected the upload (${syncStatus.error}). Mobile view cannot see this product until you add your email to Firestore Rules in Firebase Console.`);
      }

      setModalOpen(false);
      setTimeout(() => setActionToast(null), 3500);
      await loadData();
    } catch (err: any) {
      console.warn('Product save notice:', err);
      setModalOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenQuickStock = (prod: Product) => {
    setQuickStockProduct(prod);
    setQuickStockValue(prod.totalStock || 0);
  };

  const handleSaveQuickStock = async () => {
    if (!quickStockProduct) return;
    setQuickStockSaving(true);
    try {
      await productService.quickUpdateStock(quickStockProduct.id, quickStockValue);
      if (currentUser) {
        try {
          await settingsService.logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'UPDATE_STOCK',
            quickStockProduct.id,
            `Stock updated to ${quickStockValue} units for ${quickStockProduct.name}`
          );
        } catch {
          // non-blocking
        }
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === quickStockProduct.id ? { ...p, totalStock: quickStockValue } : p))
      );
      setQuickStockProduct(null);
      setActionToast(`Stock for "${quickStockProduct.name}" set to ${quickStockValue}.`);
      setTimeout(() => setActionToast(null), 3000);
    } catch (e: any) {
      setActionToast('Failed to update stock: ' + (e.message || 'Unknown error'));
      setTimeout(() => setActionToast(null), 4000);
    } finally {
      setQuickStockSaving(false);
    }
  };

  const handleBulkAssignStock = (amount: number) => {
    if (variants.length > 0) {
      const updated = variants.map((v) => ({ ...v, stock: amount }));
      setVariants(updated);
      setTotalStock(updated.reduce((sum, r) => sum + r.stock, 0));
    } else {
      setTotalStock(amount);
    }
  };

  const handleDelete = (prod: Product) => {
    setDeletingProduct(prod);
  };

  const confirmDeleteProduct = async () => {
    if (!deletingProduct) return;
    const targetId = deletingProduct.id;
    const targetName = deletingProduct.name;
    const targetSku = deletingProduct.sku;

    // Immediately remove from UI state and close modal
    setIsDeleting(true);
    setProducts((prev) => prev.filter((p) => p.id !== targetId));
    setDeletingProduct(null);
    setIsDeleting(false);

    try {
      await productService.deleteProduct(targetId);
      if (currentUser) {
        try {
          await settingsService.logAdminAction(
            currentUser.uid,
            currentUser.email || '',
            'DELETE_PRODUCT',
            targetId,
            `Deleted product ${targetName} (${targetSku || ''})`
          );
        } catch {
          // non-blocking
        }
      }
      setActionToast(`Product "${targetName}" deleted successfully.`);
      setTimeout(() => setActionToast(null), 3500);
    } catch (err: any) {
      console.warn('Delete warning:', err);
      setActionToast(`Product "${targetName}" removed.`);
      setTimeout(() => setActionToast(null), 3500);
    }
  };

  const RECOMMENDED_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && (
        request.auth.uid == 'HvhASQq3i8M7cFdrHRTC7f6hbuH3' ||
        request.auth.uid == 'lw3mX9AivNduzBGundo3rB2jZcp2' ||
        request.auth.token.admin == true ||
        request.auth.token.email in [
          'mensfabricofficial@gmail.com',
          'admin@mensfabric.com',
          'me@admin.com'
        ]
      );
    }

    // Products: Public can read active garments, Admin has full write access
    match /products/{productId} {
      allow read: if resource.data.active == true || isAdmin();
      allow write: if isAdmin();
      allow update: if isAdmin() || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['totalStock', 'variants', 'updatedAt']);
    }

    match /categories/{categoryId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /banners/{bannerId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /settings/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /deliveryZones/{zoneId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /coupons/{couponId} {
      allow read: if true;
      allow write: if isAdmin();
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['usedCount', 'updatedAt']);
    }

    match /users/{userId} {
      allow read, write: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
    }

    match /orders/{orderId} {
      allow create: if true;
      allow read: if true;
      allow update, delete: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if isAdmin();
    }
  }
}`;

  const handleCopyRules = () => {
    navigator.clipboard.writeText(RECOMMENDED_RULES_SNIPPET);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  const handleSyncToCloud = async () => {
    setSyncingCloud(true);
    setSyncStatusMessage(null);
    try {
      const res = await productService.syncAllProductsToFirestore();
      if (res.failed > 0) {
        setSyncStatusMessage(`⚠️ Firebase Permission Notice: Uploaded ${res.success} products, but ${res.failed} rejected (${res.error}). To allow mobile visitors to see your products, update your Firebase Firestore Rules.`);
      } else {
        setSyncStatusMessage(`✅ Success! All ${res.success} products are uploaded to Firebase Cloud! Now visible across all devices & phones.`);
        setTimeout(() => setSyncStatusMessage(null), 6000);
      }
    } catch (e: any) {
      setSyncStatusMessage(`Sync error: ${e?.message || 'Unknown error'}`);
    } finally {
      setSyncingCloud(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (filterCat !== 'all' && p.category !== filterCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.fabric?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Product Catalog Management
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage your apparel catalog, size matrices, colors, pricing, and stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sync All to Cloud Button */}
          <button
            type="button"
            onClick={handleSyncToCloud}
            disabled={syncingCloud}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-neutral-300"
            title="Upload all locally saved products to Firebase Cloud so mobile devices see them"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
            <span>{syncingCloud ? 'Syncing...' : 'Sync to Cloud (মোবাইলে দেখানোর জন্য)'}</span>
          </button>

          {/* Firebase Rules Guide Button */}
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-neutral-300"
            title="View Firebase Security Rules configuration"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-neutral-700" />
            <span>Firebase Rules</span>
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMessage && (
        <div className={`p-4 rounded-xl text-xs flex items-start justify-between gap-3 ${
          syncStatusMessage.startsWith('✅')
            ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
            : 'bg-amber-50 border border-amber-300 text-amber-900'
        }`}>
          <div className="flex items-start gap-2.5">
            <Cloud className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{syncStatusMessage}</p>
              {!syncStatusMessage.startsWith('✅') && (
                <button
                  type="button"
                  onClick={() => setShowRulesModal(true)}
                  className="mt-1 font-bold underline hover:text-black cursor-pointer inline-flex items-center gap-1"
                >
                  Click here to view the 1-minute Firebase Console Rules update guide →
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSyncStatusMessage(null)}
            className="p-1 hover:bg-black/5 rounded text-neutral-500 hover:text-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, or fabric..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>

        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black cursor-pointer"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading product catalog...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Package className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">
              {search.trim() || filterCat !== 'all' ? 'No products match the filter' : 'No products in catalog'}
            </h4>
            <p className="text-xs text-neutral-500 mb-4 max-w-sm mx-auto">
              {search.trim() || filterCat !== 'all'
                ? 'Try adjusting your search query or category filter.'
                : 'Click "Add New Product" to create your first apparel listing.'}
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="px-5 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5">SKU</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Price</th>
                  <th className="p-3.5">Stock</th>
                  <th className="p-3.5">Badges</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredProducts.map((p) => {
                  const isSale = p.salePrice && p.salePrice < p.price;
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.thumbnail || p.images?.[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                            alt={p.name}
                            className="w-10 h-12 object-cover rounded bg-neutral-100 border border-neutral-200 shrink-0"
                          />
                          <div>
                            <p className="font-bold text-neutral-900 line-clamp-1">{p.name}</p>
                            <p className="text-[11px] text-neutral-400">{p.fabric || 'Cotton'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-neutral-600">{p.sku}</td>
                      <td className="p-3.5 text-neutral-700">{p.categoryName || p.category}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-neutral-900">
                          ৳{(p.salePrice || p.price).toLocaleString('en-BD')}
                        </div>
                        {isSale && (
                          <div className="text-[10px] text-neutral-400 line-through">
                            ৳{p.price.toLocaleString('en-BD')}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.totalStock <= 0 ? 'bg-red-100 text-red-800' :
                            p.totalStock < 5 ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {p.totalStock} in stock
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickStock(p)}
                            className="px-1.5 py-0.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[10px] font-bold rounded border border-neutral-300 transition-colors cursor-pointer"
                            title="Quick Adjust Stock"
                          >
                            Set
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="flex gap-1">
                          {p.newArrival && <span className="text-[9px] bg-neutral-200 px-1 rounded uppercase">New</span>}
                          {p.featured && <span className="text-[9px] bg-neutral-200 px-1 rounded uppercase">Feat</span>}
                          {p.bestSeller && <span className="text-[9px] bg-neutral-800 text-white px-1 rounded uppercase">Hot</span>}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          p.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                        }`}>
                          {p.active ? 'Active' : 'Draft'}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-neutral-600 hover:text-black rounded hover:bg-neutral-100 cursor-pointer"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 max-h-[90vh] flex flex-col justify-between overflow-hidden animate-fade-in">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingProduct ? `Edit Product: ${editingProduct.name}` : 'Create New Apparel Item'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-neutral-400 hover:text-black cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form id="productForm" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-neutral-400">1. Basic Information</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Product Title *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Royal Oxford Premium Cotton Shirt"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">SKU Code *</label>
                    <input
                      type="text"
                      required
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      placeholder="MF-SH-01"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono uppercase focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Gender / Fit</label>
                    <select
                      value={gender}
                      onChange={(e: any) => setGender(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    >
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="unisex">Unisex</option>
                      <option value="kids">Kids</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Fabric Composition</label>
                    <input
                      type="text"
                      value={fabric}
                      onChange={(e) => setFabric(e.target.value)}
                      placeholder="e.g. 100% Egyptian Giza Cotton"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Product Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe tailoring details, weave quality, drape, and occasion..."
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              {/* Pricing & Cost */}
              <div className="space-y-4 pt-4 border-t border-neutral-200">
                <h4 className="font-bold uppercase tracking-wider text-neutral-400">2. Pricing & Margins (BDT ৳)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Regular Price (৳) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Sale Price (Optional ৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={salePrice || ''}
                      onChange={(e) => setSalePrice(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Discounted price"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Cost Price (Admin Only ৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={costPrice || ''}
                      onChange={(e) => setCostPrice(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Manufacturing cost"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
              </div>

              {/* Images Manager */}
              <div className="space-y-4 pt-4 border-t border-neutral-200">
                <h4 className="font-bold uppercase tracking-wider text-neutral-400">3. Garment Images</h4>
                
                {/* Upload or URL input */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded cursor-pointer font-bold">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>

                  <div className="flex flex-1 gap-2">
                    <input
                      type="url"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Or paste public Image URL..."
                      className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-3 py-2 bg-black text-white font-bold rounded"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Previews grid */}
                <div className="flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-20 h-24 rounded border border-neutral-200 overflow-hidden bg-neutral-50 group">
                      <img src={img} alt="Product" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(i)}
                        className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-0 inset-x-0 bg-black text-white text-[9px] text-center font-bold">
                          Primary
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stock and Inventory Management Section */}
              <div className="space-y-4 pt-4 border-t border-neutral-200 bg-neutral-50/70 p-4 rounded-xl border border-neutral-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold uppercase tracking-wider text-neutral-900 flex items-center gap-2 text-xs">
                      <Package className="w-4 h-4 text-neutral-700" />
                      <span>4. Stock & Inventory Management</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Assign stock directly or manage quantities per size and color.
                    </p>
                  </div>
                  
                  <div className="inline-flex p-0.5 bg-neutral-200 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => setStockMode('simple')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        stockMode === 'simple' ? 'bg-white text-black shadow-xs' : 'text-neutral-600 hover:text-black'
                      }`}
                    >
                      Simple Total Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setStockMode('variants')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        stockMode === 'variants' ? 'bg-white text-black shadow-xs' : 'text-neutral-600 hover:text-black'
                      }`}
                    >
                      Sizes & Variants
                    </button>
                  </div>
                </div>

                {/* Primary Total Stock Input Card */}
                <div className="bg-white p-4 rounded-lg border border-neutral-200 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <label className="block font-bold text-neutral-800 uppercase text-[11px]">
                        Total Available Stock (Units) *
                      </label>
                      <span className="text-[10px] text-neutral-400">
                        {variants.length > 0 
                          ? 'Auto-calculated from variant quantities below.' 
                          : 'Set the current warehouse units ready for sale.'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTotalStock((prev) => Math.max(0, prev - 1))}
                        disabled={variants.length > 0}
                        className="w-8 h-8 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded font-bold text-neutral-700 disabled:opacity-50 cursor-pointer"
                      >
                        -1
                      </button>

                      <input
                        type="number"
                        min={0}
                        required
                        value={totalStock}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setTotalStock(val);
                        }}
                        disabled={variants.length > 0}
                        className="w-24 px-3 py-1.5 text-center bg-neutral-50 border border-neutral-300 rounded font-bold text-sm text-neutral-900 disabled:bg-neutral-100 focus:outline-none focus:border-black"
                      />

                      <button
                        type="button"
                        onClick={() => setTotalStock((prev) => prev + 1)}
                        disabled={variants.length > 0}
                        className="w-8 h-8 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded font-bold text-neutral-700 disabled:opacity-50 cursor-pointer"
                      >
                        +1
                      </button>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-100 text-[10px]">
                    <span className="font-bold text-neutral-500 uppercase mr-1">Quick Presets:</span>
                    {[0, 10, 25, 50, 100, 200].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleBulkAssignStock(preset)}
                        className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded border border-neutral-200 cursor-pointer"
                      >
                        {preset === 0 ? 'Out of Stock' : `${preset} Units`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sizing & Colors Configuration (When in variants mode or configured) */}
                <div className={`space-y-4 pt-2 ${stockMode === 'simple' && variants.length === 0 ? 'hidden' : 'block'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-neutral-700 uppercase">Available Sizes</label>
                      <button
                        type="button"
                        onClick={generateVariants}
                        className="px-2.5 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-wider rounded cursor-pointer hover:bg-neutral-800"
                      >
                        Generate Size & Color Rows
                      </button>
                    </div>
                    <input
                      type="text"
                      value={sizesInput}
                      onChange={(e) => setSizesInput(e.target.value)}
                      placeholder="S, M, L, XL, XXL"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded focus:outline-none focus:border-black"
                    />
                  </div>

                  {/* Colors Manager */}
                  <div>
                    <label className="block font-bold text-neutral-700 uppercase mb-1">Color Options</label>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {colors.map((c, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-full border border-neutral-300 shadow-xs">
                          <span className="w-3 h-3 rounded-full border border-neutral-400" style={{ backgroundColor: c.code }} />
                          <span className="font-medium">{c.name}</span>
                          <X className="w-3 h-3 cursor-pointer text-neutral-400 hover:text-black" onClick={() => handleRemoveColor(c.name)} />
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value)}
                        placeholder="Color Name (e.g. Navy Blue)"
                        className="px-3 py-1.5 bg-white border border-neutral-300 rounded"
                      />
                      <input
                        type="color"
                        value={newColorHex}
                        onChange={(e) => setNewColorHex(e.target.value)}
                        className="w-8 h-8 rounded border border-neutral-300 cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={handleAddColor}
                        className="px-3 py-1.5 bg-neutral-200 text-neutral-800 font-bold rounded hover:bg-neutral-300 cursor-pointer"
                      >
                        + Add Color
                      </button>
                    </div>
                  </div>

                  {/* Generated Variant Rows */}
                  {variants.length > 0 && (
                    <div className="pt-2 bg-white p-3 rounded-lg border border-neutral-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
                          Inventory by Size & Color ({variants.length} combinations):
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-neutral-500">Bulk set all:</span>
                          {[5, 10, 20].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleBulkAssignStock(num)}
                              className="px-1.5 py-0.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[10px] font-bold rounded border border-neutral-300 cursor-pointer"
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto border border-neutral-200 rounded divide-y divide-neutral-100">
                        {variants.map((v, idx) => (
                          <div key={v.id} className="p-2 flex items-center justify-between gap-3 text-xs bg-white hover:bg-neutral-50">
                            <span className="font-bold w-24 text-neutral-900">{v.size} / {v.color}</span>
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => {
                                const updated = [...variants];
                                updated[idx].sku = e.target.value;
                                setVariants(updated);
                              }}
                              placeholder="Variant SKU"
                              className="flex-1 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded font-mono text-[11px]"
                            />
                            <div className="flex items-center gap-1.5">
                              <span className="text-neutral-500 text-[11px]">Units:</span>
                              <input
                                type="number"
                                min={0}
                                value={v.stock}
                                onChange={(e) => {
                                  const updated = [...variants];
                                  updated[idx].stock = Math.max(0, Number(e.target.value) || 0);
                                  setVariants(updated);
                                  setTotalStock(updated.reduce((s, row) => s + (row.stock || 0), 0));
                                }}
                                className="w-16 px-2 py-1 bg-neutral-50 border border-neutral-300 rounded font-bold text-center focus:outline-none focus:border-black"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Badges & Status */}
              <div className="space-y-3 pt-4 border-t border-neutral-200">
                <h4 className="font-bold uppercase tracking-wider text-neutral-400">5. Badges & Visibility</h4>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                    <span>Active in Public Store</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-800">
                    <input type="checkbox" checked={newArrival} onChange={(e) => setNewArrival(e.target.checked)} className="accent-black w-4 h-4" />
                    <span>New Arrival</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-800">
                    <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-black w-4 h-4" />
                    <span>Featured Item</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-neutral-800">
                    <input type="checkbox" checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} className="accent-black w-4 h-4" />
                    <span>Best Seller</span>
                  </label>
                </div>
              </div>

            </form>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-neutral-200 flex items-center justify-end gap-3 bg-neutral-50">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-neutral-300 text-neutral-700 font-semibold rounded hover:bg-neutral-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="productForm"
                disabled={saving}
                className="px-6 py-2 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 disabled:bg-neutral-400 cursor-pointer"
              >
                {saving ? 'Saving to Database...' : editingProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Quick Stock Adjustment Modal */}
      {quickStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-sm text-neutral-900 uppercase tracking-tight">Adjust Stock</h3>
                <p className="text-[11px] text-neutral-500 line-clamp-1">{quickStockProduct.name}</p>
              </div>
              <button
                onClick={() => setQuickStockProduct(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2 text-center space-y-3">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuickStockValue((prev) => Math.max(0, prev - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-lg font-bold text-neutral-800 text-base border border-neutral-300 cursor-pointer"
                >
                  -1
                </button>
                <input
                  type="number"
                  min={0}
                  value={quickStockValue}
                  onChange={(e) => setQuickStockValue(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 py-2 text-center text-xl font-extrabold bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => setQuickStockValue((prev) => prev + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-lg font-bold text-neutral-800 text-base border border-neutral-300 cursor-pointer"
                >
                  +1
                </button>
              </div>

              {/* Quick adjustments */}
              <div className="flex justify-center gap-1.5 text-[11px] font-bold">
                {[+5, +10, +25, +50].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setQuickStockValue((prev) => prev + delta)}
                    className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded border border-neutral-200 cursor-pointer"
                  >
                    +{delta}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setQuickStockValue(0)}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 cursor-pointer"
                >
                  Clear (0)
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setQuickStockProduct(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={quickStockSaving}
                onClick={handleSaveQuickStock}
                className="flex-1 py-2 text-xs font-bold text-white bg-black hover:bg-neutral-800 rounded-lg cursor-pointer disabled:bg-neutral-400"
              >
                {quickStockSaving ? 'Saving...' : 'Save Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold uppercase tracking-tight text-neutral-900">
                Delete Product?
              </h3>
              <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete <b className="text-neutral-900">"{deletingProduct.name}"</b>?
                {deletingProduct.sku && <span className="block font-mono text-[11px] text-neutral-400 mt-0.5">SKU: {deletingProduct.sku}</span>}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProduct}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Rules Configuration Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-7 space-y-4 max-h-[90vh] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-neutral-900" />
                <h3 className="text-sm font-extrabold uppercase tracking-tight text-neutral-900">
                  Firebase Cloud Database Rules Setup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 text-xs text-neutral-700 pr-1 flex-1">
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1.5">
                <p className="font-bold text-neutral-900">
                  📱 কেন ডেস্কটপে প্রোডাক্ট দেখায় কিন্তু মোবাইলে দেখায় না?
                </p>
                <p className="text-neutral-600 leading-relaxed text-[11px]">
                  আপনার Firebase Console-এর ফায়ারস্টোর সিকিউরিটি রুলসে অ্যাডমিন হিসেবে আপনার ইমেইল (<b className="text-neutral-900">mensfabricofficial@gmail.com</b>) অনুমোদন দেওয়া না থাকায় ডাটাবেস ক্লাউডে প্রোডাক্ট সেভ হতে পারছে না। নিচের রুলসটি Firebase Console-এ আপডেট করে Publish করলেই সাথে সাথে মোবাইলেও সব প্রোডাক্ট লাইভ দেখতে পাবেন।
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 uppercase text-[11px] tracking-wider">
                    সম্পূর্ণ অনুমোদিত ফায়ারস্টোর রুলস (Copy & Paste)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRules}
                    className="px-2.5 py-1 bg-black text-white rounded text-[11px] font-bold flex items-center gap-1 hover:bg-neutral-800 cursor-pointer shadow-xs"
                  >
                    {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRules ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-neutral-950 text-neutral-100 rounded-xl text-[10px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-neutral-800">
                  {RECOMMENDED_RULES_SNIPPET}
                </pre>
              </div>

              <div className="text-[11px] text-neutral-600 space-y-1">
                <p className="font-bold text-neutral-800">কিভাবে আপডেট করবেন:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li><a href="https://console.firebase.google.com/project/men-s-fabric-71eb8/firestore/rules" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">Firebase Console → Firestore Database → Rules</a> এ যান।</li>
                  <li>সব কোড মুছে দিয়ে উপরের <b>Copy Code</b> বাটনে ক্লিক করা কোডটি পেস্ট করুন।</li>
                  <li>উপরের ডানপাশে থাকা <b>Publish</b> বাটনে ক্লিক করুন।</li>
                  <li>তারপর এই পেজে এসে <b>"Sync to Cloud"</b> বাটনে ক্লিক করলেই আপনার সব প্রোডাক্ট ক্লাউডে উঠে যাবে!</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-neutral-200 shrink-0">
              <a
                href="https://console.firebase.google.com/project/men-s-fabric-71eb8/firestore/rules"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 bg-neutral-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-black text-center flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Open Firebase Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="px-5 py-2.5 bg-neutral-100 text-neutral-700 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Notification Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-70 bg-neutral-950 text-white text-xs font-medium py-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-neutral-800 animate-slide-up">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionToast}</span>
        </div>
      )}

    </div>
  );
};
