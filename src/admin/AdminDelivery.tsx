import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit, Trash2, X } from 'lucide-react';
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

  const loadZones = async () => {
    setLoading(true);
    try {
      const data = await settingsService.getDeliveryZones();
      if (data.length === 0) {
        // Seed default Bangladeshi zones
        setZones([
          { id: 'dhaka', name: 'Inside Dhaka City', charge: 70, estimatedDays: '1 - 2 Days', active: true },
          { id: 'outside-dhaka', name: 'Outside Dhaka (Nationwide)', charge: 130, estimatedDays: '2 - 4 Days', active: true },
        ]);
      } else {
        setZones(data);
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
      await loadZones();
    } catch {
      alert('Failed to save delivery zone.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this delivery zone?')) return;
    try {
      await settingsService.deleteDeliveryZone(id);
      await loadZones();
    } catch {
      alert('Failed to delete delivery zone.');
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
            Configure delivery fees and estimated transit time for Inside Dhaka and Nationwide zones.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Zone</span>
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
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
                <td className="p-3.5 font-bold text-neutral-800">৳{z.charge}</td>
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
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  {z.id !== 'dhaka' && z.id !== 'outside-dhaka' && (
                    <button
                      onClick={() => handleDelete(z.id)}
                      className="p-1.5 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
