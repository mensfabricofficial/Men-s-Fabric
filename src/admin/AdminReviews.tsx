import React, { useState, useEffect } from 'react';
import { Star, Check, X, Trash2, MessageSquare } from 'lucide-react';
import { Review } from '../types';
import { settingsService } from '../services/settingsService';

export const AdminReviews: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await settingsService.getAllReviewsAdmin();
      setReviews(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleToggleApproval = async (r: Review) => {
    try {
      await settingsService.updateReviewApproval(r.id, !r.approved);
      await loadReviews();
    } catch {
      alert('Failed to update review status.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this review permanently?')) return;
    try {
      await settingsService.deleteReview(id);
      await loadReviews();
    } catch {
      alert('Failed to delete review.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
          Customer Reviews Moderation
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Approve, review, or remove submitted customer testimonials and ratings.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <MessageSquare className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No customer reviews yet</h4>
            <p className="text-xs text-neutral-500">Submitted reviews will appear here for administrator verification.</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Product</th>
                <th className="p-3.5">Rating</th>
                <th className="p-3.5">Feedback</th>
                <th className="p-3.5">Approval Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {reviews.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/50">
                  <td className="p-3.5 font-bold text-neutral-900">{r.customerName}</td>
                  <td className="p-3.5 text-neutral-700">{r.productName || r.productId}</td>
                  <td className="p-3.5">
                    <div className="flex text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-500' : 'text-neutral-200'}`} />
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5 text-neutral-700 max-w-xs">{r.comment}</td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      r.approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {r.approved ? 'Approved' : 'Pending Review'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right space-x-2">
                    <button
                      onClick={() => handleToggleApproval(r)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        r.approved ? 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {r.approved ? 'Hide' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1 text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
};
