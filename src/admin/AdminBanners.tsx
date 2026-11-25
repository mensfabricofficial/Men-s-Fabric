import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Image as ImageIcon, X, Upload, AlertCircle } from 'lucide-react';
import { Banner } from '../types';
import { settingsService } from '../services/settingsService';
import { productService } from '../services/productService';
import { notificationService } from '../services/notificationService';
import { AdminPageHeader } from './AdminLayout';
import { ProgressiveImage } from '../components/common/ProgressiveImage';

export const AdminBanners: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>(() => settingsService.getInstantBanners(false));
  const [loading, setLoading] = useState(() => settingsService.getInstantBanners(false).length === 0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [badge, setBadge] = useState('');
  const [image, setImage] = useState('');
  const [buttonText, setButtonText] = useState('Explore Collection');
  const [buttonLink, setButtonLink] = useState('/shop');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [active, setActive] = useState(true);
  const [notifyCustomers, setNotifyCustomers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    const unsub = settingsService.subscribeToBanners((data) => {
      setBanners(data);
      setLoading(false);
    }, false);
    return () => unsub();
  }, []);

  const openAddModal = () => {
    setEditingBanner(null);
    setTitle('');
    setSubtitle('');
    setBadge('');
    setImage('');
    setButtonText('');
    setButtonLink('/shop');
    setSortOrder(banners.length + 1);
    setActive(true);
    setNotifyCustomers(false);
    setModalError('');
    setModalOpen(true);
  };

  const openEditModal = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title);
    setSubtitle(b.subtitle || '');
    setBadge(b.badge || '');
    setImage(b.image);
    setButtonText(b.buttonText);
    setButtonLink(b.buttonLink);
    setSortOrder(b.sortOrder || 1);
    setActive(b.active);
    setNotifyCustomers(false);
    setModalError('');
    setModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setModalError('');
    try {
      const url = await productService.uploadImage(file, 'banners');
      setImage(url);
    } catch {
      setModalError('Image upload failed. Please try another file or paste an image URL.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError('');
    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      badge: badge.trim(),
      image: image.trim(),
      buttonText: buttonText.trim(),
      buttonLink: buttonLink.trim(),
      sortOrder: Number(sortOrder) || 1,
      active,
    };

    try {
      if (editingBanner) {
        await settingsService.updateBanner(editingBanner.id, payload);
      } else {
        await settingsService.createBanner(payload);
      }
      if (active && notifyCustomers) {
        const notifTitle = payload.title || 'New Collection Banner';
        notificationService
          .publishNotification({
            type: 'offer',
            title: payload.badge ? `${payload.badge}: ${notifTitle}` : notifTitle,
            message: payload.subtitle || 'Check out our latest offer now on Selvee!',
            audience: 'all',
            actionUrl: payload.buttonLink || '/shop',
            important: true,
            createdBy: 'admin',
          })
          .catch(() => {});
      }
      setModalOpen(false);
    } catch {
      setModalError('Failed to save banner. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
    try {
      await settingsService.deleteBanner(id);
    } catch {
      // safe fallback
    }
  };

  return (
    <div className="space-y-6">
      
      <AdminPageHeader
        title="Homepage Banners & Hero Showcase"
        subtitle="Manage promotional banners on the landing page (scales identically on mobile & desktop)."
        actions={
          <button
            onClick={openAddModal}
            className="px-3.5 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Banner</span>
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 p-8 text-center text-xs text-neutral-500">Loading banners...</div>
        ) : banners.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-neutral-500 bg-white rounded-xl border border-neutral-200">
            <ImageIcon className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No homepage banners</h4>
            <p className="text-xs text-neutral-500 mb-4">Add a hero banner with custom headline and CTA button.</p>
            <button
              onClick={openAddModal}
              className="px-5 py-2 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg"
            >
              Add First Banner
            </button>
          </div>
        ) : (
          banners.map((b) => (
            <div key={b.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs flex flex-col justify-between">
              <div className="relative aspect-[16/9] bg-neutral-900 overflow-hidden">
                {b.image && b.image.trim() ? (
                  <ProgressiveImage
                    src={b.image.trim()}
                    alt={b.title || 'Banner'}
                    wrapperClassName="relative w-full h-full overflow-hidden bg-neutral-900"
                    skeletonClassName="bg-neutral-800/80 animate-pulse"
                    className="w-full h-full object-cover opacity-80"
                  />
                ) : null}
                {(b.badge || b.title || b.subtitle) && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 flex flex-col justify-end text-white">
                    {b.badge && <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-300">{b.badge}</span>}
                    {b.title && <h3 className="text-lg font-bold uppercase">{b.title}</h3>}
                    {b.subtitle && <p className="text-xs text-neutral-300 line-clamp-1">{b.subtitle}</p>}
                  </div>
                )}
              </div>
              <div className="p-4 flex items-center justify-between border-t border-neutral-100 text-xs">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  b.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                }`}>
                  {b.active ? 'Active' : 'Draft'}
                </span>
                <div className="space-x-2">
                  <button onClick={() => openEditModal(b)} className="p-1.5 text-neutral-600 hover:text-black">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(b.id)} className="p-1.5 text-red-600 hover:text-red-800">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingBanner ? 'Edit Banner' : 'Create Hero Banner'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">
                  Headline Title <span className="font-normal text-neutral-400 normal-case">(Optional — leave empty for image-only banner)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. LUXURY IN COTTON"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Subtitle / Tagline</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="e.g. Unrivaled comfort tailored for distinction"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Seasonal Badge</label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="e.g. New Drop"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 uppercase mb-1">Button Text</label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="Leave empty to hide button"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Banner Click Link</label>
                <input
                  type="text"
                  value={buttonLink}
                  onChange={(e) => setButtonLink(e.target.value)}
                  placeholder="/shop"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Banner Image</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://... or upload high-res photo"
                    className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                  />
                  <label className="px-3 py-2 bg-neutral-200 hover:bg-neutral-300 rounded font-bold cursor-pointer flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                  <span>Banner Active</span>
                </label>
                {active && (
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-700">
                    <input
                      type="checkbox"
                      checked={notifyCustomers}
                      onChange={(e) => setNotifyCustomers(e.target.checked)}
                      className="accent-black w-4 h-4"
                    />
                    <span>Send Mobile Offer Notification to Customers</span>
                  </label>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-black text-white font-bold uppercase tracking-wider rounded hover:bg-neutral-800"
                >
                  {saving ? 'Saving...' : 'Save Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
