import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  UserPlus, 
  Search, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  AlertCircle, 
  Lock, 
  Mail, 
  Phone, 
  Shield, 
  UserCheck, 
  UserX,
  Key,
  Copy,
  ExternalLink
} from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { settingsService } from '../services/settingsService';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'super_admin' | 'store_manager' | 'inventory_editor' | 'support_staff';
  active: boolean;
  addedBy: string;
  createdAt: string;
  notes?: string;
}

const ROLE_LABELS: Record<string, { title: string; desc: string; badgeClass: string }> = {
  super_admin: {
    title: 'Super Administrator',
    desc: 'Full administrative access to entire store, financial settings, and staff management.',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  store_manager: {
    title: 'Store & Orders Manager',
    desc: 'Process customer orders, verify bKash/Nagad payments, and manage fulfillment.',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  inventory_editor: {
    title: 'Catalog & Inventory Editor',
    desc: 'Manage apparel products, variants, size charts, pricing, and stock levels.',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  support_staff: {
    title: 'Customer Support Staff',
    desc: 'View customer orders, delivery tracking, customer addresses, and reviews.',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
  }
};

export const AdminAdmins: React.FC = () => {
  const { currentUser } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<AdminUser['role']>('store_manager');
  const [formActive, setFormActive] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'settings', 'adminsList'));
      if (snap.exists()) {
        const data = snap.data()?.admins || {};
        const list: AdminUser[] = Object.values(data);
        setAdmins(list);
      } else {
        setAdmins([]);
      }
    } catch (err) {
      console.warn('Failed to fetch admins from Firestore:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const openAddModal = () => {
    setEditingAdmin(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('store_manager');
    setFormActive(true);
    setFormNotes('');
    setErrorMsg('');
    setModalOpen(true);
  };

  const openEditModal = (adm: AdminUser) => {
    setEditingAdmin(adm);
    setFormName(adm.name);
    setFormEmail(adm.email);
    setFormPhone(adm.phone || '');
    setFormRole(adm.role);
    setFormActive(adm.active !== false);
    setFormNotes(adm.notes || '');
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = formEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!formName.trim()) {
      setErrorMsg('Please enter the administrator full name.');
      return;
    }

    setSaving(true);
    const adminId = editingAdmin?.id || `adm_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const adminPayload: AdminUser = {
      id: adminId,
      name: formName.trim(),
      email: cleanEmail,
      phone: formPhone.trim(),
      role: formRole,
      active: formActive,
      addedBy: currentUser?.email || 'Store Owner',
      createdAt: editingAdmin?.createdAt || nowIso,
      notes: formNotes.trim(),
    };

    try {
      const settingsRef = doc(db, 'settings', 'adminsList');
      await setDoc(
        settingsRef,
        {
          admins: {
            [adminId]: adminPayload,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Also mirror to admins collection if accessible
      setDoc(doc(db, 'admins', adminId), {
        email: cleanEmail,
        name: formName.trim(),
        role: formRole,
        active: formActive,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});

      if (currentUser) {
        await settingsService.logAdminAction(
          currentUser.uid,
          currentUser.email || '',
          editingAdmin ? 'UPDATE_ADMIN' : 'ADD_ADMIN',
          cleanEmail,
          `${editingAdmin ? 'Updated' : 'Added'} admin: ${formName.trim()} (${formRole})`
        );
      }

      setActionToast(`Administrator ${formName.trim()} saved successfully.`);
      setTimeout(() => setActionToast(null), 3500);
      setModalOpen(false);
      await loadAdmins();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save administrator to Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (adm: AdminUser) => {
    const updatedStatus = !adm.active;
    try {
      const settingsRef = doc(db, 'settings', 'adminsList');
      await setDoc(
        settingsRef,
        {
          admins: {
            [adm.id]: {
              ...adm,
              active: updatedStatus,
            },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setAdmins((prev) =>
        prev.map((a) => (a.id === adm.id ? { ...a, active: updatedStatus } : a))
      );
      setActionToast(`Administrator ${adm.name} set to ${updatedStatus ? 'Active' : 'Suspended'}.`);
      setTimeout(() => setActionToast(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    try {
      const settingsRef = doc(db, 'settings', 'adminsList');
      await updateDoc(settingsRef, {
        [`admins.${adminId}`]: deleteField(),
      });
      setAdmins((prev) => prev.filter((a) => a.id !== adminId));
      setActionToast(`Administrator "${adminName}" removed.`);
      setTimeout(() => setActionToast(null), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  const copyInviteText = (emailToCopy: string, roleTitle: string) => {
    const text = `Hello! You have been granted ${roleTitle} access to MEN'S FABRIC administration console.\n1. Go to: ${window.location.origin}/account\n2. Sign in or register with: ${emailToCopy}\n3. Access the admin console at: ${window.location.origin}/admin\nDevice Security Key: MF-DEV-2026`;
    navigator.clipboard.writeText(text);
    setCopiedKey(emailToCopy);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const filteredAdmins = admins.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.phone?.includes(q);
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
            Administrators & Staff Roles
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Add team members, assign role permissions, and control who can manage orders, products, and store settings.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-2 cursor-pointer shadow-sm w-fit"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Administrator</span>
        </button>
      </div>

      {/* Primary Owner Permanent Card */}
      <div className="bg-gradient-to-r from-neutral-900 to-black text-white p-5 rounded-2xl border border-neutral-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-wide">MEN'S FABRIC Official</span>
                <span className="text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                  Primary Owner
                </span>
              </div>
              <p className="text-xs text-neutral-300 font-mono mt-0.5">admin@mensfabric.com</p>
              <p className="text-[10px] text-neutral-400 font-mono">UID: lw3mX9AivNduzBGundo3rB2jZcp2</p>
            </div>
          </div>
          
          <div className="text-left sm:text-right text-xs">
            <span className="text-neutral-400 block text-[10px] uppercase font-bold tracking-wider">Access Level</span>
            <span className="font-bold text-white">Full System Super Administrator</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search admins by name, email, or phone..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
        <span className="text-xs text-neutral-500 font-semibold whitespace-nowrap">
          {admins.length} {admins.length === 1 ? 'Admin Added' : 'Admins Added'}
        </span>
      </div>

      {/* Admins Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading administrators...</div>
        ) : filteredAdmins.length === 0 ? (
          <div className="p-10 text-center text-neutral-500 space-y-2">
            <Shield className="w-10 h-10 text-neutral-300 mx-auto" />
            <h4 className="text-sm font-bold text-neutral-900">No additional staff members yet</h4>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Click the "Add New Administrator" button above to grant order or catalog management access to your team.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Administrator</th>
                  <th className="p-3.5">Assigned Role</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Added Date</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredAdmins.map((adm) => {
                  const roleConfig = ROLE_LABELS[adm.role] || ROLE_LABELS.store_manager;
                  return (
                    <tr key={adm.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5">
                        <p className="font-bold text-neutral-900">{adm.name}</p>
                        <p className="font-mono text-neutral-500 text-[11px]">{adm.email}</p>
                      </td>
                      <td className="p-3.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${roleConfig.badgeClass}`}>
                          {roleConfig.title}
                        </span>
                        <p className="text-[10px] text-neutral-400 mt-0.5 max-w-xs line-clamp-1">{roleConfig.desc}</p>
                      </td>
                      <td className="p-3.5 text-neutral-600 font-mono text-[11px]">
                        {adm.phone || '—'}
                      </td>
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(adm)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase cursor-pointer transition-colors ${
                            adm.active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-800 hover:bg-red-200'
                          }`}
                        >
                          {adm.active ? (
                            <>
                              <UserCheck className="w-3 h-3 text-emerald-600" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3 text-red-600" />
                              <span>Suspended</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="p-3.5 text-neutral-400 whitespace-nowrap text-[11px]">
                        {new Date(adm.createdAt).toLocaleDateString('en-BD')}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyInviteText(adm.email, roleConfig.title)}
                            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md transition-colors cursor-pointer"
                            title="Copy login instructions for this staff member"
                          >
                            {copiedKey === adm.email ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(adm)}
                            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md transition-colors cursor-pointer"
                            title="Edit Role"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdmin(adm.id, adm.name)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md transition-colors cursor-pointer"
                            title="Remove Administrator"
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

      {/* Add / Edit Admin Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-neutral-200">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-neutral-800" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  {editingAdmin ? 'Edit Administrator Details' : 'Add New Administrator'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdmin} className="space-y-4 text-xs">
              
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Tanvir Hasan"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="staff@mensfabric.com"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-none focus:border-black font-mono"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  This person will use this email to sign in to the store and access the administration console.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Contact Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-none focus:border-black font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Administrative Role & Permissions <span className="text-red-500">*</span>
                </label>
                <select
                  value={formRole}
                  onChange={(e: any) => setFormRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-none focus:border-black font-bold cursor-pointer"
                >
                  <option value="store_manager">Store & Orders Manager (Order verification & fulfillment)</option>
                  <option value="inventory_editor">Catalog & Inventory Editor (Products, stock, categories)</option>
                  <option value="super_admin">Super Administrator (Full unrestricted access)</option>
                  <option value="support_staff">Customer Support Staff (Order lookups and reviews)</option>
                </select>
                <p className="text-[10px] text-neutral-500 mt-1">
                  {ROLE_LABELS[formRole]?.desc}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Account Status
                </label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-800">
                    <input
                      type="radio"
                      name="adminStatus"
                      checked={formActive}
                      onChange={() => setFormActive(true)}
                      className="accent-black"
                    />
                    <span>Active (Permit Access)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-800">
                    <input
                      type="radio"
                      name="adminStatus"
                      checked={!formActive}
                      onChange={() => setFormActive(false)}
                      className="accent-black"
                    />
                    <span>Suspended (Block Access)</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {saving ? 'Saving...' : editingAdmin ? 'Update Administrator' : 'Grant Admin Access'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Floating Action Toast */}
      {actionToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-black text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold border border-neutral-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{actionToast}</span>
        </div>
      )}

    </div>
  );
};
