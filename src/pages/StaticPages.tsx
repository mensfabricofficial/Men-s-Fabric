import React from 'react';
import { Truck, ShieldCheck, RotateCcw, Phone, Mail, MapPin, MessageCircle, HelpCircle, Ruler } from 'lucide-react';

interface StaticPageProps {
  type: 'about' | 'contact' | 'faq' | 'size-guide' | 'shipping' | 'return' | 'privacy' | 'terms';
  onNavigate: (route: string) => void;
}

export const StaticPage: React.FC<StaticPageProps> = ({ type, onNavigate }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      
      {/* About Page */}
      {type === 'about' && (
        <div className="space-y-8">
          <div className="border-b border-neutral-200 pb-6 text-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Our Heritage & Craft</span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight mt-1">
              About MEN'S FABRIC
            </h1>
          </div>
          
          <div className="prose text-sm text-neutral-700 leading-relaxed space-y-4">
            <p className="text-base font-medium text-neutral-900">
              MEN'S FABRIC was founded with a singular conviction: to create uncompromising menswear rooted in authenticity, premium textiles, and effortless modern fits tailored for Bangladesh.
            </p>
            <p>
              We source raw long-staple cottons, breathable blended linens, and rich traditional weaves from reputable international and domestic textile mills. Every collar point, sleeve cuff, and seam is measured and stress-tested to endure daily urban life while preserving its graceful drape.
            </p>
            <p>
              Whether you are looking for an executive formal shirt, an opulent festive panjabi, or an everyday refined casual garment, MEN'S FABRIC is dedicated to understated luxury with transparent value.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-neutral-200">
            <div className="p-4 bg-neutral-50 rounded-lg text-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-1">Pure Authenticity</h3>
              <p className="text-[11px] text-neutral-500">100% genuine yarns, true yarn counts, and zero synthetic shortcuts.</p>
            </div>
            <div className="p-4 bg-neutral-50 rounded-lg text-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-1">Tailored Comfort</h3>
              <p className="text-[11px] text-neutral-500">Pattern-engineered for subcontinental body profiles and climate.</p>
            </div>
            <div className="p-4 bg-neutral-50 rounded-lg text-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-1">Direct Delivery</h3>
              <p className="text-[11px] text-neutral-500">Delivered directly to your hands with Cash on Delivery nationwide.</p>
            </div>
          </div>
        </div>
      )}

      {/* Contact Page */}
      {type === 'contact' && (
        <div className="space-y-8">
          <div className="border-b border-neutral-200 pb-6 text-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Get in Touch</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mt-1">
              Contact Us
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
              Our customer care team is available Saturday to Thursday, 10:00 AM – 9:00 PM (Asia/Dhaka).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-6 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center">
                <Phone className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Phone Support</h3>
              <p className="text-xs text-neutral-600">Call for instant order or sizing assistance.</p>
              <p className="text-sm font-bold text-neutral-900">+880 1700-000000</p>
            </div>

            <div className="p-6 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                <MessageCircle className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">WhatsApp Chat</h3>
              <p className="text-xs text-neutral-600">Quick inquiries, photos, and live order placement.</p>
              <a href="https://wa.me/8801700000000" target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-emerald-700 underline">
                Chat on WhatsApp →
              </a>
            </div>

            <div className="p-6 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Email Inquiries</h3>
              <p className="text-xs text-neutral-600">Official correspondence & corporate inquiries.</p>
              <p className="text-xs font-semibold text-neutral-900">mensfabricofficial@gmail.com</p>
            </div>

            <div className="p-6 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Distribution Hub</h3>
              <p className="text-xs text-neutral-600">Dhaka Central Hub, Bangladesh</p>
              <p className="text-xs font-semibold text-neutral-900">Nationwide Shipping Available</p>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Page */}
      {type === 'faq' && (
        <div className="space-y-8">
          <div className="border-b border-neutral-200 pb-6 text-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Help Center</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mt-1">
              Frequently Asked Questions
            </h1>
          </div>

          <div className="divide-y divide-neutral-200 text-xs sm:text-sm text-neutral-700 space-y-4">
            <div className="pt-4">
              <h3 className="font-bold text-neutral-900 mb-1">How does Cash on Delivery (COD) work?</h3>
              <p className="text-neutral-600">You do not need to make any advance payment. Simply place your order online, and when the courier delivers your parcel, you can inspect the package before paying cash to the delivery agent.</p>
            </div>
            <div className="pt-4">
              <h3 className="font-bold text-neutral-900 mb-1">What are your delivery charges and timelines?</h3>
              <p className="text-neutral-600"><b>Inside Dhaka City:</b> ৳70 (typically delivered in 24–48 hours).<br /><b>Outside Dhaka (All Bangladesh):</b> ৳130 (typically delivered in 2–4 business days via courier).</p>
            </div>
            <div className="pt-4">
              <h3 className="font-bold text-neutral-900 mb-1">What if the garment does not fit me properly?</h3>
              <p className="text-neutral-600">We offer a 7-day easy exchange window. Simply contact our support team via WhatsApp or phone with your Order ID, and we will arrange a replacement size.</p>
            </div>
            <div className="pt-4">
              <h3 className="font-bold text-neutral-900 mb-1">How can I track my parcel?</h3>
              <p className="text-neutral-600">Visit our Track Order page at any time, enter your Order Number (e.g. MF-102948) and your phone number to see live updates from packing to delivery.</p>
            </div>
          </div>
        </div>
      )}

      {/* Size Guide Page */}
      {type === 'size-guide' && (
        <div className="space-y-8">
          <div className="border-b border-neutral-200 pb-6 text-center">
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Precision Fit</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mt-1">
              Size & Measurement Guide
            </h1>
            <p className="text-xs text-neutral-500 mt-2">All measurements are in inches. Regular Tailored Fit.</p>
          </div>

          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Shirts (Casual & Formal)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse border border-neutral-200">
                  <thead className="bg-neutral-100 text-neutral-700 font-bold uppercase">
                    <tr><th className="p-3 border">Size</th><th className="p-3 border">Chest</th><th className="p-3 border">Length</th><th className="p-3 border">Sleeve</th><th className="p-3 border">Collar</th></tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    <tr><td className="p-3 border font-bold">S (38)</td><td className="p-3 border">38"</td><td className="p-3 border">28.5"</td><td className="p-3 border">24"</td><td className="p-3 border">14.5"</td></tr>
                    <tr><td className="p-3 border font-bold">M (40)</td><td className="p-3 border">40"</td><td className="p-3 border">29.5"</td><td className="p-3 border">24.5"</td><td className="p-3 border">15"</td></tr>
                    <tr><td className="p-3 border font-bold">L (42)</td><td className="p-3 border">42"</td><td className="p-3 border">30.5"</td><td className="p-3 border">25"</td><td className="p-3 border">15.5"</td></tr>
                    <tr><td className="p-3 border font-bold">XL (44)</td><td className="p-3 border">44"</td><td className="p-3 border">31.5"</td><td className="p-3 border">25.5"</td><td className="p-3 border">16"</td></tr>
                    <tr><td className="p-3 border font-bold">XXL (46)</td><td className="p-3 border">46"</td><td className="p-3 border">32"</td><td className="p-3 border">26"</td><td className="p-3 border">16.5"</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-3">Panjabi (Traditional)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse border border-neutral-200">
                  <thead className="bg-neutral-100 text-neutral-700 font-bold uppercase">
                    <tr><th className="p-3 border">Size</th><th className="p-3 border">Chest</th><th className="p-3 border">Length</th><th className="p-3 border">Sleeve</th></tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    <tr><td className="p-3 border font-bold">38 (S)</td><td className="p-3 border">40"</td><td className="p-3 border">38"</td><td className="p-3 border">24"</td></tr>
                    <tr><td className="p-3 border font-bold">40 (M)</td><td className="p-3 border">42"</td><td className="p-3 border">40"</td><td className="p-3 border">24.5"</td></tr>
                    <tr><td className="p-3 border font-bold">42 (L)</td><td className="p-3 border">44"</td><td className="p-3 border">42"</td><td className="p-3 border">25"</td></tr>
                    <tr><td className="p-3 border font-bold">44 (XL)</td><td className="p-3 border">46"</td><td className="p-3 border">44"</td><td className="p-3 border">25.5"</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Policy */}
      {type === 'shipping' && (
        <div className="space-y-6 text-xs sm:text-sm text-neutral-700 leading-relaxed">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-4">
            Shipping & Delivery Policy
          </h1>
          <p>At MEN'S FABRIC, we ensure fast, reliable delivery throughout Bangladesh in partnership with leading express courier networks.</p>
          <h3 className="font-bold text-neutral-900 pt-2">Delivery Rates & Coverage</h3>
          <ul className="list-disc pl-5 space-y-1 text-neutral-600">
            <li><b>Inside Dhaka:</b> ৳70 flat delivery fee. Expected within 24 to 48 hours.</li>
            <li><b>Outside Dhaka:</b> ৳130 flat delivery fee across all 64 districts. Expected within 2 to 4 business days.</li>
            <li><b>Free Shipping:</b> Orders exceeding ৳2,500 automatically receive complimentary standard shipping.</li>
          </ul>
          <h3 className="font-bold text-neutral-900 pt-2">Inspection on Delivery</h3>
          <p>We encourage customers to check the exterior condition of the package before completing payment with the courier.</p>
        </div>
      )}

      {/* Return Policy */}
      {type === 'return' && (
        <div className="space-y-6 text-xs sm:text-sm text-neutral-700 leading-relaxed">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-4">
            Return & Exchange Policy
          </h1>
          <p>Your satisfaction is our priority. If an item does not fit or arrives with a defect, we provide a 7-day exchange window.</p>
          <h3 className="font-bold text-neutral-900 pt-2">Conditions for Exchange:</h3>
          <ul className="list-disc pl-5 space-y-1 text-neutral-600">
            <li>Items must be unworn, unwashed, and with all original tags attached.</li>
            <li>Requests must be initiated within 7 days of package receipt.</li>
            <li>Exchange is subject to stock availability of the requested size/color.</li>
          </ul>
        </div>
      )}

      {/* Privacy Policy */}
      {type === 'privacy' && (
        <div className="space-y-6 text-xs sm:text-sm text-neutral-700 leading-relaxed">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p>MEN'S FABRIC respects the privacy of our valued clientele. We collect only necessary contact information (name, address, mobile number) exclusively to fulfill your orders and keep you updated on delivery status.</p>
          <p>We never sell, rent, or trade customer information to third parties.</p>
        </div>
      )}

      {/* Terms & Conditions */}
      {type === 'terms' && (
        <div className="space-y-6 text-xs sm:text-sm text-neutral-700 leading-relaxed">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-4">
            Terms & Conditions
          </h1>
          <p>By placing an order on MEN'S FABRIC, you agree to provide truthful delivery information and honor Cash on Delivery terms upon delivery.</p>
          <p>All trademarks, fabric designs, logos, and digital imagery are the property of MEN'S FABRIC.</p>
        </div>
      )}

    </div>
  );
};
