import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Building2, Phone, MapPin, Banknote, X } from 'lucide-react';
import { Supplier } from '../types';
import { posService } from '../services/posService';

export const AdminSuppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => posService.getLocalSuppliers());
  const [search, setSearch] = useState('');

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('Fabrics & Apparel');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Pay due modal
  const [payModalSupplier, setPayModalSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);

  useEffect(() => {
    return posService.subscribeToSuppliers(setSuppliers);
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setCategory('Fabrics & Apparel');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (sup: Supplier) => {
    setEditing(sup);
    setName(sup.name);
    setContactPerson(sup.contactPerson || '');
    setPhone(sup.phone);
    setAddress(sup.address || '');
    setCategory(sup.category || 'Fabrics & Apparel');
    setNotes(sup.notes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await posService.saveSupplier({
        id: editing?.id,
        name,
        contactPerson,
        phone,
        address,
        category,
        notes,
      });
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePayDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalSupplier || payAmount <= 0) return;
    await posService.recordSupplierDuePayment(payModalSupplier.id, payAmount);
    setPayModalSupplier(null);
    setPayAmount(0);
  };

  const totalDue = suppliers.reduce((s, x) => s + (x.dueAmount || 0), 0);
  const totalPurchased = suppliers.reduce((s, x) => s + (x.totalPurchased || 0), 0);

  const filtered = suppliers.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      s.contactPerson?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Suppliers &amp; Vendor Ledger
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage fabric mills, garment wholesalers, purchase volumes, and outstanding vendor dues.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-2 w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Registered Suppliers</span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Total Purchased</span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{totalPurchased.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Payable Due Balance</span>
          <p className="text-2xl font-black font-mono text-amber-700 mt-1">
            ৳{totalDue.toLocaleString('en-BD')}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by company name, contact person, or phone..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Supplier Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-xs text-neutral-500 space-y-2">
          <Building2 className="w-9 h-9 text-neutral-300 mx-auto" />
          <p className="font-bold text-neutral-900 text-sm">No suppliers added yet</p>
          <p className="text-neutral-400">Add your fabric &amp; garment suppliers to link stock purchases and track dues.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((sup) => (
            <div key={sup.id} className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">{sup.name}</h3>
                    <p className="text-[11px] text-neutral-500">
                      {sup.category || 'Apparel Supplier'}
                      {sup.contactPerson ? ` · ${sup.contactPerson}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(sup)}
                      className="p-1.5 text-neutral-500 hover:text-black cursor-pointer"
                      title="Edit Supplier"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => posService.deleteSupplier(sup.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                      title="Delete Supplier"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-neutral-600 pt-1">
                  <p className="flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{sup.phone}</span>
                  </p>
                  {sup.address && (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                      <span>{sup.address}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-100 space-y-2.5 text-xs tabular-nums">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block">Purchased</span>
                    <span className="font-mono font-bold text-neutral-900">৳{sup.totalPurchased.toLocaleString('en-BD')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block">Paid</span>
                    <span className="font-mono font-bold text-emerald-700">৳{sup.totalPaid.toLocaleString('en-BD')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block">Due</span>
                    <span className={`font-mono font-bold ${sup.dueAmount > 0 ? 'text-amber-700' : 'text-neutral-500'}`}>
                      ৳{sup.dueAmount.toLocaleString('en-BD')}
                    </span>
                  </div>
                </div>

                {sup.dueAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayModalSupplier(sup);
                      setPayAmount(sup.dueAmount);
                    }}
                    className="w-full py-2 bg-neutral-900 text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-black cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Record Due Payment</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Supplier Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editing ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                  Supplier / Mill Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dhaka Textile Mills"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. Karim Uddin"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Category / Goods</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Panjabi Fabric / Packaging"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Islampur / Narayanganj / Mirpur"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Supplier Due Modal */}
      {payModalSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Pay Supplier Due
              </h3>
              <button
                type="button"
                onClick={() => setPayModalSupplier(null)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePayDue} className="space-y-3 text-xs">
              <p className="text-neutral-600">
                Supplier: <b>{payModalSupplier.name}</b> · Current Due:{' '}
                <b className="font-mono text-amber-700">৳{payModalSupplier.dueAmount.toLocaleString('en-BD')}</b>
              </p>
              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                  Payment Amount (৳)
                </label>
                <input
                  type="number"
                  min={1}
                  max={payModalSupplier.dueAmount}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalSupplier(null)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 cursor-pointer"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
