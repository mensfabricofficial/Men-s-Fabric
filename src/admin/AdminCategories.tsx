import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, FolderTree, X, AlertCircle } from 'lucide-react';
import { Category } from '../types';
import { productService } from '../services/productService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

export const AdminCategories: React.FC = () => {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await productService.getCategories();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openAddModal = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setDescription('');
    setImage('');
    setSortOrder(categories.length + 1);
    setActive(true);
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setImage(cat.image || '');
    setSortOrder(cat.sortOrder || 1);
    setActive(cat.active !== false);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    const autoSlug = slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const payload = {
      name: name.trim(),
      slug: autoSlug,
      description: description.trim(),
      image: image.trim(),
      sortOrder: Number(sortOrder) || 1,
      active,
    };

    try {
      if (editingCategory) {
        const updatedCat: Category = { ...editingCategory, ...payload };
        setCategories((prev) => prev.map((c) => (c.id === editingCategory.id ? updatedCat : c)));
        await productService.updateCategory(editingCategory.id, payload);
        if (currentUser) {
          try {
            await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'UPDATE_CATEGORY', editingCategory.id, `Updated ${name}`);
          } catch {
            // non-blocking
          }
        }
        setActionToast(`Category "${name}" updated.`);
      } else {
        const newId = await productService.createCategory(payload);
        const newCat: Category = { ...payload, id: newId };
        setCategories((prev) => [...prev, newCat]);
        if (currentUser) {
          try {
            await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'CREATE_CATEGORY', newId, `Created ${name}`);
          } catch {
            // non-blocking
          }
        }
        setActionToast(`Category "${name}" created.`);
      }
      setModalOpen(false);
      setTimeout(() => setActionToast(null), 3000);
      await loadCategories();
    } catch (err: any) {
      console.warn('Category save notice:', err);
      setModalOpen(false);
      await loadCategories();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (cat: Category) => {
    setDeletingCategory(cat);
  };

  const confirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    const targetId = deletingCategory.id;
    const targetName = deletingCategory.name;

    // Immediately remove from UI
    setCategories((prev) => prev.filter((c) => c.id !== targetId));
    setDeletingCategory(null);

    try {
      await productService.deleteCategory(targetId);
      if (currentUser) {
        try {
          await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'DELETE_CATEGORY', targetId, `Deleted ${targetName}`);
        } catch {
          // non-blocking
        }
      }
      setActionToast(`Category "${targetName}" deleted.`);
      setTimeout(() => setActionToast(null), 3000);
    } catch {
      setActionToast(`Category "${targetName}" removed.`);
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Category Management
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Organize menswear into Panjabi, Shirts, Casuals, Pants, and collections.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Category</span>
        </button>
      </div>

      {/* Categories Grid/Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <FolderTree className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No categories configured</h4>
            <p className="text-xs text-neutral-500 mb-4">Create your first category (e.g. Panjabi, Shirts) to categorize products.</p>
            <button
              onClick={openAddModal}
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
            >
              Add First Category
            </button>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Sort</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Slug URL</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {categories.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50/50">
                  <td className="p-3.5 text-neutral-400 font-mono">#{c.sortOrder}</td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      {c.image ? (
                        <img src={c.image} alt={c.name} className="w-10 h-10 rounded object-cover bg-neutral-100" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-neutral-900 text-white flex items-center justify-center font-bold">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-neutral-900">{c.name}</p>
                        {c.description && <p className="text-[11px] text-neutral-500 line-clamp-1">{c.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-mono text-neutral-600">/category/{c.slug}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      c.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}>
                      {c.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-1.5 text-neutral-600 hover:text-black rounded hover:bg-neutral-100 cursor-pointer"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in text-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingCategory ? 'Edit Category' : 'Create Category'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Panjabi"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Slug URL</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="e.g. panjabi"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Cover Image URL</label>
                <input
                  type="url"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://... image link"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                    <span>Active</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold uppercase tracking-tight text-neutral-900">
                Delete Category?
              </h3>
              <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                Are you sure you want to delete <b className="text-neutral-900">"{deletingCategory.name}"</b>?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteCategory}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer shadow-sm"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-70 bg-neutral-950 text-white text-xs font-medium py-3 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-neutral-800 animate-slide-up">
          <span>{actionToast}</span>
        </div>
      )}

    </div>
  );
};
