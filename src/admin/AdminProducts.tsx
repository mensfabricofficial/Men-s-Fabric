import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Upload,
  Check,
  X,
  AlertCircle,
  Package,
  ShieldAlert,
  Cloud,
  ExternalLink,
  Copy,
  History,
  ArrowLeft,
  ChevronDown,
  RefreshCw,
  Save,
  ImagePlus,
} from 'lucide-react';
import {
  Product,
  Category,
  ProductColor,
  ProductVariant,
  StockMovementEntry,
  SalesTargetsConfig,
  Supplier,
} from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { posService } from '../services/posService';
import { useAuth } from '../context/AuthContext';
import { computeStockAudit } from '../lib/accountingUtils';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

const COLOR_HEX_MAP: Record<string, string> = {
  black: '#111827',
  white: '#FFFFFF',
  'off white': '#FAF9F6',
  ivory: '#FFFFF0',
  cream: '#FFFDD0',
  beige: '#E5D3B3',
  khaki: '#C3B091',
  navy: '#1E3A8A',
  'navy blue': '#1E3A8A',
  blue: '#2563EB',
  'royal blue': '#1D4ED8',
  'sky blue': '#38BDF8',
  maroon: '#800000',
  burgundy: '#6B0F1A',
  red: '#DC2626',
  green: '#16A34A',
  olive: '#4D7C0F',
  emerald: '#059669',
  teal: '#0D9488',
  grey: '#6B7280',
  gray: '#6B7280',
  ash: '#9CA3AF',
  charcoal: '#374151',
  brown: '#78350F',
  chocolate: '#5C3317',
  mustard: '#CA8A04',
  yellow: '#EAB308',
  orange: '#EA580C',
  pink: '#EC4899',
  purple: '#7E22CE',
  silver: '#CBD5E1',
  gold: '#D97706',
};

const parseColorsFromText = (raw: string, existing: ProductColor[] = []): ProductColor[] => {
  const parts = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return parts.map((label) => {
    const prev = existing.find((c) => c.name.toLowerCase() === label.toLowerCase());
    if (prev) return prev;
    const mapped = COLOR_HEX_MAP[label.toLowerCase()] || '#1F2937';
    return { name: label, code: mapped };
  });
};

const generateEanBarcode = (): string => {
  const suffix = String(Math.floor(1000000000 + Math.random() * 9000000000));
  return `890${suffix}`;
};

export const AdminProducts: React.FC = () => {
  const { currentUser, staffProfile } = useAuth();
  const [products, setProducts] = useState<Product[]>(() => productService.getInstantAllProducts());
  const [categories, setCategories] = useState<Category[]>(
    () => productService.getInstantCategories() ?? productService.getLocalCategories()
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => posService.getLocalSuppliers());
  const [movements, setMovements] = useState<StockMovementEntry[]>(() => productService.getInstantStockMovements());
  const [targets, setTargets] = useState<SalesTargetsConfig>(() => posService.getInstantTargets());
  const [loading, setLoading] = useState(() => productService.getInstantAllProducts().length === 0);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [viewMode, setViewMode] = useState<'catalog' | 'history'>('catalog');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number>(
    () => posService.getInstantTargets().lowStockThresholdDefault || 5
  );
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Firebase Sync State (shown only when cloud sync fails)
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  // Add / Edit Product Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [brandSupplier, setBrandSupplier] = useState('');
  const [gender, setGender] = useState<'men' | 'women' | 'unisex' | 'kids'>('men');
  const [fabric, setFabric] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [salePrice, setSalePrice] = useState<number | undefined>(undefined);
  const [costPrice, setCostPrice] = useState<number | undefined>(undefined);
  const [minStock, setMinStock] = useState<number | undefined>(5);
  const [images, setImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Sizes & Colors
  const [sizesInput, setSizesInput] = useState('Free Size');
  const [colorsInput, setColorsInput] = useState('');
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');

  // Variants matrix
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [totalStock, setTotalStock] = useState<number>(0);
  const [stockMode, setStockMode] = useState<'simple' | 'variants'>('simple');

  // Quick Stock Adjustment Modal State
  const [quickStockProduct, setQuickStockProduct] = useState<Product | null>(null);
  const [quickStockMode, setQuickStockMode] = useState<'set' | 'add' | 'damaged'>('set');
  const [quickStockValue, setQuickStockValue] = useState<number>(0);
  const [quickStockReason, setQuickStockReason] = useState('');
  const [quickStockSaving, setQuickStockSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Visibility Flags
  const [featured, setFeatured] = useState(false);
  const [newArrival, setNewArrival] = useState(true);
  const [bestSeller, setBestSeller] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
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
    const unsubSuppliers = posService.subscribeToSuppliers(setSuppliers);
    const unsubMovements = productService.subscribeToStockMovements(setMovements);
    const unsubTargets = posService.subscribeToTargets((t) => {
      setTargets(t);
      setThresholdDraft(t.lowStockThresholdDefault || 5);
    });

    return () => {
      unsubProducts();
      unsubCats();
      unsubSuppliers();
      unsubMovements();
      unsubTargets();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    if (!category && categories.length > 0) {
      setCategory(categories[0].id);
    }
    if (!brandSupplier && suppliers.length > 0) {
      setBrandSupplier(suppliers[0].id);
    }
  }, [modalOpen, categories, suppliers, category, brandSupplier]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const selectedProductMovements = useMemo(() => {
    if (!selectedProduct) return [];
    return movements.filter((m) => m.productId === selectedProduct.id).slice(0, 8);
  }, [movements, selectedProduct]);

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setSlug('');
    setSku('');
    setBarcode('');
    setCategory(categories[0]?.id || '');
    setBrandSupplier(suppliers[0]?.id || '');
    setGender('men');
    setFabric('');
    setDescription('');
    setPrice(undefined);
    setSalePrice(undefined);
    setCostPrice(undefined);
    setMinStock(globalLowThreshold || 5);
    setImages([]);
    setImageUrlInput('');
    setSizesInput('');
    setColorsInput('');
    setColors([]);
    setVariants([]);
    setTotalStock(0);
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
    setName(prod.name || '');
    setSlug(prod.slug || '');
    setSku(prod.sku || '');
    setBarcode(prod.barcode || '');
    const validCat = categories.find((c) => c.id === prod.category || c.slug === prod.category);
    setCategory(validCat?.id || categories[0]?.id || '');
    if (prod.supplierId && suppliers.some((s) => s.id === prod.supplierId)) {
      setBrandSupplier(prod.supplierId);
    } else if (prod.supplierName) {
      const matchedSup = suppliers.find((s) => s.name.toLowerCase() === prod.supplierName?.toLowerCase());
      setBrandSupplier(matchedSup?.id || suppliers[0]?.id || '');
    } else {
      setBrandSupplier(suppliers[0]?.id || '');
    }
    setGender(prod.gender || 'men');
    setFabric(prod.fabric || '');
    setDescription(prod.description || '');
    setPrice(prod.price || 0);
    setSalePrice(prod.salePrice);
    setCostPrice(prod.costPrice);
    setMinStock(prod.minStock || globalLowThreshold || 5);
    setImages(prod.images?.length ? prod.images : prod.thumbnail ? [prod.thumbnail] : []);
    setImageUrlInput('');
    setSizesInput((prod.sizes || []).length > 0 ? prod.sizes.join(', ') : '');
    setColors(prod.colors || []);
    setColorsInput((prod.colors || []).map((c) => c.name).join(', '));
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

  const generateVariants = () => {
    const parsedSizes = sizesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const activeColors =
      colors.length > 0
        ? colors
        : colorsInput.trim()
        ? parseColorsFromText(colorsInput, colors)
        : [{ name: 'Standard', code: '#111827' }];
    const newVars: ProductVariant[] = [];

    parsedSizes.forEach((sz) => {
      activeColors.forEach((col) => {
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const url = await productService.uploadImage(files[i]);
        if (url) uploadedUrls.push(url);
      }
      if (uploadedUrls.length > 0) {
        setImages((prev) => [...prev, ...uploadedUrls]);
        setActionToast(
          uploadedUrls.length === 1
            ? 'Product image uploaded and attached.'
            : `${uploadedUrls.length} product images uploaded.`
        );
        setTimeout(() => setActionToast(null), 3000);
      }
    } catch {
      setActionToast('Image attach error. You can also paste an image URL directly.');
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

  const handleSetPrimaryImage = (idx: number) => {
    if (idx <= 0) return;
    setImages((prev) => {
      const picked = prev[idx];
      if (!picked) return prev;
      return [picked, ...prev.filter((_, i) => i !== idx)];
    });
  };

  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    setColors((prev) => {
      const next = [...prev, { name: newColorName.trim(), code: newColorHex }];
      setColorsInput(next.map((c) => c.name).join(', '));
      return next;
    });
    setNewColorName('');
  };

  const handleRemoveColor = (nameToRemove: string) => {
    setColors((prev) => {
      const next = prev.filter((c) => c.name !== nameToRemove);
      setColorsInput(next.map((c) => c.name).join(', '));
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const numericSellPrice = Number(price) || 0;
    const numericCostPrice = Number(costPrice) || 0;
    const numericDiscountPrice = salePrice ? Number(salePrice) : 0;

    if (!name.trim()) {
      setErrorMessage('Product Name is required.');
      return;
    }
    if (!sku.trim()) {
      setErrorMessage('SKU / Code is required.');
      return;
    }

    const chosenCat = categories.find((c) => c.id === category || c.slug === category);
    if (!chosenCat) {
      setErrorMessage(
        categories.length === 0
          ? 'No categories found. Please create a Category first before adding products.'
          : 'Please select a Category.'
      );
      return;
    }

    const matchedSupplier = suppliers.find((s) => s.id === brandSupplier);
    if (!matchedSupplier) {
      setErrorMessage(
        suppliers.length === 0
          ? 'No suppliers found. Please create a Supplier first before adding products.'
          : 'Please select a Supplier.'
      );
      return;
    }

    if (numericSellPrice <= 0) {
      setErrorMessage('Please enter a valid Selling Price.');
      return;
    }

    setSaving(true);
    const parsedSizes = sizesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedColors = colorsInput.trim()
      ? parseColorsFromText(colorsInput, colors)
      : colors;

    const autoSlug =
      slug.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const cleanImages = images.length > 0 ? images : ['/assets/aistudio/selvee1_8ff37f5b.jpg'];

    const productPayload = {
      name: name.trim(),
      slug: autoSlug,
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim() || undefined,
      category: chosenCat.id,
      categoryName: chosenCat.name,
      brand: 'Selvee',
      supplierId: matchedSupplier.id,
      supplierName: matchedSupplier.name,
      gender,
      fabric: fabric.trim(),
      description: description.trim(),
      price: numericSellPrice,
      salePrice: numericDiscountPrice > 0 && numericDiscountPrice < numericSellPrice ? numericDiscountPrice : undefined,
      costPrice: numericCostPrice > 0 ? numericCostPrice : undefined,
      minStock: minStock !== undefined && minStock > 0 ? Number(minStock) : 5,
      images: cleanImages,
      thumbnail: cleanImages[0],
      sizes: parsedSizes.length > 0 ? parsedSizes : ['Free Size'],
      colors: parsedColors,
      variants,
      totalStock:
        variants.length > 0
          ? variants.reduce((s, v) => s + (Number(v.stock) || 0), 0)
          : Math.max(0, Number(totalStock) || 0),
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
            await settingsService.logAdminAction(
              currentUser.uid,
              currentUser.email || '',
              'UPDATE_PRODUCT',
              editingProduct.id,
              `Updated ${name}`
            );
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
            await settingsService.logAdminAction(
              currentUser.uid,
              currentUser.email || '',
              'CREATE_PRODUCT',
              newId,
              `Created ${name}`
            );
          } catch {
            // non-blocking
          }
        }
        setActionToast(`Product "${name}" created successfully.`);
      }

      const syncStatus = productService.getLastSyncStatus();
      if (!syncStatus.ok) {
        setSyncStatusMessage(
          `Product "${name}" saved locally, but cloud sync failed (${syncStatus.error}). Update Firestore Rules in Firebase Console.`
        );
      }

      setModalOpen(false);
      setTimeout(() => setActionToast(null), 3500);
    } catch (err: any) {
      console.warn('Product save notice:', err);
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
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
        try {
          await settingsService.logAdminAction(
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
          );
        } catch {
          // non-blocking
        }
      }
      if (updatedProd) {
        setProducts((prev) =>
          prev.map((p) => (p.id === quickStockProduct.id ? updatedProd : p))
        );
      }
      setQuickStockProduct(null);
      setActionToast(`Stock for "${quickStockProduct.name}" updated to ${finalStock} pcs.`);
      setTimeout(() => setActionToast(null), 3000);
    } catch (e: any) {
      setActionToast('Failed to update stock: ' + (e.message || 'Unknown error'));
      setTimeout(() => setActionToast(null), 4000);
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
      setActionToast(`Low stock alert threshold set to ${next.lowStockThresholdDefault} pcs.`);
      setTimeout(() => setActionToast(null), 3000);
    } finally {
      setSavingThreshold(false);
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

    setIsDeleting(true);
    setProducts((prev) => prev.filter((p) => p.id !== targetId));
    if (selectedProductId === targetId) setSelectedProductId(null);
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
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.fabric || '').toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredMovements = movements.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.productName || '').toLowerCase().includes(q) ||
      (m.sku || '').toLowerCase().includes(q) ||
      (m.reason || '').toLowerCase().includes(q) ||
      (m.referenceId || '').toLowerCase().includes(q) ||
      (m.staffName || '').toLowerCase().includes(q)
    );
  });

  const baseModalPrice = Number(price) || 0;
  const effectiveModalPrice = salePrice && salePrice < baseModalPrice ? salePrice : baseModalPrice;
  const modalUnitMargin =
    typeof costPrice === 'number' && costPrice > 0 && effectiveModalPrice > 0
      ? effectiveModalPrice - costPrice
      : null;

  return (
    <div className="space-y-4">
      {!selectedProduct && (
        <>
          <AdminPageHeader
            title="Products"
            subtitle={`${products.length} catalog items · ${stockAudit.totalStockPcs.toLocaleString('en-BD')} pcs total stock`}
            actions={
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </button>
            }
          />

          {/* Sync Status Notice (only rendered on sync error) */}
          {syncStatusMessage && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Cloud className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{syncStatusMessage}</p>
                  <button
                    type="button"
                    onClick={() => setShowRulesModal(true)}
                    className="mt-1 font-bold underline hover:text-black cursor-pointer"
                  >
                    View Firestore Rules Setup →
                  </button>
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

          {/* Compact Thermal Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                01. Total Stock Qty
              </span>
              <p className="text-xl sm:text-2xl font-bold font-mono text-neutral-950 mt-1">
                {stockAudit.totalStockPcs.toLocaleString('en-BD')} <span className="text-xs font-medium text-neutral-500">pcs</span>
              </p>
              <span className="text-[11px] text-neutral-400">
                {stockAudit.activeProducts} active listings
              </span>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                02. Stock Cost Value
              </span>
              <p className="text-xl sm:text-2xl font-bold font-mono text-neutral-950 mt-1">
                ৳{stockAudit.stockCostValue.toLocaleString('en-BD')}
              </p>
              <span className="text-[11px] text-neutral-400">Wholesale cost on hand</span>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                03. Stock Selling Value
              </span>
              <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 mt-1">
                ৳{stockAudit.stockSellingValue.toLocaleString('en-BD')}
              </p>
              <span className="text-[11px] text-neutral-400">Potential retail value</span>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                04. Stock Alerts
              </span>
              <div className="flex items-baseline gap-2 mt-1 font-mono">
                <span className="text-xl sm:text-2xl font-bold text-amber-700">
                  {stockAudit.lowStockCount}
                </span>
                <span className="text-[11px] text-neutral-400">low ·</span>
                <span className="text-xl sm:text-2xl font-bold text-red-700">
                  {stockAudit.outOfStockCount}
                </span>
                <span className="text-[11px] text-neutral-400">out</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-neutral-500 font-mono">Alert ≤</span>
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
                  className="px-2 py-0.5 bg-black text-white text-[10px] font-mono font-bold rounded cursor-pointer hover:bg-neutral-800 disabled:opacity-40"
                >
                  {savingThreshold ? '...' : 'Set'}
                </button>
              </div>
            </div>
          </div>

          {/* Main Products Card matching clean editorial / thermal ledger aesthetic */}
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
            {/* Top #f4f4f5 Strip: View Filter + Category + Search */}
            <div className="bg-[#f4f4f5] border-b border-neutral-200 px-5 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="inline-flex items-center gap-1 p-0.5 bg-white border border-neutral-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('catalog');
                      setStockFilter('all');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'catalog' && stockFilter === 'all'
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    All ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('catalog');
                      setStockFilter('low');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'catalog' && stockFilter === 'low'
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    Low Stock ({stockAudit.lowStockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('catalog');
                      setStockFilter('out');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === 'catalog' && stockFilter === 'out'
                        ? 'bg-red-600 text-white'
                        : 'text-red-700 hover:bg-red-50'
                    }`}
                  >
                    Out ({stockAudit.outOfStockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('history')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap ${
                      viewMode === 'history'
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <History className="w-3 h-3" />
                    <span>Movements ({movements.length})</span>
                  </button>
                </div>

                {viewMode === 'catalog' && (
                  <div className="relative">
                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value)}
                      className="appearance-none pl-3 pr-7 py-1.5 text-xs font-medium bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:border-neutral-400 cursor-pointer"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>

              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    viewMode === 'history'
                      ? 'Search movements by product, SKU, reason...'
                      : 'Search product name, SKU, fabric...'
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-400"
                />
              </div>
            </div>

            {/* Body: Stock Movements OR Product Catalog */}
            <div className="p-5 sm:p-7">
              {viewMode === 'history' ? (
                filteredMovements.length === 0 ? (
                  <div className="py-12 text-center text-xs text-neutral-500 space-y-2">
                    <History className="w-8 h-8 text-neutral-300 mx-auto" />
                    <p className="font-medium text-neutral-900 text-sm">No stock movements logged yet</p>
                    <p className="text-neutral-400 max-w-sm mx-auto">
                      Purchases, POS sales, order stock deductions, returns, and manual stock adjustments appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[720px]">
                      <thead>
                        <tr className="border-b border-neutral-200 text-xs sm:text-[13px] font-medium text-neutral-800">
                          <th className="pb-3.5 pr-4 font-medium">Date &amp; Time</th>
                          <th className="pb-3.5 px-3 font-medium">Product / SKU</th>
                          <th className="pb-3.5 px-3 font-medium">Movement</th>
                          <th className="pb-3.5 px-3 font-medium text-right">Stock Shift</th>
                          <th className="pb-3.5 px-3 font-medium text-right">Change</th>
                          <th className="pb-3.5 px-3 font-medium">Reason / Ref</th>
                          <th className="pb-3.5 pl-3 font-medium text-right">Staff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashed divide-neutral-200 text-xs sm:text-[13px] tabular-nums">
                        {filteredMovements.map((mv) => {
                          const mvColor =
                            mv.type === 'purchase' || mv.type === 'return'
                              ? 'text-emerald-700'
                              : mv.type === 'damaged'
                              ? 'text-red-600'
                              : mv.type === 'sale'
                              ? 'text-neutral-900'
                              : 'text-amber-700';

                          return (
                            <tr key={mv.id} className="hover:bg-neutral-50/70 transition-colors">
                              <td className="py-3.5 pr-4 font-mono text-xs text-neutral-500 whitespace-nowrap">
                                {formatDateTime(mv.timestamp)}
                              </td>
                              <td className="py-3.5 px-3">
                                <p className="font-semibold text-neutral-900">{mv.productName}</p>
                                <p className="font-mono text-[11px] text-neutral-400">
                                  {mv.sku || mv.productId}
                                </p>
                              </td>
                              <td className={`py-3.5 px-3 font-mono font-bold uppercase tracking-wide whitespace-nowrap ${mvColor}`}>
                                {mv.type}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-neutral-700 whitespace-nowrap">
                                {mv.previousStock} → <b className="text-neutral-950">{mv.newStock}</b>
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                                <span className={mv.change >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                                  {mv.change > 0 ? `+${mv.change}` : mv.change} pcs
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-neutral-600 max-w-xs">
                                <span>{mv.reason || '—'}</span>
                                {mv.referenceId && (
                                  <span className="ml-1.5 font-mono text-[11px] text-neutral-400">
                                    ({mv.referenceId})
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 pl-3 text-right text-neutral-700 whitespace-nowrap">
                                {mv.staffName}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : loading ? (
                <div className="py-12 text-center text-xs text-neutral-500">Loading product catalog...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-12 text-center text-neutral-500">
                  <Package className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-neutral-900 mb-1">
                    {search.trim() || filterCat !== 'all' || stockFilter !== 'all'
                      ? 'No products match your filter'
                      : 'No products in catalog'}
                  </h4>
                  <p className="text-xs text-neutral-400 mb-4 max-w-sm mx-auto">
                    {search.trim() || filterCat !== 'all' || stockFilter !== 'all'
                      ? 'Try adjusting your search query, category, or stock filter.'
                      : 'Add your first apparel item to start managing pricing and inventory.'}
                  </p>
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-neutral-200 text-xs sm:text-[13px] font-medium text-neutral-800">
                        <th className="pb-3.5 pr-4 font-medium">SKU</th>
                        <th className="pb-3.5 px-3 font-medium">Product</th>
                        <th className="pb-3.5 px-3 font-medium">Category</th>
                        <th className="pb-3.5 px-3 font-medium">Price / Cost</th>
                        <th className="pb-3.5 px-3 font-medium">Stock Level</th>
                        <th className="pb-3.5 px-3 font-medium">Visibility</th>
                        <th className="pb-3.5 px-3 font-medium">Status</th>
                        <th className="pb-3.5 pl-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dashed divide-neutral-200 text-xs sm:text-[13px] tabular-nums">
                      {filteredProducts.map((p) => {
                        const regularPrice = Math.max(0, Number(p.price) || 0);
                        const saleVal = typeof p.salePrice === 'number' && p.salePrice > 0 ? p.salePrice : 0;
                        const isSale = saleVal > 0 && saleVal < regularPrice;
                        const activeSellPrice = isSale ? saleVal : regularPrice;
                        const threshold =
                          typeof p.minStock === 'number' && p.minStock > 0
                            ? p.minStock
                            : globalLowThreshold;
                        const stockQty = Math.max(0, Number(p.totalStock) || 0);
                        const stockColor =
                          stockQty <= 0
                            ? 'text-red-600'
                            : stockQty <= threshold
                            ? 'text-amber-700'
                            : 'text-emerald-700';
                        const stockLabel =
                          stockQty <= 0
                            ? 'OUT OF STOCK (0)'
                            : stockQty <= threshold
                            ? `LOW · ${stockQty} PCS`
                            : `${stockQty} PCS IN STOCK`;

                        const flags = [
                          p.newArrival ? 'New' : null,
                          p.featured ? 'Featured' : null,
                          p.bestSeller ? 'Best Seller' : null,
                        ].filter(Boolean);

                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedProductId(p.id)}
                            className="hover:bg-neutral-50/70 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 pr-4 font-mono text-neutral-900 whitespace-nowrap">
                              {p.sku || '—'}
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={p.thumbnail || p.images?.[0] || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                                  alt={p.name || 'Product'}
                                  className="w-10 h-12 object-cover rounded border border-neutral-200 bg-neutral-50 shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="font-semibold text-neutral-950 truncate max-w-[210px]">
                                    {p.name || 'Unnamed Product'}
                                  </p>
                                  <p className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-[210px]">
                                    {p.fabric || 'Cotton'} · {(p.gender || 'men').toUpperCase()}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-neutral-700 whitespace-nowrap">
                              {p.categoryName || p.category || '—'}
                            </td>

                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <div className="font-mono font-bold text-neutral-950">
                                ৳{activeSellPrice.toLocaleString('en-BD')}
                                {isSale && (
                                  <span className="ml-1.5 text-[11px] font-normal text-neutral-400 line-through">
                                    ৳{regularPrice.toLocaleString('en-BD')}
                                  </span>
                                )}
                              </div>
                              {typeof p.costPrice === 'number' && p.costPrice > 0 && (
                                <div className="text-[11px] font-mono text-neutral-500">
                                  Cost: ৳{p.costPrice.toLocaleString('en-BD')}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold text-xs ${stockColor}`}>
                                  {stockLabel}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuickStock(p)}
                                  className="text-[11px] font-mono font-bold text-blue-600 hover:underline cursor-pointer"
                                  title="Adjust stock or write off damaged units"
                                >
                                  Adjust
                                </button>
                              </div>
                              <span className="block text-[10px] font-mono text-neutral-400 mt-0.5">
                                Min Alert: {threshold} pcs{(p.damagedStock || 0) > 0 ? ` · Damaged: ${p.damagedStock}` : ''}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-xs text-neutral-600 whitespace-nowrap">
                              {flags.length > 0 ? flags.join(' · ') : 'Standard'}
                            </td>

                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <span
                                className={`font-mono font-bold text-xs uppercase tracking-wide ${
                                  p.active ? 'text-emerald-700' : 'text-neutral-400'
                                }`}
                              >
                                {p.active ? 'Active' : 'Draft'}
                              </span>
                            </td>

                            <td
                              className="py-3.5 pl-3 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProductId(p.id)}
                                  className="text-neutral-900 underline underline-offset-2 hover:text-black cursor-pointer font-medium"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  className="p-1 text-neutral-500 hover:text-black rounded hover:bg-neutral-100 cursor-pointer"
                                  title="Edit Product"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(p)}
                                  className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                                  title="Delete Product"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {filteredProducts.length > 0 && viewMode === 'catalog' && (
            <p className="text-center text-xs text-neutral-500 font-mono">
              Showing 1–{filteredProducts.length} of {filteredProducts.length} products
            </p>
          )}
        </>
      )}

      {/* DEDICATED THERMAL PRODUCT SLIP INSPECTOR */}
      {selectedProduct && (() => {
        const regularPrice = Math.max(0, Number(selectedProduct.price) || 0);
        const saleVal =
          typeof selectedProduct.salePrice === 'number' && selectedProduct.salePrice > 0
            ? selectedProduct.salePrice
            : 0;
        const isSale = saleVal > 0 && saleVal < regularPrice;
        const activeSellPrice = isSale ? saleVal : regularPrice;
        const unitCost = Number(selectedProduct.costPrice) || 0;
        const unitMargin = unitCost > 0 ? activeSellPrice - unitCost : 0;
        const marginPct =
          unitCost > 0 && activeSellPrice > 0
            ? Math.round(((activeSellPrice - unitCost) / activeSellPrice) * 100)
            : 0;
        const stockQty = Math.max(0, Number(selectedProduct.totalStock) || 0);
        const minAlert =
          typeof selectedProduct.minStock === 'number' && selectedProduct.minStock > 0
            ? selectedProduct.minStock
            : globalLowThreshold;
        const stockStatusText =
          stockQty <= 0 ? 'OUT OF STOCK' : stockQty <= minAlert ? 'LOW STOCK' : 'IN STOCK';
        const stockStatusColor =
          stockQty <= 0 ? 'text-red-600' : stockQty <= minAlert ? 'text-amber-700' : 'text-emerald-700';

        const variantList = selectedProduct.variants || [];
        const colorList = selectedProduct.colors || [];
        const sizeList = selectedProduct.sizes || [];

        return (
          <div className="space-y-4">
            <AdminPageHeader
              title={selectedProduct.name}
              subtitle={`${selectedProduct.sku || 'No SKU'} · ${selectedProduct.categoryName || selectedProduct.category || 'Uncategorized'}`}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedProductId(null)}
                    className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold rounded-lg hover:border-black cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Products</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickStock(selectedProduct)}
                    className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-800 text-xs font-semibold rounded-lg hover:border-black cursor-pointer"
                  >
                    Adjust Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedProduct)}
                    className="px-3.5 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit Product</span>
                  </button>
                </>
              }
            />

            <div className="w-full bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Top Thermal Slip Strip */}
              <div className="px-4 sm:px-6 py-3 border-b border-dashed border-neutral-300 bg-[#f4f4f5] flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-950">{selectedProduct.sku || 'NO-SKU'}</span>
                  <span className="text-neutral-500">
                    · {selectedProduct.categoryName || selectedProduct.category || 'General'}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide ${
                    selectedProduct.active ? 'text-emerald-700' : 'text-neutral-500'
                  }`}
                >
                  {selectedProduct.active ? 'ACTIVE IN STORE' : 'DRAFT (HIDDEN)'}
                </span>
              </div>

              {/* Continuous Thermal Slip Body */}
              <div className="p-4 sm:p-6 space-y-5 font-mono text-[11px] sm:text-xs text-neutral-900">
                {/* Product Visual & Media Gallery Strip */}
                <div>
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-3">
                    <span className="font-bold uppercase tracking-wider">GARMENT OVERVIEW</span>
                    <span className="text-neutral-500">
                      {(selectedProduct.images || []).length} photo{(selectedProduct.images || []).length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {(selectedProduct.images && selectedProduct.images.length > 0
                        ? selectedProduct.images
                        : [selectedProduct.thumbnail || '/assets/aistudio/selvee1_8ff37f5b.jpg']
                      ).map((imgUrl, idx) => (
                        <img
                          key={idx}
                          src={imgUrl}
                          alt={`${selectedProduct.name} ${idx + 1}`}
                          className="w-16 h-20 object-cover rounded border border-neutral-200 bg-neutral-50"
                        />
                      ))}
                    </div>
                    <div className="min-w-0 font-sans space-y-1.5 flex-1">
                      <p className="font-bold text-sm text-neutral-950">{selectedProduct.name}</p>
                      <p className="text-xs text-neutral-500">
                        {selectedProduct.fabric || 'Premium Fabric'} · {(selectedProduct.gender || 'men').toUpperCase()} · Slug:{' '}
                        <span className="font-mono text-neutral-700">{selectedProduct.slug}</span>
                      </p>
                      {selectedProduct.description && (
                        <p className="text-xs text-neutral-700 leading-relaxed pt-1">
                          {selectedProduct.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 1: PRODUCT & PRICING SPEC (01 - 07) */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">PRICING &amp; MARGIN SPEC</span>
                    <span className="font-bold text-neutral-900">
                      Sell: ৳{activeSellPrice.toLocaleString('en-BD')}
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">01.</span>
                        <span className="font-bold">Product SKU:</span>{' '}
                        <span>{selectedProduct.sku || '—'}</span>
                        {selectedProduct.barcode && (
                          <span className="text-neutral-500 ml-2">· Barcode: {selectedProduct.barcode}</span>
                        )}
                      </div>
                      <span className="text-neutral-500">ID: {(selectedProduct.id || 'N/A').slice(0, 8)}</span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">02.</span>
                        <span className="font-bold">Category &amp; Fit:</span>{' '}
                        <span className="font-sans">
                          {selectedProduct.categoryName || selectedProduct.category || '—'} ·{' '}
                          {(selectedProduct.gender || 'men').toUpperCase()}
                        </span>
                      </div>
                      <span className="text-neutral-500">{selectedProduct.fabric || 'Cotton'}</span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">03.</span>
                        <span className="font-bold">Regular Price:</span>{' '}
                        <span>৳{regularPrice.toLocaleString('en-BD')}</span>
                      </div>
                      <span className="text-neutral-500">Catalog MRP</span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">04.</span>
                        <span className="font-bold">Sale / Offer Price:</span>{' '}
                        <span className={isSale ? 'text-emerald-700 font-bold' : 'text-neutral-500'}>
                          {isSale
                            ? `৳${saleVal.toLocaleString('en-BD')}`
                            : 'No active discount'}
                        </span>
                      </div>
                      {isSale && regularPrice > 0 && (
                        <span className="text-emerald-700 font-bold">
                          -{Math.round(((regularPrice - saleVal) / regularPrice) * 100)}% OFF
                        </span>
                      )}
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">05.</span>
                        <span className="font-bold">Unit Cost Price:</span>{' '}
                        <span>{unitCost > 0 ? `৳${unitCost.toLocaleString('en-BD')}` : 'Not set'}</span>
                      </div>
                      <span className={unitCost > 0 ? 'text-emerald-700 font-bold' : 'text-neutral-400'}>
                        {unitCost > 0
                          ? `Margin: +৳${unitMargin.toLocaleString('en-BD')} (${marginPct}%)`
                          : 'Set cost in Edit'}
                      </span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">06.</span>
                        <span className="font-bold">Storefront Flags:</span>{' '}
                        <span className="font-sans">
                          {[
                            selectedProduct.active ? 'Public' : 'Draft',
                            selectedProduct.newArrival ? 'New Arrival' : null,
                            selectedProduct.featured ? 'Featured' : null,
                            selectedProduct.bestSeller ? 'Best Seller' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedProduct)}
                        className="text-blue-600 font-semibold font-sans hover:underline cursor-pointer"
                      >
                        Edit Spec
                      </button>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: INVENTORY, SIZES & VARIANTS (07 - N) */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">INVENTORY &amp; VARIANTS</span>
                    <span className={`font-bold ${stockStatusColor}`}>
                      {stockStatusText} ({stockQty} pcs)
                    </span>
                  </div>

                  <div className="divide-y divide-dashed divide-neutral-200">
                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">07.</span>
                        <span className="font-bold">Current Stock:</span>{' '}
                        <span className={`font-bold ${stockStatusColor}`}>{stockQty} pcs</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenQuickStock(selectedProduct)}
                        className="text-blue-600 font-semibold font-sans hover:underline cursor-pointer"
                      >
                        + Adjust / Write-Off Stock
                      </button>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">08.</span>
                        <span className="font-bold">Low Stock Alert Threshold:</span>{' '}
                        <span>{minAlert} pcs</span>
                      </div>
                      <span className="text-neutral-500">
                        Damaged: {selectedProduct.damagedStock || 0} pcs
                      </span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-neutral-400 mr-1.5">09.</span>
                        <span className="font-bold">Available Sizes:</span>{' '}
                        <span>{sizeList.length > 0 ? sizeList.join(', ') : 'Standard'}</span>
                      </div>
                      <span className="text-neutral-500">{sizeList.length} sizes</span>
                    </div>

                    <div className="py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center flex-wrap gap-2">
                        <span>
                          <span className="text-neutral-400 mr-1.5">10.</span>
                          <span className="font-bold">Colour Palette:</span>
                        </span>
                        {colorList.length > 0 ? (
                          <span className="inline-flex flex-wrap items-center gap-2 font-sans">
                            {colorList.map((col, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 text-neutral-800">
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-neutral-400 inline-block"
                                  style={{ backgroundColor: col.code }}
                                />
                                <span>{col.name}</span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-neutral-400">Standard</span>
                        )}
                      </div>
                      <span className="text-neutral-500">{colorList.length} colors</span>
                    </div>

                    {variantList.length > 0 && (
                      <div className="py-2.5 space-y-2">
                        <div className="flex justify-between items-center text-neutral-500">
                          <span>
                            <span className="text-neutral-400 mr-1.5">11.</span>
                            <span className="font-bold text-neutral-900">Variant Matrix ({variantList.length} rows)</span>
                          </span>
                          <span>Total: {variantList.reduce((s, v) => s + (Number(v.stock) || 0), 0)} pcs</span>
                        </div>
                        <div className="border border-dashed border-neutral-300 rounded-lg divide-y divide-dashed divide-neutral-200 bg-neutral-50/40">
                          {variantList.map((v) => (
                            <div
                              key={v.id}
                              className="px-3 py-1.5 flex items-center justify-between gap-3 text-[11px]"
                            >
                              <span className="font-bold text-neutral-900">
                                {v.size} · {v.color}
                              </span>
                              <span className="text-neutral-500">{v.sku || '—'}</span>
                              <span className="font-bold text-neutral-900 tabular-nums">
                                {v.stock} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 3: RECENT STOCK MOVEMENTS FOR THIS PRODUCT */}
                <div className="border-t border-dashed border-neutral-400 pt-3">
                  <div className="flex justify-between items-center border-b border-dashed border-neutral-400 pb-1 mb-1">
                    <span className="font-bold uppercase tracking-wider">RECENT STOCK MOVEMENTS</span>
                    <span className="text-neutral-500">{selectedProductMovements.length} logged</span>
                  </div>

                  {selectedProductMovements.length === 0 ? (
                    <p className="py-3 text-neutral-400 font-sans text-xs">
                      No stock movement history recorded for this item yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-dashed divide-neutral-200">
                      {selectedProductMovements.map((mv) => (
                        <div key={mv.id} className="py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-bold uppercase text-neutral-900">{mv.type}</span>
                            <span className="text-neutral-500 ml-2 font-sans">
                              {mv.reason || 'Stock update'} · {mv.staffName}
                            </span>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <span className={mv.change >= 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                              {mv.change > 0 ? `+${mv.change}` : mv.change} pcs
                            </span>
                            <span className="text-neutral-400 ml-2">
                              ({mv.previousStock}→{mv.newStock})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Action Strip */}
                <div className="border-t border-dashed border-neutral-400 pt-3 flex items-center justify-between gap-3 font-sans">
                  <span className="text-[11px] text-neutral-400 font-mono">
                    Last Updated: {formatDateTime(selectedProduct.updatedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedProduct)}
                    className="text-xs font-semibold text-red-600 hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Product</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-6 max-h-[92vh] flex flex-col justify-between overflow-hidden animate-fade-in border border-neutral-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-neutral-950 tracking-tight">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
                {modalUnitMargin !== null && (
                  <p
                    className={`text-[11px] font-mono font-semibold mt-0.5 tabular-nums ${
                      modalUnitMargin >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    Estimated Profit Margin: {modalUnitMargin >= 0 ? '+' : ''}৳{modalUnitMargin.toLocaleString('en-BD')} / pc
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-lg cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form id="productForm" onSubmit={handleSubmit} className="px-6 py-5 overflow-y-auto space-y-4 flex-1 text-xs sm:text-[13px]">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {(categories.length === 0 || suppliers.length === 0) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {categories.length === 0 && suppliers.length === 0
                      ? 'Category and Supplier are required. Please add at least one Category and one Supplier first.'
                      : categories.length === 0
                      ? 'Category is required. Please add at least one Category before adding products.'
                      : 'Supplier is required. Please add at least one Supplier before adding products.'}
                  </span>
                </div>
              )}

              {/* Row 1: Product Name * | SKU / Code * | Barcode (Exact 3 equal columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cotton Casual Shirt"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    SKU / Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="SHIRT-001"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono uppercase text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Barcode
                  </label>
                  <div className="flex items-stretch h-[42px]">
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="890123..."
                      className="w-full min-w-0 h-full px-3.5 bg-white border border-neutral-300 rounded-l-lg font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setBarcode(generateEanBarcode())}
                      title="Generate Barcode"
                      className="px-3 bg-neutral-50 hover:bg-neutral-100 border border-l-0 border-neutral-300 rounded-r-lg text-neutral-600 hover:text-black flex items-center justify-center cursor-pointer transition-colors shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Category * | Collection / Gender | Size (Manual) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-black cursor-pointer transition-colors"
                    >
                      <option value="">
                        {categories.length === 0 ? 'No categories available' : 'Select Category...'}
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Gender / Collection
                  </label>
                  <div className="relative">
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'men' | 'women' | 'unisex' | 'kids')}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-black cursor-pointer transition-colors"
                    >
                      <option value="men">Men</option>
                      <option value="unisex">Unisex</option>
                      <option value="kids">Boys &amp; Kids</option>
                      <option value="women">Women</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Size
                  </label>
                  <input
                    type="text"
                    value={sizesInput}
                    onChange={(e) => setSizesInput(e.target.value)}
                    placeholder="e.g. M, L, XL or Free Size"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>
              </div>

              {/* Row 3: Color | Fabric / Material | Supplier * */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Color
                  </label>
                  <input
                    type="text"
                    value={colorsInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setColorsInput(val);
                      setColors(parseColorsFromText(val, colors));
                    }}
                    placeholder="e.g. Navy Blue, Maroon"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Fabric / Material
                  </label>
                  <input
                    type="text"
                    value={fabric}
                    onChange={(e) => setFabric(e.target.value)}
                    placeholder="e.g. 100% Cotton, Denim"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={brandSupplier}
                      onChange={(e) => setBrandSupplier(e.target.value)}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-black cursor-pointer transition-colors truncate"
                    >
                      <option value="">
                        {suppliers.length === 0 ? 'No suppliers available' : 'Select Supplier...'}
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 4: Purchase Cost * | Selling Price * | Discount Price */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 tabular-nums">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Purchase Cost (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={costPrice !== undefined ? costPrice : ''}
                    onChange={(e) => setCostPrice(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Selling Price (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="any"
                    required
                    value={price !== undefined ? price : ''}
                    onChange={(e) => setPrice(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono font-semibold text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Discount Price (৳)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={salePrice !== undefined ? salePrice : ''}
                    onChange={(e) => setSalePrice(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>
              </div>

              {/* Row 5: Initial Stock * | Min Stock Alert | Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 tabular-nums">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    {editingProduct ? 'Current Stock' : 'Initial Stock'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    disabled={variants.length > 0}
                    value={totalStock}
                    onChange={(e) => setTotalStock(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 placeholder:text-neutral-400 disabled:bg-neutral-100 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Min Stock Alert
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={minStock !== undefined ? minStock : ''}
                    onChange={(e) => setMinStock(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="5"
                    className="w-full h-[42px] px-3.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      value={active ? 'active' : 'draft'}
                      onChange={(e) => setActive(e.target.value === 'active')}
                      className="w-full h-[42px] appearance-none px-3.5 pr-9 bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-black cursor-pointer transition-colors"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Inactive / Draft</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Product Image Add Section Directly Below */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900">
                      Product Images
                    </h4>
                    <p className="text-[11px] text-neutral-500">
                      Upload photos from device or paste an image link. Click a photo to set as Primary.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                    {images.length} {images.length === 1 ? 'image' : 'images'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
                  <label className="sm:col-span-5 flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-dashed border-neutral-400 rounded-lg cursor-pointer text-xs font-semibold text-neutral-800 transition-colors">
                    <Upload className="w-4 h-4 text-neutral-700 shrink-0" />
                    <span className="truncate">{uploadingImage ? 'Uploading...' : 'Upload Product Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="sm:col-span-7 flex gap-2">
                    <input
                      type="url"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="Or paste product image URL..."
                      className="flex-1 min-w-0 px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0"
                    >
                      + Add Photo
                    </button>
                  </div>
                </div>

                {images.length === 0 ? (
                  <label className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/70 hover:bg-neutral-100/70 cursor-pointer transition-colors text-center">
                    <ImagePlus className="w-6 h-6 text-neutral-400 mb-1.5" />
                    <span className="text-xs font-medium text-neutral-700">
                      Click here to upload garment photos (Front, Back, Detail)
                    </span>
                    <span className="text-[11px] text-neutral-400 mt-0.5">
                      JPG, PNG or WEBP · Multiple photos supported
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {images.map((img, i) => (
                      <div
                        key={i}
                        onClick={() => handleSetPrimaryImage(i)}
                        title={i === 0 ? 'Primary Cover Photo' : 'Click to make Primary photo'}
                        className={`relative w-20 h-24 rounded-lg overflow-hidden bg-neutral-50 group cursor-pointer border transition-colors ${
                          i === 0 ? 'border-black ring-1 ring-black/20' : 'border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        <img
                          src={img}
                          alt={`Product ${i + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(i);
                          }}
                          className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {i === 0 ? (
                          <span className="absolute bottom-0 inset-x-0 bg-black text-white text-[9px] text-center font-mono font-bold py-0.5">
                            PRIMARY
                          </span>
                        ) : (
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            Set Main
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Compact Storefront Visibility + Optional Variants / Description */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-700">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newArrival}
                        onChange={(e) => setNewArrival(e.target.checked)}
                        className="accent-black w-3.5 h-3.5"
                      />
                      <span>New Arrival</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featured}
                        onChange={(e) => setFeatured(e.target.checked)}
                        className="accent-black w-3.5 h-3.5"
                      />
                      <span>Featured</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bestSeller}
                        onChange={(e) => setBestSeller(e.target.checked)}
                        className="accent-black w-3.5 h-3.5"
                      />
                      <span>Best Seller</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStockMode((prev) => (prev === 'variants' ? 'simple' : 'variants'))}
                    className="text-[11px] font-semibold text-neutral-600 hover:text-black underline underline-offset-2 cursor-pointer"
                  >
                    {stockMode === 'variants' ? 'Hide Size/Color Matrix' : '+ Size / Color Stock Matrix'}
                  </button>
                </div>

                {(stockMode === 'variants' || variants.length > 0) && (
                  <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-neutral-800">
                        Variant Stock Breakdown
                      </span>
                      <button
                        type="button"
                        onClick={generateVariants}
                        className="px-2.5 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-wider rounded cursor-pointer hover:bg-neutral-800"
                      >
                        Generate Size &amp; Color Matrix
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value)}
                        placeholder="Add color swatch (e.g. Black)"
                        className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
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
                        className="px-2.5 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-900 text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        + Add Swatch
                      </button>
                      {colors.map((c, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded border border-neutral-300 text-[11px]"
                        >
                          <span className="w-2.5 h-2.5 rounded-xs border border-neutral-300" style={{ backgroundColor: c.code }} />
                          <span>{c.name}</span>
                          <X
                            className="w-3 h-3 cursor-pointer text-neutral-400 hover:text-black"
                            onClick={() => handleRemoveColor(c.name)}
                          />
                        </span>
                      ))}
                    </div>

                    {variants.length > 0 && (
                      <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-dashed divide-neutral-200 bg-white">
                        {variants.map((v, idx) => (
                          <div key={v.id} className="p-2 flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold w-28 text-neutral-900 truncate">
                              {v.size} / {v.color}
                            </span>
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => {
                                const updated = [...variants];
                                updated[idx].sku = e.target.value;
                                setVariants(updated);
                              }}
                              className="flex-1 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded font-mono text-[11px]"
                            />
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
                              className="w-16 px-2 py-1 bg-neutral-50 border border-neutral-300 rounded font-mono font-bold text-center"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                    Product Notes / Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tailoring details, wash care, or weave notes..."
                    className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
              </div>
            </form>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-end gap-2.5 bg-neutral-50">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 bg-neutral-500 hover:bg-neutral-600 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="productForm"
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg disabled:bg-neutral-400 cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stock Adjustment Modal (Add / Set / Damaged Write-off) */}
      {quickStockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-dashed border-neutral-300">
              <div>
                <h3 className="font-mono font-bold text-xs text-neutral-900 uppercase tracking-wider">
                  Stock Adjustment
                </h3>
                <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">
                  {quickStockProduct.name} · Current: <b>{quickStockProduct.totalStock} pcs</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickStockProduct(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-100 rounded-lg text-[11px] font-bold">
              {([
                { id: 'set', label: 'Set Exact' },
                { id: 'add', label: '+ Add Stock' },
                { id: 'damaged', label: 'Damaged (−)' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setQuickStockMode(m.id);
                    setQuickStockValue(m.id === 'set' ? quickStockProduct.totalStock || 0 : 1);
                  }}
                  className={`py-1.5 rounded-md cursor-pointer transition-colors ${
                    quickStockMode === m.id
                      ? m.id === 'damaged'
                        ? 'bg-red-600 text-white'
                        : 'bg-white text-black shadow-xs'
                      : 'text-neutral-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="py-1 text-center space-y-3 tabular-nums">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuickStockValue((prev) => Math.max(0, prev - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-lg font-mono font-bold text-neutral-800 text-sm border border-neutral-300 cursor-pointer"
                >
                  -1
                </button>
                <input
                  type="number"
                  min={0}
                  value={quickStockValue}
                  onChange={(e) => setQuickStockValue(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 py-2 text-center text-xl font-mono font-bold bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => setQuickStockValue((prev) => prev + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-neutral-100 hover:bg-neutral-200 rounded-lg font-mono font-bold text-neutral-800 text-sm border border-neutral-300 cursor-pointer"
                >
                  +1
                </button>
              </div>

              <div className="flex justify-center gap-1.5 text-[11px] font-mono font-bold">
                {[5, 10, 25, 50].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() =>
                      setQuickStockValue((prev) => (quickStockMode === 'set' ? prev + delta : delta))
                    }
                    className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded border border-neutral-200 cursor-pointer"
                  >
                    {quickStockMode === 'set' ? `+${delta}` : `${delta} pcs`}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={quickStockReason}
                onChange={(e) => setQuickStockReason(e.target.value)}
                placeholder={
                  quickStockMode === 'damaged'
                    ? 'Reason (e.g. Torn stitch, faded fabric)'
                    : 'Reason / Reference note (optional)'
                }
                className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-dashed border-neutral-200">
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
                className={`flex-1 py-2 text-xs font-bold text-white rounded-lg cursor-pointer disabled:bg-neutral-400 ${
                  quickStockMode === 'damaged' ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-neutral-800'
                }`}
              >
                {quickStockSaving
                  ? 'Saving...'
                  : quickStockMode === 'add'
                  ? 'Add Stock'
                  : quickStockMode === 'damaged'
                  ? 'Deduct Damaged'
                  : 'Save Stock'}
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
                {deletingProduct.sku && (
                  <span className="block font-mono text-[11px] text-neutral-400 mt-0.5">
                    SKU: {deletingProduct.sku}
                  </span>
                )}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 uppercase text-[11px] tracking-wider">
                    Firestore Rules Snippet
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
