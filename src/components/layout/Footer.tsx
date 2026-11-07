import React, { useEffect, useState } from 'react';
import { 
  Phone, 
  Mail, 
  MapPin, 
  MessageCircle, 
  Truck, 
  ShieldCheck, 
  RotateCcw, 
  CheckCircle, 
  Facebook, 
  Instagram, 
  Youtube 
} from 'lucide-react';
import { SiteSettings } from '../../types';
import { settingsService, defaultSettings } from '../../services/settingsService';

import { BrandLogo } from '../common/BrandLogo';

interface FooterProps {
  onNavigate: (route: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);

  useEffect(() => {
    settingsService.getSettings().then(setSettings);
  }, []);

  return (
    <footer className="bg-black text-white border-t border-neutral-800">
      {/* Trust Badges Bar */}
      <div className="border-b border-neutral-800 py-8 px-4 sm:px-6 lg:px-8 2xl:px-12">
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-neutral-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Nationwide Delivery</h4>
              <p className="text-[11px] text-neutral-400">Cash on Delivery across all 64 districts</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-neutral-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">100% Premium Fabric</h4>
              <p className="text-[11px] text-neutral-400">Carefully curated authentic fabrics</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5 text-neutral-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Easy 7-Day Exchange</h4>
              <p className="text-[11px] text-neutral-400">Hassle-free replacement policy</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-neutral-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">Customer Support</h4>
              <p className="text-[11px] text-neutral-400">Direct assistance via Phone & WhatsApp</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
          
          {/* Brand Info & Official Logo */}
          <div className="lg:col-span-2 space-y-4">
            <div className="inline-block py-1">
              <BrandLogo variant="light" size="lg" />
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-sm">
              {settings.storeDescription || "MEN'S FABRIC is a distinguished contemporary menswear brand in Bangladesh. We curate premium textiles, artisanal craftsmanship, and tailored fits."}
            </p>
            
            {/* Contact details */}
            <div className="space-y-2 pt-2 text-xs text-neutral-300">
              <div className="flex items-center gap-2.5">
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
                <span>{settings.phone}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-3.5 h-3.5 text-neutral-400" />
                <span>{settings.email}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span>{settings.address}</span>
              </div>
              {settings.whatsapp && (
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <a 
                    href={`https://wa.me/${settings.whatsapp.replace(/[^0-9]/g, '')}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="hover:underline text-emerald-400"
                  >
                    WhatsApp Order & Support
                  </a>
                </div>
              )}
            </div>

            {/* Social Links */}
            <div className="flex items-center space-x-3 pt-3">
              {settings.facebookUrl && (
                <a
                  href={settings.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {settings.instagramUrl && (
                <a
                  href={settings.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {settings.youtubeUrl && (
                <a
                  href={settings.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="YouTube"
                  className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
                >
                  <Youtube className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Shop Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Shop Collections</h4>
            <ul className="space-y-2.5 text-xs text-neutral-400">
              <li>
                <button onClick={() => onNavigate('/shop')} className="hover:text-white transition-colors cursor-pointer">
                  All Menswear
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/shop?filter=new')} className="hover:text-white transition-colors cursor-pointer">
                  New Arrivals
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/shop?filter=best')} className="hover:text-white transition-colors cursor-pointer">
                  Best Sellers
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/category/panjabi')} className="hover:text-white transition-colors cursor-pointer">
                  Panjabi & Traditional
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/category/shirts')} className="hover:text-white transition-colors cursor-pointer">
                  Formal & Casual Shirts
                </button>
              </li>
            </ul>
          </div>

          {/* Customer Care */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Customer Care</h4>
            <ul className="space-y-2.5 text-xs text-neutral-400">
              <li>
                <button onClick={() => onNavigate('/track-order')} className="hover:text-white transition-colors cursor-pointer">
                  Track Your Order
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/account')} className="hover:text-white transition-colors cursor-pointer">
                  My Account
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/size-guide')} className="hover:text-white transition-colors cursor-pointer">
                  Size Guide & Measurements
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/shipping-policy')} className="hover:text-white transition-colors cursor-pointer">
                  Shipping & Delivery Info
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/return-policy')} className="hover:text-white transition-colors cursor-pointer">
                  Return & Exchange Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/faq')} className="hover:text-white transition-colors cursor-pointer">
                  Frequently Asked Questions
                </button>
              </li>
            </ul>
          </div>

          {/* About & Policies */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-4">Company</h4>
            <ul className="space-y-2.5 text-xs text-neutral-400">
              <li>
                <button onClick={() => onNavigate('/about')} className="hover:text-white transition-colors cursor-pointer">
                  Our Story
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/contact')} className="hover:text-white transition-colors cursor-pointer">
                  Contact Us
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/privacy-policy')} className="hover:text-white transition-colors cursor-pointer">
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/terms')} className="hover:text-white transition-colors cursor-pointer">
                  Terms & Conditions
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright & payment methods */}
        <div className="border-t border-neutral-800 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
          <p>© {new Date().getFullYear()} MEN'S FABRIC. All Rights Reserved. Crafted for Bangladesh.</p>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded text-neutral-300 font-medium">
              💵 Cash on Delivery
            </span>
            <span className="bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded text-neutral-300 font-medium">
              🇧🇩 Nationwide Shipping
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
