import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';

interface Review {
  _id: string;
  rideId: any;
  reviewerId: { _id: string; firstName: string; lastName: string; role: string };
  revieweeId: { _id: string; firstName: string; lastName: string; role: string };
  reviewerRole: string;
  rating: number;
  comment: string;
  tags: string[];
  subRatings: Record<string, number>;
  sentimentScore: number;
  sentimentLabel: string;
  moderationStatus: string;
  isReported: boolean;
  reportReason: string;
  createdAt: string;
}

interface ReviewStats {
  total: number;
  avgRating: number;
  sentimentStats: { POSITIVE: number; NEUTRAL: number; NEGATIVE: number };
  reportedCount: number;
}

type ModerationFilter = 'ALL' | 'VISIBLE' | 'UNDER_REVIEW' | 'HIDDEN';

const ReviewModeration: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ModerationFilter>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'lowest_rating' | 'reported'>('newest');

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = filter === 'ALL' ? 'ALL' : filter;
      const resp = await fetch(`${API}/reviews?status=${statusParam}&page=${page}&limit=15`);
      if (resp.ok) {
        const data = await resp.json();
        setReviews(data.reviews || []);
        setStats(data.stats || null);
        setTotalPages(data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleModerate = useCallback(async (reviewId: string, status: string) => {
    try {
      const resp = await fetch(`${API}/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moderationStatus: status, moderatedBy: 'admin' }),
      });
      if (resp.ok) {
        setReviews((prev) =>
          prev.map((r) => (r._id === reviewId ? { ...r, moderationStatus: status } : r))
        );
        if (selectedReview?._id === reviewId) {
          setSelectedReview((prev) => (prev ? { ...prev, moderationStatus: status } : null));
        }
      }
    } catch (error) {
      console.error('Moderation failed:', error);
    }
  }, [selectedReview]);

  // ── Filter + sort locally ──
  const displayedReviews = React.useMemo(() => {
    let result = [...reviews];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          (r.comment || '').toLowerCase().includes(q) ||
          `${r.reviewerId?.firstName || ''} ${r.reviewerId?.lastName || ''}`.toLowerCase().includes(q) ||
          `${r.revieweeId?.firstName || ''} ${r.revieweeId?.lastName || ''}`.toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case 'lowest_rating':
        result.sort((a, b) => a.rating - b.rating);
        break;
      case 'reported':
        result.sort((a, b) => (b.isReported ? 1 : 0) - (a.isReported ? 1 : 0));
        break;
      default:
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [reviews, searchTerm, sortBy]);

  // ── Render star rating ──
  const renderStars = (rating: number, size = 16) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className="material-icons"
          style={{ fontSize: size, color: s <= rating ? '#f59e0b' : '#e2e8f0' }}
        >
          star
        </span>
      ))}
    </div>
  );

  // ── Sentiment badge ──
  const sentimentBadge = (label: string) => {
    const colors: Record<string, string> = {
      POSITIVE: 'bg-green-100 text-green-700',
      NEUTRAL: 'bg-gray-100 text-gray-600',
      NEGATIVE: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[label] || colors.NEUTRAL}`}>
        {label}
      </span>
    );
  };

  // ── Moderation status badge ──
  const moderationBadge = (status: string) => {
    const colors: Record<string, string> = {
      VISIBLE: 'bg-green-100 text-green-700',
      UNDER_REVIEW: 'bg-amber-100 text-amber-700',
      HIDDEN: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Review Moderation</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor, moderate, and analyze user reviews</p>
        </div>
        <button
          onClick={fetchReviews}
          className="mt-3 sm:mt-0 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-600 flex items-center gap-2 transition-colors"
        >
          <span className="material-icons-outlined" style={{ fontSize: 16 }}>refresh</span>
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl font-black text-gray-900">{stats.total}</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Total Reviews</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-amber-600">{stats.avgRating}</span>
              {renderStars(Math.round(stats.avgRating), 14)}
            </div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Avg Rating</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex gap-3">
              <div>
                <span className="text-lg font-black text-green-600">{stats.sentimentStats.POSITIVE}</span>
                <span className="text-[10px] text-gray-400 ml-0.5">+</span>
              </div>
              <div>
                <span className="text-lg font-black text-gray-500">{stats.sentimentStats.NEUTRAL}</span>
                <span className="text-[10px] text-gray-400 ml-0.5">~</span>
              </div>
              <div>
                <span className="text-lg font-black text-red-500">{stats.sentimentStats.NEGATIVE}</span>
                <span className="text-[10px] text-gray-400 ml-0.5">-</span>
              </div>
            </div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Sentiment</div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="text-3xl font-black text-red-600">{stats.reportedCount}</div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">Reported</div>
          </div>
        </div>
      )}

      {/* Sentiment Distribution Bar */}
      {stats && stats.total > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-8">
          <h3 className="text-sm font-black text-gray-700 mb-3">Sentiment Distribution</h3>
          <div className="flex rounded-full overflow-hidden h-4">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${(stats.sentimentStats.POSITIVE / stats.total) * 100}%` }}
              title={`Positive: ${stats.sentimentStats.POSITIVE}`}
            />
            <div
              className="bg-gray-400 transition-all"
              style={{ width: `${(stats.sentimentStats.NEUTRAL / stats.total) * 100}%` }}
              title={`Neutral: ${stats.sentimentStats.NEUTRAL}`}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${(stats.sentimentStats.NEGATIVE / stats.total) * 100}%` }}
              title={`Negative: ${stats.sentimentStats.NEGATIVE}`}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] font-bold text-gray-400">
            <span>Positive {Math.round((stats.sentimentStats.POSITIVE / stats.total) * 100)}%</span>
            <span>Neutral {Math.round((stats.sentimentStats.NEUTRAL / stats.total) * 100)}%</span>
            <span>Negative {Math.round((stats.sentimentStats.NEGATIVE / stats.total) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: 18 }}>
            search
          </span>
          <input
            type="text"
            placeholder="Search reviews by name or content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {(['ALL', 'VISIBLE', 'UNDER_REVIEW', 'HIDDEN'] as ModerationFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 bg-white"
        >
          <option value="newest">Newest First</option>
          <option value="lowest_rating">Lowest Rating</option>
          <option value="reported">Reported First</option>
        </select>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="py-20 text-center">
          <span className="material-icons-outlined text-4xl animate-spin text-blue-500">sync</span>
        </div>
      ) : displayedReviews.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
          <span className="material-icons-outlined text-5xl text-gray-200">rate_review</span>
          <div className="text-lg font-bold text-gray-400 mt-2">No reviews found</div>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedReviews.map((review) => (
            <div
              key={review._id}
              onClick={() => { setSelectedReview(review); setShowDetail(true); }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="material-icons-outlined text-blue-600" style={{ fontSize: 20 }}>
                      {review.reviewerRole === 'RIDER' ? 'person' : 'drive_eta'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900">
                      {review.reviewerId?.firstName} {review.reviewerId?.lastName}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {review.reviewerRole} → {review.revieweeId?.firstName} {review.revieweeId?.lastName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {review.isReported && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1">
                      <span className="material-icons" style={{ fontSize: 10 }}>flag</span>
                      Reported
                    </span>
                  )}
                  {moderationBadge(review.moderationStatus)}
                </div>
              </div>

              <div className="flex items-center gap-3 mb-2">
                {renderStars(review.rating)}
                {sentimentBadge(review.sentimentLabel)}
                <span className="text-[10px] text-gray-400">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>

              {review.comment && (
                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{review.comment}</p>
              )}

              {review.tags && review.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {review.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                {review.moderationStatus !== 'VISIBLE' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleModerate(review._id, 'VISIBLE'); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                  >
                    Approve
                  </button>
                )}
                {review.moderationStatus !== 'HIDDEN' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleModerate(review._id, 'HIDDEN'); }}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    Hide
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm font-bold text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-bold text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {showDetail && selectedReview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-900">Review Detail</h2>
              <button
                onClick={() => setShowDetail(false)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                <span className="material-icons-outlined text-gray-500">close</span>
              </button>
            </div>

            {/* Reviewer & Reviewee */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">Reviewer</div>
                <div className="text-sm font-bold text-gray-900">
                  {selectedReview.reviewerId?.firstName} {selectedReview.reviewerId?.lastName}
                </div>
                <div className="text-[10px] text-gray-500">{selectedReview.reviewerRole}</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl">
                <div className="text-[10px] font-bold text-purple-400 uppercase mb-1">Reviewee</div>
                <div className="text-sm font-bold text-gray-900">
                  {selectedReview.revieweeId?.firstName} {selectedReview.revieweeId?.lastName}
                </div>
                <div className="text-[10px] text-gray-500">{selectedReview.revieweeId?.role}</div>
              </div>
            </div>

            {/* Rating */}
            <div className="mb-6 text-center">
              <div className="text-4xl font-black text-gray-900 mb-1">{selectedReview.rating}.0</div>
              {renderStars(selectedReview.rating, 28)}
              <div className="flex items-center justify-center gap-2 mt-2">
                {sentimentBadge(selectedReview.sentimentLabel)}
                <span className="text-xs text-gray-400">Score: {selectedReview.sentimentScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Sub-ratings */}
            {selectedReview.subRatings && Object.keys(selectedReview.subRatings).length > 0 && (
              <div className="mb-6">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">Sub-Ratings</div>
                <div className="space-y-2">
                  {Object.entries(selectedReview.subRatings).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 capitalize">{key}</span>
                      <div className="flex items-center gap-2">
                        {renderStars(val as number, 14)}
                        <span className="text-xs font-bold text-gray-500">{val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comment */}
            {selectedReview.comment && (
              <div className="mb-6">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">Comment</div>
                <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">
                  {selectedReview.comment}
                </div>
              </div>
            )}

            {/* Tags */}
            {selectedReview.tags && selectedReview.tags.length > 0 && (
              <div className="mb-6">
                <div className="text-xs font-bold text-gray-400 uppercase mb-2">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {selectedReview.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Report info */}
            {selectedReview.isReported && (
              <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-icons text-red-500" style={{ fontSize: 16 }}>flag</span>
                  <span className="text-sm font-bold text-red-700">Reported</span>
                </div>
                <div className="text-xs text-red-600">{selectedReview.reportReason || 'No reason provided'}</div>
              </div>
            )}

            {/* Moderation status */}
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Moderation Status</div>
              <div className="flex items-center gap-2">
                {moderationBadge(selectedReview.moderationStatus)}
                <span className="text-xs text-gray-400">
                  {new Date(selectedReview.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Moderation actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handleModerate(selectedReview._id, 'VISIBLE')}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${
                  selectedReview.moderationStatus === 'VISIBLE'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                <span className="material-icons-outlined mr-1" style={{ fontSize: 16 }}>check_circle</span>
                Approve
              </button>
              <button
                onClick={() => handleModerate(selectedReview._id, 'HIDDEN')}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${
                  selectedReview.moderationStatus === 'HIDDEN'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <span className="material-icons-outlined mr-1" style={{ fontSize: 16 }}>visibility_off</span>
                Hide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewModeration;
