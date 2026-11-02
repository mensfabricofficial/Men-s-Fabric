import React, { createContext, useContext, useEffect, useState } from 'react';
import { Product } from '../types';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';

interface WishlistContextType {
  wishlistIds: string[];
  wishlistProducts: Product[];
  toggleWishlist: (product: Product) => Promise<void>;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('mf_wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const wishlistIds = wishlistProducts.map((p) => p.id);

  // Sync with Firestore when logged in
  useEffect(() => {
    if (!currentUser) return;
    const loadRemoteWishlist = async () => {
      try {
        const ref = doc(db, 'wishlists', currentUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const remoteList = (snap.data().products as Product[]) || [];
          setWishlistProducts(remoteList);
        }
      } catch (err) {
        console.warn('Wishlist load error:', err);
      }
    };
    loadRemoteWishlist();
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem('mf_wishlist', JSON.stringify(wishlistProducts));
    } catch (e) {
      console.error(e);
    }
  }, [wishlistProducts]);

  const toggleWishlist = async (product: Product) => {
    let next: Product[];
    if (wishlistIds.includes(product.id)) {
      next = wishlistProducts.filter((p) => p.id !== product.id);
    } else {
      next = [...wishlistProducts, product];
    }
    setWishlistProducts(next);

    if (currentUser) {
      try {
        await setDoc(doc(db, 'wishlists', currentUser.uid), {
          products: next,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to sync wishlist to Firestore:', e);
      }
    }
  };

  const isInWishlist = (productId: string) => wishlistIds.includes(productId);

  const clearWishlist = async () => {
    setWishlistProducts([]);
    if (currentUser) {
      try {
        await setDoc(doc(db, 'wishlists', currentUser.uid), {
          products: [],
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to clear remote wishlist:', e);
      }
    }
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlistIds,
        wishlistProducts,
        toggleWishlist,
        isInWishlist,
        clearWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
