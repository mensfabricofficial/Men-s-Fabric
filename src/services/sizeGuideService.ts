import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface SizeGuideRow {
  size: string;
  [key: string]: string;
}

export interface SizeGuideCategory {
  id: string;
  name: string;
  columns: { key: string; label: string }[];
  rows: SizeGuideRow[];
  unit: string;
  tip?: string;
}

export const DEFAULT_SIZE_GUIDES: SizeGuideCategory[] = [
  {
    id: 'panjabi',
    name: 'Panjabi (Traditional & Modern)',
    unit: 'Inches',
    tip: 'Measurements are for regular comfortable fit. For slim fit, consider going down one size.',
    columns: [
      { key: 'size', label: 'Size' },
      { key: 'chest', label: 'Chest' },
      { key: 'length', label: 'Length' },
      { key: 'sleeve', label: 'Sleeve' },
      { key: 'collar', label: 'Collar' },
    ],
    rows: [
      { size: '38 (S)', chest: '40"', length: '38"', sleeve: '24"', collar: '15"' },
      { size: '40 (M)', chest: '42"', length: '40"', sleeve: '24.5"', collar: '15.5"' },
      { size: '42 (L)', chest: '44"', length: '42"', sleeve: '25"', collar: '16"' },
      { size: '44 (XL)', chest: '46"', length: '44"', sleeve: '25.5"', collar: '16.5"' },
      { size: '46 (XXL)', chest: '48"', length: '45"', sleeve: '26"', collar: '17"' },
    ],
  },
  {
    id: 'shirts',
    name: 'Shirts (Casual & Formal)',
    unit: 'Inches',
    tip: 'All measurements are in inches. Regular tailored fit.',
    columns: [
      { key: 'size', label: 'Size' },
      { key: 'chest', label: 'Chest' },
      { key: 'length', label: 'Length' },
      { key: 'sleeve', label: 'Sleeve' },
      { key: 'collar', label: 'Collar' },
    ],
    rows: [
      { size: 'S (38)', chest: '38"', length: '28.5"', sleeve: '24"', collar: '14.5"' },
      { size: 'M (40)', chest: '40"', length: '29.5"', sleeve: '24.5"', collar: '15"' },
      { size: 'L (42)', chest: '42"', length: '30.5"', sleeve: '25"', collar: '15.5"' },
      { size: 'XL (44)', chest: '44"', length: '31.5"', sleeve: '25.5"', collar: '16"' },
      { size: 'XXL (46)', chest: '46"', length: '32"', sleeve: '26"', collar: '16.5"' },
    ],
  },
  {
    id: 'tshirts',
    name: 'T-Shirts & Polos',
    unit: 'Inches',
    tip: 'Premium combed cotton regular cut.',
    columns: [
      { key: 'size', label: 'Size' },
      { key: 'chest', label: 'Chest' },
      { key: 'length', label: 'Length' },
      { key: 'sleeve', label: 'Sleeve' },
    ],
    rows: [
      { size: 'M', chest: '39"', length: '27.5"', sleeve: '8"' },
      { size: 'L', chest: '41"', length: '28.5"', sleeve: '8.5"' },
      { size: 'XL', chest: '43"', length: '29.5"', sleeve: '9"' },
      { size: 'XXL', chest: '45"', length: '30.5"', sleeve: '9.5"' },
    ],
  },
  {
    id: 'pants',
    name: 'Trousers & Chinos',
    unit: 'Inches',
    tip: 'Measured around waistband and inseam length.',
    columns: [
      { key: 'size', label: 'Waist' },
      { key: 'length', label: 'Length' },
      { key: 'thigh', label: 'Thigh' },
      { key: 'bottom', label: 'Bottom Opening' },
    ],
    rows: [
      { size: '30', length: '39"', thigh: '22"', bottom: '13"' },
      { size: '32', length: '40"', thigh: '23"', bottom: '13.5"' },
      { size: '34', length: '40.5"', thigh: '24"', bottom: '14"' },
      { size: '36', length: '41"', thigh: '25"', bottom: '14.5"' },
      { size: '38', length: '41.5"', thigh: '26"', bottom: '15"' },
    ],
  },
];

const LOCAL_STORAGE_KEY = 'mf_size_guides_v1';

export const sizeGuideService = {
  async getSizeGuides(): Promise<SizeGuideCategory[]> {
    try {
      const snap = await getDoc(doc(db, 'settings', 'sizeGuide'));
      if (snap.exists() && snap.data().categories) {
        const categories = snap.data().categories as SizeGuideCategory[];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(categories));
        return categories;
      }
    } catch (e) {
      console.warn('Using local fallback for size guide:', e);
    }

    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) return JSON.parse(local);
    } catch {
      // ignore
    }

    return DEFAULT_SIZE_GUIDES;
  },

  async saveSizeGuides(categories: SizeGuideCategory[]): Promise<void> {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(categories));
    try {
      await setDoc(doc(db, 'settings', 'sizeGuide'), {
        categories,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Unable to persist size guides to Firestore, saved locally:', e);
    }
  },

  async resetToDefaults(): Promise<SizeGuideCategory[]> {
    await this.saveSizeGuides(DEFAULT_SIZE_GUIDES);
    return DEFAULT_SIZE_GUIDES;
  },
};
