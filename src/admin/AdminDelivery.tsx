import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit, Trash2, X, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { DeliveryZone } from '../types';
import { settingsService } from '../services/settingsService';

export const AdminDelivery: React.FC = () => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  const [name, setName] = useState('');
  const [charge, setCharge] = useState<number>(70);
  const [estimatedDays, setEstimatedDays] = useState('1 - 2 Days');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Quick fee inline states
  const [quickDhaka, setQuickDhaka] = useState<number>(70);
  const [quickOutside, setQuickOutside] = useState<number>(130);
  const [quickSaving, setQuickSaving] = useState(false);

  // In-UI Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadZones = async () => {
    setLoading(true);
    try {
      const data = await settingsService.getDeliveryZones();
      if (data.length === 0) {
        const defaults: DeliveryZone[] = [
          { id: 'dhaka', name: 'Inside Dhaka City', charge: 70, estimatedDays: '1 - 2 Days', active: true },
          { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130, estimatedDays: '2 - 4 Days', active: true },
        ];
        setZones(defaults);
        setQuickDhaka(70);
        setQuickOutside(130);
      } else {
        setZones(data);
        const dh = data.find((z) => z.id === 'dhaka');
        const out = data.find((z) => z.id === 'outside-dhaka');
        if (dh) setQuickDhaka(dh.charge);
        if (out) setQuickOutside(out.charge);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  const openAddModal = () => {
    setEditingZone(null);
    setName('');
    setCharge(70);
    setEstimatedDays('1 - 2 Days');
    setActive(true);
    setModalOpen(true);
  };

  const openEditModal = (z: DeliveryZone) => {
    setEditingZone(z);
    setName(z.name);
    setCharge(z.charge);
    setEstimatedDays(z.estimatedDays);
    setActive(z.active);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.saveDeliveryZone(
        {
          name: name.trim(),
          charge: Number(charge) || 0,
          estimatedDays: estimatedDays.trim(),
          active,
        },
        editingZone?.id
      );
      setModalOpen(false);
      showToast(`Delivery zone "${name.trim()}" saved successfully!`);
      await loadZones();
    } catch {
      showToast('Failed to save delivery zone.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpdate = async () => {
    setQuickSaving(true);
    try {
      await settingsService.saveDeliveryZone(
        {
          name: 'Inside Dhaka City',
          charge: Number(quickDhaka) || 0,
          estimatedDays: '1 - 2 Days',
          active: true,
        },
        'dhaka'
      );
      await settingsService.saveDeliveryZone(
        {
          name: 'Outside Dhaka (Nationwide)',
          charge: Number(quickOutside) || 0,
          estimatedDays: '2 - 4 Days',
          active: true,
        },
        'outside-dhaka'
      );
      showToast('Delivery charges updated! Inside Dhaka: ৳' + quickDhaka + ', Outside Dhaka: ৳' + quickOutside);
      await loadZones();
    } catch {
      showToast('Failed to update quick delivery fees.', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await settingsService.deleteDeliveryZone(id);
      setDeleteConfirmId(null);
      showToast('Delivery zone removed successfully.');
      await loadZones();
    } catch {
      showToast('Failed to delete delivery zone.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Delivery & Shipping Configuration
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configure delivery fees and estimated transit time. Changes apply in real time to customer cart and checkout.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Zone</span>
        </button>
      </div>

      {/* In-UI Notification Toast */}
      {toast && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in shadow-xs ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          )}
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Quick Instant Delivery Fee Controller */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-neutral-800" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900">
              Quick Delivery Fee Controller
            </h2>
          </div>
          <span className="text-[10px] bg-neutral-100 text-neutral-600 font-bold uppercase px-2.5 py-1 rounded">
            Primary Zones
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
            <span className="block text-[11px] font-bold uppercase text-neutral-600 tracking-wider">
              Inside Dhaka Delivery Charge
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-neutral-900 font-mono">৳</span>
              <input
                type="number"
                min="0"
                value={quickDhaka}
                onChange={(e) => setQuickDhaka(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-bold font-mono focus:outline-none focus:border-black"
              />
            </div>
            <p className="text-[11px] text-neutral-400">Regular default: ৳70 (Transit: 1-2 Days)</p>
          </div>

          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
            <span className="block text-[11px] font-bold uppercase text-neutral-600 tracking-wider">
              Outside Dhaka (Nationwide) Charge
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-neutral-900 font-mono">৳</span>
              <input
                type="number"
                min="0"
                value={quickOutside}
                onChange={(e) => setQuickOutside(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-bold font-mono focus:outline-none focus:border-black"
              />
            </div>
            <p className="text-[11px] text-neutral-400">Regular default: ৳130 (Transit: 2-4 Days)</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={quickSaving}
            onClick={handleQuickUpdate}
            className="w-full sm:w-auto px-5 py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{quickSaving ? 'Saving Fees...' : 'Save & Update Delivery Fees'}</span>
          </button>
        </div>
      </div>

      {/* Zones Table & Mobile Responsive Cards */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <span className="font-bold uppercase text-xs tracking-wider text-neutral-700">All Shipping Zones</span>
          <span className="text-[11px] text-neutral-500 font-medium">{zones.length} Zones Registered</span>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-100/60 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Zone Name</th>
                <th className="p-3.5">Delivery Fee (BDT)</th>
                <th className="p-3.5">Estimated Delivery Time</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {zones.map((z) => (
                <tr key={z.id} className="hover:bg-neutral-50/50">
                  <td className="p-3.5 font-bold text-neutral-900">{z.name}</td>
                  <td className="p-3.5 font-bold text-neutral-800 font-mono">৳{z.charge}</td>
                  <td className="p-3.5 text-neutral-600">{z.estimatedDays}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      z.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}>
                      {z.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(z)}
                      className="p-1.5 text-neutral-600 hover:text-black rounded hover:bg-neutral-100 cursor-pointer"
                      title="Edit zone"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {z.id !== 'dhaka' && z.id !== 'outside-dhaka' && (
                      <>
                        {deleteConfirmId === z.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(z.id)}
                              className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded uppercase cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 bg-neutral-200 text-neutral-700 text-[10px] font-bold rounded uppercase cursor-pointer"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(z.id)}
                            className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer"
                            title="Delete zone"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-neutral-100">
          {zones.map((z) => (
            <div key={`mob-${z.id}`} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-neutral-900 text-xs">{z.name}</h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{z.estimatedDays}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  z.active ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'
                }`}>
                  {z.active ? 'Active' : 'Disabled'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-base font-extrabold text-neutral-900 font-mono">
                  ৳{z.charge}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(z)}
                    className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-800 hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  {z.id !== 'dhaka' && z.id !== 'outside-dhaka' && (
                    <button
                      onClick={() => handleDelete(z.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit / Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingZone ? 'Edit Delivery Zone' : 'Create Delivery Zone'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Zone Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Inside Chittagong Express"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Delivery Charge (৳) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={charge}
                  onChange={(e) => setCharge(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 uppercase mb-1">Transit Time Estimate</label>
                <input
                  type="text"
                  required
                  value={estimatedDays}
                  onChange={(e) => setEstimatedDays(e.target.value)}
                  placeholder="e.g. 1 - 2 Business Days"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-black w-4 h-4" />
                  <span>Zone Active</span>
                </label>
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
                  {saving ? 'Saving...' : 'Save Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
