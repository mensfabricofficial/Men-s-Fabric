import React from 'react';
import { X, Printer } from 'lucide-react';
import { Order } from '../../types';
import { printElementById } from '../../lib/printHelper';
import { InvoiceSheet, getFormattedInvoiceNumber } from './InvoiceSheet';

interface A4InvoiceModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({ order, isOpen, onClose }) => {
  if (!isOpen) return null;

  const invoiceNumber = getFormattedInvoiceNumber(order.orderNumber, order.id);

  const handlePrint = () => {
    printElementById('printable-customer-invoice', invoiceNumber);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
      
      {/* Container (Same compact A4 proportions as Admin Panel) */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-3xl w-full my-2 sm:my-6 max-h-[94vh] flex flex-col justify-between overflow-hidden animate-fade-in print:m-0 print:p-0 print:max-w-none print:shadow-none print:rounded-none print:max-h-none">
        
        {/* Top Control Bar (Hidden in Print) */}
        <div className="p-3 sm:p-5 border-b border-neutral-200 flex items-center justify-between gap-2 bg-neutral-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">
              Invoice
            </span>
            <span className="font-mono text-xs font-bold text-neutral-600">{invoiceNumber}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Stylesheet */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #printable-customer-invoice, #printable-customer-invoice * {
              visibility: visible !important;
            }
            #printable-customer-invoice {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 12mm 15mm !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
          }
        ` }} />

        {/* Printable A4 Content */}
        <div id="printable-customer-invoice" className="p-3.5 sm:p-8 overflow-y-auto overflow-x-hidden flex-1">
          <InvoiceSheet order={order} />
        </div>

      </div>
    </div>
  );
};
