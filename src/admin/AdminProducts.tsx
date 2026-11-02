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
  Package
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
    loadData();
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
    setImages(['/logo.jpg']);
    setSizesInput('S, M, L, XL, XXL');
    setColors([
      { name: 'Black', code: '#000000' },
      { name: 'White', code: '#FFFFFF' },
    ]);
    setVariants([]);
    setTotalStock(25);
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
    setImages(prod.images || [prod.thumbnail || '/logo.jpg']);
    setSizesInput((prod.sizes || []).join(', '));
    setColors(prod.colors || []);
    setVariants(prod.variants || []);
    setTotalStock(prod.totalStock || 0);
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
    } catch {
      alert('Firebase Storage upload failed. You can paste an image URL directly.');
    } finally {
      setUploadingImage(false);
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
      brand: "MEN'S FABRIC",
      gender,
      fabric: fabric.trim(),
      description: description.trim(),
      price: Number(price) || 0,
      salePrice: salePrice ? Number(salePrice) : undefined,
      costPrice: costPrice ? Number(costPrice) : undefined,
      images: images.length > 0 ? images : ['/logo.jpg'],
      thumbnail: images[0] || '/logo.jpg',
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
        await productService.updateProduct(editingProduct.id, productPayload);
        if (currentUser) {
          await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'UPDATE_PRODUCT', editingProduct.id, `Updated ${name}`);
        }
      } else {
        const newId = await productService.createProduct(productPayload as any);
        if (currentUser) {
          await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'CREATE_PRODUCT', newId, `Created ${name}`);
        }
      }

      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save product to Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (prod: Product) => {
    if (!window.confirm(`Are you sure you want to delete "${prod.name}"?`)) return;
    try {
      await productService.deleteProduct(prod.id);
      if (currentUser) {
        await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'DELETE_PRODUCT', prod.id, `Deleted ${prod.name}`);
      }
      await loadData();
    } catch {
      alert('Failed to delete product.');
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

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

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
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No products in database</h4>
            <p className="text-xs text-neutral-500 mb-4">Click "Add New Product" to create your first apparel listing.</p>
            <button
              onClick={openAddModal}
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
            >
              Add First Product
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
                            src={p.thumbnail || p.images?.[0] || '/logo.jpg'}
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
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.totalStock <= 0 ? 'bg-red-100 text-red-800' :
                          p.totalStock < 5 ? 'bg-amber-100 text-amber-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {p.totalStock} in stock
                        </span>
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

              {/* Sizes and Colors */}
              <div className="space-y-4 pt-4 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-neutral-400">4. Sizes & Colors Matrix</h4>
                  <button
                    type="button"
                    onClick={generateVariants}
                    className="px-3 py-1 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-wider rounded cursor-pointer"
                  >
                    Generate Variant Rows
                  </button>
                </div>

                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Available Sizes (Comma separated)</label>
                  <input
                    type="text"
                    value={sizesInput}
                    onChange={(e) => setSizesInput(e.target.value)}
                    placeholder="S, M, L, XL, XXL or 38, 40, 42, 44"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>

                {/* Colors Manager */}
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Color Options</label>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {colors.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 rounded-full border border-neutral-300">
                        <span className="w-3 h-3 rounded-full border border-neutral-400" style={{ backgroundColor: c.code }} />
                        <span>{c.name}</span>
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
                      className="px-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded"
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
                      className="px-3 py-1.5 bg-neutral-200 text-neutral-800 font-bold rounded"
                    >
                      + Add Color
                    </button>
                  </div>
                </div>

                {/* Generated Variant Rows */}
                {variants.length > 0 && (
                  <div className="pt-2">
                    <p className="font-bold text-neutral-700 mb-2">Inventory by Variant (Size × Color):</p>
                    <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded divide-y divide-neutral-100">
                      {variants.map((v, idx) => (
                        <div key={v.id} className="p-2 flex items-center justify-between gap-3 text-xs bg-white">
                          <span className="font-bold w-24">{v.size} / {v.color}</span>
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
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-500">Stock:</span>
                            <input
                              type="number"
                              min={0}
                              value={v.stock}
                              onChange={(e) => {
                                const updated = [...variants];
                                updated[idx].stock = Number(e.target.value) || 0;
                                setVariants(updated);
                                setTotalStock(updated.reduce((s, row) => s + (row.stock || 0), 0));
                              }}
                              className="w-16 px-2 py-1 bg-neutral-50 border border-neutral-200 rounded font-bold text-center"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

    </div>
  );
};
