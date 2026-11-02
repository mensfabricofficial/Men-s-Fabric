import React, { useEffect, useState } from 'react';
import { CheckCircle, Package, ArrowRight, Truck, Phone, MapPin } from 'lucide-react';
import { Order } from '../types';
import { orderService } from '../services/orderService';

interface OrderConfirmationPageProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const OrderConfirmationPage: React.FC<OrderConfirmationPageProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const url = new URL(window.location.origin + currentRoute);
  const orderId = url.searchParams.get('id');
  const orderNumber = url.searchParams.get('number');

  useEffect(() => {
    if (orderId) {
      orderService.getOrderById(orderId).then((data) => {
        setOrder(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [orderId]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 text-center">
      {/* Success Badge */}
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-10 h-10" />
      </div>

      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-1">
        Order Placed Successfully
      </p>
      <h1 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-2">
        Thank You for Your Order!
      </h1>
      <p className="text-xs sm:text-sm text-neutral-500 max-w-md mx-auto mb-8">
        We have received your order and our dispatch team is already preparing your package.
      </p>

      {/* Order Details Card */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 sm:p-8 text-left space-y-6 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-200 gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Order Reference</span>
            <p className="text-lg font-extrabold text-black">{order?.orderNumber || orderNumber || 'MF-ORDER'}</p>
          </div>
          <div className="sm:text-right">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Payment Method</span>
            <p className="text-xs font-semibold text-neutral-800">Cash on Delivery (COD)</p>
          </div>
        </div>

        {order && (
          <>
            {/* Items summary */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 block">
                Ordered Items ({order.items.length})
              </span>
              <div className="divide-y divide-neutral-200">
                {order.items.map((item, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.productImage || '/logo.jpg'}
                        alt={item.productName}
                        className="w-10 h-12 object-cover rounded bg-white border border-neutral-200"
                      />
                      <div>
                        <p className="font-semibold text-neutral-900">{item.productName}</p>
                        <p className="text-[11px] text-neutral-500">
                          Size: {item.size} • Color: {item.color} • Qty: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-neutral-900">
                      ৳{item.totalPrice.toLocaleString('en-BD')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Address & delivery info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-neutral-200 text-xs text-neutral-600">
              <div className="space-y-1">
                <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block">
                  Delivery Destination
                </span>
                <p className="font-semibold text-neutral-900">{order.customerName}</p>
                <p>{order.shippingAddress.address}</p>
                <p>{order.shippingAddress.district}, {order.shippingAddress.division}</p>
                <p className="text-neutral-700 font-medium">📞 {order.customerPhone}</p>
              </div>

              <div className="space-y-1.5 sm:text-right">
                <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block">
                  Order Breakdown
                </span>
                <div className="flex justify-between sm:justify-end gap-4">
                  <span>Subtotal:</span>
                  <span className="font-medium text-neutral-900">৳{order.subtotal.toLocaleString('en-BD')}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between sm:justify-end gap-4 text-emerald-700">
                    <span>Discount:</span>
                    <span className="font-medium">-৳{order.discount.toLocaleString('en-BD')}</span>
                  </div>
                )}
                <div className="flex justify-between sm:justify-end gap-4">
                  <span>Delivery ({order.deliveryZone}):</span>
                  <span className="font-medium text-neutral-900">৳{order.deliveryCharge.toLocaleString('en-BD')}</span>
                </div>
                <div className="flex justify-between sm:justify-end gap-4 text-sm font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                  <span>Total Due:</span>
                  <span>৳{order.total.toLocaleString('en-BD')}</span>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="bg-neutral-100 p-3.5 rounded-lg flex items-center gap-2.5 text-xs text-neutral-700">
          <Truck className="w-4 h-4 text-neutral-800 shrink-0" />
          <span>Our delivery partner will contact your phone number prior to parcel delivery. Please keep cash ready.</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => onNavigate(`/track-order?number=${order?.orderNumber || orderNumber || ''}&phone=${order?.customerPhone || ''}`)}
          className="w-full sm:w-auto px-7 py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          Track My Order
        </button>
        <button
          onClick={() => onNavigate('/shop')}
          className="w-full sm:w-auto px-7 py-3 border border-neutral-300 text-neutral-700 text-xs font-bold uppercase tracking-wider rounded-lg hover:border-black hover:text-black transition-colors cursor-pointer"
        >
          Continue Shopping
        </button>
      </div>

    </div>
  );
};
