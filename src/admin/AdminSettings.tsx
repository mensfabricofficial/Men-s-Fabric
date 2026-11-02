import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { SiteSettings } from '../types';
import { settingsService, defaultSettings } from '../services/settingsService';
import { useAuth } from '../context/AuthContext';

export const AdminSettings: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    settingsService.getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await settingsService.updateSettings(settings);
      if (currentUser) {
        await settingsService.logAdminAction(currentUser.uid, currentUser.email || '', 'UPDATE_SETTINGS', 'general', 'Updated store settings');
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      alert('Failed to update store settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-xs text-neutral-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
          Store & Brand Settings
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Configure official contact numbers, social media links, and the announcement bar.
        </p>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Store settings updated successfully! Changes are live across the customer site.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6 text-xs shadow-xs">
        
        {/* Brand Information */}
        <div className="space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-neutral-400">1. Brand & Description</h3>
          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Store Name</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded font-bold"
            />
          </div>
          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Store Description (SEO & Footer)</label>
            <textarea
              rows={3}
              value={settings.storeDescription}
              onChange={(e) => setSettings({ ...settings, storeDescription: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
            />
          </div>
        </div>

        {/* Contact Numbers */}
        <div className="space-y-4 pt-4 border-t border-neutral-200">
          <h3 className="font-bold uppercase tracking-wider text-neutral-400">2. Customer Support & Contact Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Business Phone</label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">WhatsApp Order Number</label>
              <input
                type="text"
                value={settings.whatsapp}
                onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                placeholder="+8801XXXXXXXXX"
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Official Business Email</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Business Address</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div className="space-y-4 pt-4 border-t border-neutral-200">
          <h3 className="font-bold uppercase tracking-wider text-neutral-400">3. Social Media Accounts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Facebook Page URL</label>
              <input
                type="url"
                value={settings.facebookUrl || ''}
                onChange={(e) => setSettings({ ...settings, facebookUrl: e.target.value })}
                placeholder="https://facebook.com/..."
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
            <div>
              <label className="block font-bold text-neutral-700 uppercase mb-1">Instagram URL</label>
              <input
                type="url"
                value={settings.instagramUrl || ''}
                onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                placeholder="https://instagram.com/..."
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Announcement Bar & Free Shipping */}
        <div className="space-y-4 pt-4 border-t border-neutral-200">
          <h3 className="font-bold uppercase tracking-wider text-neutral-400">4. Header Announcement & Free Shipping</h3>
          <div>
            <label className="block font-bold text-neutral-700 uppercase mb-1">Announcement Bar Message</label>
            <input
              type="text"
              value={settings.announcementText || ''}
              onChange={(e) => setSettings({ ...settings, announcementText: e.target.value })}
              placeholder="e.g. Free Shipping on Orders Over ৳2500 across Bangladesh!"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="annActive"
              checked={settings.announcementActive}
              onChange={(e) => setSettings({ ...settings, announcementActive: e.target.checked })}
              className="accent-black w-4 h-4"
            />
            <label htmlFor="annActive" className="font-bold text-neutral-800 cursor-pointer">
              Display Announcement Bar at top of website
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-200 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-black text-white font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 shadow-md disabled:bg-neutral-400 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save All Settings'}</span>
          </button>
        </div>

      </form>

    </div>
  );
};
