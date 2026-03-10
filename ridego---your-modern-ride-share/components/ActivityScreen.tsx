
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

// ═══ Types ═══
interface RideData {
  _id: string;
  userId?: string;
  driverId?: string | { _id: string; firstName?: string; lastName?: string; photoUrl?: string; rating?: number; vehicleNumber?: string };
  pickup?: { address?: string; lat?: number; lng?: number };
  dropoff?: { address?: string; lat?: number; lng?: number };
  stops?: Array<{ address?: string; lat?: number; lng?: number }>;
  status: string;
  vehicleCategory?: string;
  fare?: number;
  currentFare?: number;
  completedFare?: number;
  distance?: string;
  duration?: string;
  bookingTime?: string;
  createdAt?: string;
  completedAt?: string;
  canceledAt?: string;
  canceledBy?: string;
  cancelReason?: string;
  cancellationFee?: number;
  co2Emissions?: number;
  co2Saved?: number;
  isPooled?: boolean;
  poolPassengersCount?: number;
  scheduledFor?: string;
  surgeMultiplier?: number;
  hasReview?: boolean;
  reviewRating?: number;
  paymentStatus?: string;
}

interface ReviewPayload {
  rideId: string;
  reviewerId: string;
  reviewerRole: string;
  rating: number;
  comment: string;
  tags: string[];
  subRatings: { safety?: number; punctuality?: number; cleanliness?: number; communication?: number; navigation?: number };
}

interface PaymentData {
  _id: string;
  amount: number;
  method: string;
  status: string;
  fareBreakdown?: {
    baseFare?: number;
    distanceCharge?: number;
    timeCharge?: number;
    tollCharges?: number;
    surgeMultiplier?: number;
    poolDiscount?: number;
    promoDiscount?: number;
    platformFee?: number;
    taxes?: number;
    driverPayout?: number;
  };
  refundAmount?: number;
  createdAt?: string;
}

type FilterCategory = 'ALL' | 'CAR' | 'BIKE' | 'AUTO' | 'POOL' | 'ECO';
type SortOption = 'newest' | 'oldest' | 'highest_fare' | 'lowest_fare';

// ═══ Review Tags ═══
const POSITIVE_TAGS = [
  { key: 'SAFE_DRIVER', label: 'Safe Driver', icon: 'verified_user' },
  { key: 'CLEAN_CAR', label: 'Clean Car', icon: 'auto_awesome' },
  { key: 'ON_TIME', label: 'On Time', icon: 'schedule' },
  { key: 'FRIENDLY', label: 'Friendly', icon: 'sentiment_satisfied' },
  { key: 'SMOOTH_RIDE', label: 'Smooth Ride', icon: 'directions_car' },
  { key: 'KNOWS_ROUTES', label: 'Knows Routes', icon: 'map' },
  { key: 'GREAT_CONVERSATION', label: 'Great Chat', icon: 'chat_bubble' },
];

const NEGATIVE_TAGS = [
  { key: 'UNSAFE_DRIVING', label: 'Unsafe', icon: 'warning' },
  { key: 'RUDE_BEHAVIOR', label: 'Rude', icon: 'sentiment_dissatisfied' },
  { key: 'DIRTY_VEHICLE', label: 'Dirty', icon: 'report' },
  { key: 'TOOK_LONGER_ROUTE', label: 'Long Route', icon: 'alt_route' },
];

const SUB_RATING_LABELS: Record<string, string> = {
  safety: 'Safety',
  punctuality: 'Punctuality',
  cleanliness: 'Cleanliness',
  communication: 'Communication',
  navigation: 'Navigation',
};

const ActivityScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Past' | 'Sent Requests'>('Past');
  const [rides, setRides] = useState<RideData[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── Ride detail / modal state ──
  const [selectedRide, setSelectedRide] = useState<RideData | null>(null);
  const [showRideDetail, setShowRideDetail] = useState(false);
  const [ridePayment, setRidePayment] = useState<PaymentData | null>(null);

  // ── Review modal state ──
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRide, setReviewRide] = useState<RideData | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewSubRatings, setReviewSubRatings] = useState<Record<string, number>>({});
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  // ── Filtering / sorting ──
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const RIDES_PER_PAGE = 10;

  // ── Stats ──
  const [showStats, setShowStats] = useState(false);

  const userStr = localStorage.getItem('leaflift_user');
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    if (!user?._id) return;

    if (activeTab === 'Sent Requests') {
      fetchSentRequests();
    } else {
      fetchRides();
    }
  }, [activeTab]);

  const fetchRides = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/${user._id}/ride-history?limit=100`);
      if (resp.ok) {
        const data = await resp.json();
        setRides(data.rides || data);
      }
    } catch (error) {
      // Fallback to old endpoint
      try {
        const resp = await fetch(`${API_BASE_URL}/api/rides/user/${user._id}`);
        if (resp.ok) {
          const data = await resp.json();
          setRides(data);
        }
      } catch {
        console.error('Fetch rides error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSentRequests = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/notifications/sent/${user._id}`);
      if (resp.ok) {
        const data = await resp.json();
        setSentRequests(data);
      }
    } catch (error) {
      console.error('Fetch requests error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Open ride detail modal ──
  const openRideDetail = useCallback(async (ride: RideData) => {
    setSelectedRide(ride);
    setShowRideDetail(true);
    setRidePayment(null);

    // Fetch payment info
    try {
      const resp = await fetch(`${API_BASE_URL}/api/payments/ride/${ride._id}`);
      if (resp.ok) {
        const data = await resp.json();
        setRidePayment(data);
      }
    } catch { /* no payment data available */ }
  }, []);

  // ── Open review modal ──
  const openReviewModal = useCallback((ride: RideData) => {
    setReviewRide(ride);
    setReviewRating(0);
    setReviewHover(0);
    setReviewComment('');
    setReviewTags([]);
    setReviewSubRatings({});
    setReviewSuccess(false);
    setShowReviewModal(true);
  }, []);

  // ── Submit review ──
  const submitReview = useCallback(async () => {
    if (!reviewRide || !user?._id || reviewRating === 0) return;
    setIsSubmittingReview(true);

    try {
      const payload: ReviewPayload = {
        rideId: reviewRide._id,
        reviewerId: user._id,
        reviewerRole: 'RIDER',
        rating: reviewRating,
        comment: reviewComment,
        tags: reviewTags,
        subRatings: reviewSubRatings as any,
      };

      const resp = await fetch(`${API_BASE_URL}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        setReviewSuccess(true);
        // Update local ride data
        setRides((prev) =>
          prev.map((r) =>
            r._id === reviewRide._id ? { ...r, hasReview: true, reviewRating: reviewRating } : r
          )
        );
        // Auto-close after 2s
        setTimeout(() => {
          setShowReviewModal(false);
          setReviewSuccess(false);
        }, 2000);
      } else {
        const err = await resp.json();
        alert(err.message || 'Failed to submit review');
      }
    } catch (error) {
      console.error('Review submit error:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsSubmittingReview(false);
    }
  }, [reviewRide, user, reviewRating, reviewComment, reviewTags, reviewSubRatings]);

  // ── Toggle review tag ──
  const toggleTag = useCallback((tag: string) => {
    setReviewTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  // ── Set sub-rating ──
  const setSubRating = useCallback((key: string, value: number) => {
    setReviewSubRatings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Filtered & sorted rides ──
  const upcomingRides = useMemo(
    () => rides.filter((r) => ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(r.status)),
    [rides]
  );

  const filteredPastRides = useMemo(() => {
    let result = rides.filter((r) => ['COMPLETED', 'CANCELED'].includes(r.status));

    // Category filter
    if (filterCategory !== 'ALL') {
      if (filterCategory === 'POOL') {
        result = result.filter((r) => r.isPooled);
      } else if (filterCategory === 'ECO') {
        result = result.filter((r) => r.vehicleCategory === 'ECO' || (r.co2Saved && r.co2Saved > 0));
      } else {
        result = result.filter((r) =>
          (r.vehicleCategory || '').toUpperCase() === filterCategory
        );
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.pickup?.address || '').toLowerCase().includes(q) ||
          (r.dropoff?.address || '').toLowerCase().includes(q) ||
          (r.vehicleCategory || '').toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortOption) {
      case 'oldest':
        result.sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());
        break;
      case 'highest_fare':
        result.sort((a, b) => (b.completedFare || b.currentFare || b.fare || 0) - (a.completedFare || a.currentFare || a.fare || 0));
        break;
      case 'lowest_fare':
        result.sort((a, b) => (a.completedFare || a.currentFare || a.fare || 0) - (b.completedFare || b.currentFare || b.fare || 0));
        break;
      default: // newest
        result.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    }

    return result;
  }, [rides, filterCategory, sortOption, searchQuery]);

  // ── Paginated past rides ──
  const paginatedRides = useMemo(() => {
    const start = (currentPage - 1) * RIDES_PER_PAGE;
    return filteredPastRides.slice(start, start + RIDES_PER_PAGE);
  }, [filteredPastRides, currentPage]);

  const totalPages = Math.ceil(filteredPastRides.length / RIDES_PER_PAGE);

  // ── Stats summary ──
  const stats = useMemo(() => {
    const completed = rides.filter((r) => r.status === 'COMPLETED');
    const canceled = rides.filter((r) => r.status === 'CANCELED');
    const totalFare = completed.reduce((s, r) => s + (r.completedFare || r.currentFare || r.fare || 0), 0);
    const totalCO2Saved = completed.reduce((s, r) => s + (r.co2Saved || 0), 0);
    const pooledRides = completed.filter((r) => r.isPooled).length;
    const avgRating =
      completed.filter((r) => r.reviewRating).length > 0
        ? completed.filter((r) => r.reviewRating).reduce((s, r) => s + (r.reviewRating || 0), 0) /
          completed.filter((r) => r.reviewRating).length
        : 0;

    // Category breakdown
    const categories: Record<string, number> = {};
    completed.forEach((r) => {
      const cat = r.vehicleCategory || 'OTHER';
      categories[cat] = (categories[cat] || 0) + 1;
    });

    return {
      totalRides: completed.length,
      canceledRides: canceled.length,
      totalFare: Math.round(totalFare),
      totalCO2Saved: Math.round(totalCO2Saved),
      pooledRides,
      avgRating: Math.round(avgRating * 10) / 10,
      categories,
    };
  }, [rides]);

  // ── Render a single ride card ──
  const renderRideItem = (ride: RideData) => {
    const fare = ride.completedFare || ride.currentFare || ride.fare || 0;
    const driverName =
      typeof ride.driverId === 'object' && ride.driverId
        ? `${ride.driverId.firstName || ''} ${ride.driverId.lastName || ''}`.trim()
        : '';

    return (
      <div
        key={ride._id}
        onClick={() => openRideDetail(ride)}
        className="flex gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-[32px] transition-all cursor-pointer group border border-gray-100 dark:border-zinc-800 shadow-sm mb-4 bg-white dark:bg-zinc-900/50"
      >
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
            ride.status === 'SEARCHING'
              ? 'bg-yellow-50 dark:bg-yellow-900/20'
              : ride.status === 'CANCELED'
              ? 'bg-red-50 dark:bg-red-900/20'
              : ride.isPooled
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : 'bg-gray-50 dark:bg-zinc-800'
          }`}
        >
          <span
            className={`material-icons-outlined text-3xl ${
              ride.status === 'SEARCHING'
                ? 'text-yellow-600 animate-pulse'
                : ride.status === 'CANCELED'
                ? 'text-red-400'
                : ride.isPooled
                ? 'text-blue-500'
                : 'opacity-40 dark:text-white'
            }`}
          >
            {ride.status === 'CANCELED'
              ? 'block'
              : ride.isPooled
              ? 'groups'
              : ride.vehicleCategory === 'BIKE'
              ? 'two_wheeler'
              : ride.vehicleCategory === 'AUTO'
              ? 'electric_rickshaw'
              : 'directions_car'}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-black text-base leading-tight dark:text-white truncate pr-2">
              {ride.dropoff?.address?.split(',')[0] || 'Unknown Dropoff'}
            </h3>
            <span className="font-black text-sm dark:text-white">₹{fare}</span>
          </div>
          <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 mb-1 truncate">
            From: {ride.pickup?.address?.split(',')[0] || 'Unknown Pickup'}
          </p>
          <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 mb-2 truncate">
            {new Date(ride.bookingTime || ride.createdAt || '').toLocaleDateString()} •{' '}
            {new Date(ride.bookingTime || ride.createdAt || '').toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            • {ride.vehicleCategory || 'Ride'}
            {driverName ? ` • ${driverName}` : ''}
          </p>
          <div className="flex gap-2 flex-wrap">
            <span
              className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                ride.status === 'COMPLETED'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : ride.status === 'SEARCHING'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : ride.status === 'CANCELED'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}
            >
              {ride.status.replace('_', ' ')}
            </span>
            {ride.isPooled && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                Pool {ride.poolPassengersCount ? `(${ride.poolPassengersCount})` : ''}
              </span>
            )}
            {ride.scheduledFor && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                Scheduled
              </span>
            )}
            {ride.hasReview && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                <span className="material-icons-outlined" style={{ fontSize: 10 }}>
                  star
                </span>
                {ride.reviewRating}
              </span>
            )}
            {ride.status === 'COMPLETED' && !ride.hasReview && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openReviewModal(ride);
                }}
                className="bg-leaf-600 text-white dark:bg-leaf-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md shadow-leaf-500/10 hover:bg-leaf-700 transition-colors"
              >
                Rate Trip
              </button>
            )}
            {ride.status === 'COMPLETED' && ride.hasReview && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openRideDetail(ride);
                }}
                className="bg-leaf-600 text-white dark:bg-leaf-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md shadow-leaf-500/10"
              >
                Rebook
              </button>
            )}
          </div>

          {/* ── Carbon footprint ── */}
          {ride.status === 'COMPLETED' && (ride.co2Emissions! > 0 || ride.co2Saved! > 0) && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {ride.co2Emissions! > 0 && (
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-zinc-800 rounded-full px-3 py-1">
                  <span className="material-icons-outlined text-gray-400 dark:text-zinc-500" style={{ fontSize: '13px' }}>
                    co2
                  </span>
                  <span className="text-[10px] font-black text-gray-500 dark:text-zinc-400">
                    {(ride.co2Emissions! / 1000).toFixed(2)} kg CO₂
                  </span>
                </div>
              )}
              {ride.co2Saved! > 0 && (
                <div className="flex items-center gap-1.5 bg-leaf-50 dark:bg-leaf-900/20 rounded-full px-3 py-1">
                  <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400" style={{ fontSize: '13px' }}>
                    eco
                  </span>
                  <span className="text-[10px] font-black text-leaf-600 dark:text-leaf-400">
                    {(ride.co2Saved! / 1000).toFixed(2)} kg saved
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Star rating component ──
  const StarRating: React.FC<{
    value: number;
    hoverValue?: number;
    size?: number;
    onChange?: (v: number) => void;
    onHover?: (v: number) => void;
    readOnly?: boolean;
  }> = ({ value, hoverValue = 0, size = 32, onChange, onHover, readOnly }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => onHover?.(star)}
          onMouseLeave={() => onHover?.(0)}
          className="transition-transform hover:scale-110 disabled:cursor-default"
          style={{ background: 'none', border: 'none', padding: 2 }}
        >
          <span
            className="material-icons"
            style={{
              fontSize: size,
              color: star <= (hoverValue || value) ? '#f59e0b' : '#e2e8f0',
              transition: 'color 0.15s',
            }}
          >
            star
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-700 bg-white dark:bg-zinc-950 min-h-screen">
      <h1 className="text-4xl font-black tracking-tight mt-6 mb-4 dark:text-white">Activity</h1>

      {/* ── Stats toggle ── */}
      <button
        onClick={() => setShowStats(!showStats)}
        className="flex items-center gap-2 mb-4 px-4 py-2 rounded-full text-xs font-bold text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <span className="material-icons-outlined" style={{ fontSize: 16 }}>
          {showStats ? 'expand_less' : 'insights'}
        </span>
        {showStats ? 'Hide Stats' : 'View Trip Stats'}
      </button>

      {/* ── Stats Panel ── */}
      {showStats && (
        <div className="mb-6 p-5 bg-gradient-to-br from-leaf-50 to-green-50 dark:from-leaf-900/20 dark:to-green-900/20 rounded-[24px] border border-leaf-100 dark:border-leaf-800/30">
          <h3 className="font-black text-sm text-leaf-800 dark:text-leaf-300 mb-4 uppercase tracking-widest">Your Trip Summary</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="text-2xl font-black text-leaf-700 dark:text-leaf-400">{stats.totalRides}</div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Rides</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-leaf-700 dark:text-leaf-400">₹{stats.totalFare}</div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Spent</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-leaf-700 dark:text-leaf-400">
                {stats.avgRating > 0 ? stats.avgRating : '--'}
              </div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Avg Rating</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-black text-blue-600 dark:text-blue-400">{stats.pooledRides}</div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Pooled</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-green-600 dark:text-green-400">
                {(stats.totalCO2Saved / 1000).toFixed(1)}kg
              </div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">CO₂ Saved</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-red-500">{stats.canceledRides}</div>
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Canceled</div>
            </div>
          </div>
          {Object.keys(stats.categories).length > 0 && (
            <div className="mt-4 pt-3 border-t border-leaf-200 dark:border-leaf-800/30">
              <div className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">By Category</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(stats.categories).map(([cat, count]) => (
                  <span key={cat} className="px-3 py-1 rounded-full text-[10px] font-black bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border border-gray-100 dark:border-zinc-700">
                    {cat}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-2 px-2 hide-scrollbar">
        {(['Upcoming', 'Past', 'Sent Requests'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setCurrentPage(1);
            }}
            className={`px-6 py-3 rounded-full text-[12px] font-black transition-all shrink-0 uppercase tracking-widest ${
              activeTab === tab
                ? 'bg-leaf-600 text-white dark:bg-leaf-500 shadow-xl shadow-leaf-500/20'
                : 'bg-gray-100 dark:bg-zinc-900 text-gray-400 dark:text-zinc-500'
            }`}
          >
            {tab}
            {tab === 'Upcoming' && upcomingRides.length > 0 && (
              <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-[10px]">{upcomingRides.length}</span>
            )}
            {tab === 'Past' && filteredPastRides.length > 0 && (
              <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-[10px]">{filteredPastRides.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filter & Sort (Past tab only) ── */}
      {activeTab === 'Past' && (
        <div className="mb-6 space-y-3">
          {/* Search */}
          <div className="relative">
            <span className="material-icons-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: 18 }}>
              search
            </span>
            <input
              type="text"
              placeholder="Search by location..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 text-sm font-medium text-gray-700 dark:text-zinc-300 placeholder-gray-400 focus:outline-none focus:border-leaf-500 focus:ring-1 focus:ring-leaf-500"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {/* Category filter chips */}
            {(['ALL', 'CAR', 'BIKE', 'AUTO', 'POOL', 'ECO'] as FilterCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setFilterCategory(cat);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 transition-all ${
                  filterCategory === cat
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'bg-gray-100 text-gray-400 dark:bg-zinc-900 dark:text-zinc-500'
                }`}
              >
                {cat}
              </button>
            ))}

            {/* Sort dropdown */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 border-none outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest_fare">Highest Fare</option>
              <option value="lowest_fare">Lowest Fare</option>
            </select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 text-center animate-pulse">
          <span className="material-icons-outlined text-5xl animate-spin text-leaf-500">sync</span>
        </div>
      ) : (
        <>
          {activeTab === 'Upcoming' && (
            <div className="space-y-1">
              {upcomingRides.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">event_busy</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">No active trips</h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">
                    Book a ride and it will appear here.
                  </p>
                </div>
              ) : (
                upcomingRides.map(renderRideItem)
              )}
            </div>
          )}

          {activeTab === 'Past' && (
            <div className="space-y-1">
              {filteredPastRides.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">history</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">
                    {searchQuery || filterCategory !== 'ALL' ? 'No matching rides' : 'No trip history'}
                  </h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">
                    {searchQuery || filterCategory !== 'ALL'
                      ? 'Try adjusting your filters.'
                      : 'Your past rides will show up here.'}
                  </p>
                </div>
              ) : (
                <>
                  {paginatedRides.map(renderRideItem)}

                  {/* ── Pagination ── */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-3 mt-6 mb-4">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-full bg-gray-100 dark:bg-zinc-900 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                          chevron_left
                        </span>
                      </button>

                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-9 h-9 rounded-full text-xs font-black transition-all ${
                              currentPage === pageNum
                                ? 'bg-leaf-600 text-white dark:bg-leaf-500'
                                : 'bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-800'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-full bg-gray-100 dark:bg-zinc-900 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                          chevron_right
                        </span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'Sent Requests' && (
            <div className="space-y-4">
              {sentRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">history_toggle_off</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">No requests sent</h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">
                    Any partner requests will appear here.
                  </p>
                </div>
              ) : (
                sentRequests.map((req) => (
                  <div
                    key={req._id}
                    className="p-6 bg-gray-50 dark:bg-zinc-900/50 rounded-[32px] border border-gray-100 dark:border-zinc-800 shadow-sm group"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="size-14 bg-black dark:bg-white rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="material-icons-outlined text-white dark:text-black text-2xl">handshake</span>
                      </div>
                      <div
                        className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          req.isRead
                            ? 'bg-gray-100 text-gray-400 dark:bg-zinc-800'
                            : 'bg-leaf-100 text-leaf-600 dark:bg-leaf-900/30 dark:text-leaf-400'
                        }`}
                      >
                        {req.isRead ? 'Closed' : 'Pending'}
                      </div>
                    </div>
                    <h4 className="font-black text-black dark:text-white text-lg mb-2">{req.title}</h4>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium mb-6 leading-relaxed line-clamp-2">
                      {req.message}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-t border-gray-100 dark:border-zinc-800 pt-4">
                      <span className="material-icons-outlined text-sm">schedule</span>
                      {new Date(req.createdAt).toLocaleDateString()} at{' '}
                      {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ═══ RIDE DETAIL MODAL ═══ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showRideDetail && selectedRide && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-6 animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black dark:text-white">Trip Details</h2>
              <button
                onClick={() => setShowRideDetail(false)}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                <span className="material-icons-outlined text-gray-500">close</span>
              </button>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-3 mb-6">
              <span
                className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest ${
                  selectedRide.status === 'COMPLETED'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : selectedRide.status === 'CANCELED'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}
              >
                {selectedRide.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-400 dark:text-zinc-500 font-bold">
                {new Date(selectedRide.bookingTime || selectedRide.createdAt || '').toLocaleString()}
              </span>
            </div>

            {/* Route */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-leaf-500"></div>
                  <div className="w-0.5 flex-1 bg-gray-200 dark:bg-zinc-700 my-1"></div>
                  {selectedRide.stops && selectedRide.stops.length > 0 && selectedRide.stops.map((_, si) => (
                    <React.Fragment key={si}>
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                      <div className="w-0.5 flex-1 bg-gray-200 dark:bg-zinc-700 my-1"></div>
                    </React.Fragment>
                  ))}
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pickup</div>
                    <div className="text-sm font-bold dark:text-white">{selectedRide.pickup?.address || 'N/A'}</div>
                  </div>
                  {selectedRide.stops?.map((stop, si) => (
                    <div key={si}>
                      <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Stop {si + 1}</div>
                      <div className="text-sm font-bold dark:text-white">{stop.address || 'N/A'}</div>
                    </div>
                  ))}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dropoff</div>
                    <div className="text-sm font-bold dark:text-white">{selectedRide.dropoff?.address || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ride info grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vehicle</div>
                <div className="text-sm font-black dark:text-white">{selectedRide.vehicleCategory || 'CAR'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Distance</div>
                <div className="text-sm font-black dark:text-white">{selectedRide.distance || '--'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Duration</div>
                <div className="text-sm font-black dark:text-white">{selectedRide.duration || '--'}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fare</div>
                <div className="text-sm font-black dark:text-white">
                  ₹{selectedRide.completedFare || selectedRide.currentFare || selectedRide.fare || 0}
                </div>
              </div>
            </div>

            {/* Driver info */}
            {typeof selectedRide.driverId === 'object' && selectedRide.driverId && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl flex items-center gap-4">
                <div className="w-12 h-12 bg-leaf-100 dark:bg-leaf-900/30 rounded-full flex items-center justify-center">
                  {selectedRide.driverId.photoUrl ? (
                    <img src={selectedRide.driverId.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <span className="material-icons-outlined text-leaf-600" style={{ fontSize: 24 }}>
                      person
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-black text-sm dark:text-white">
                    {selectedRide.driverId.firstName} {selectedRide.driverId.lastName}
                  </div>
                  {selectedRide.driverId.vehicleNumber && (
                    <div className="text-xs text-gray-400 font-bold">{selectedRide.driverId.vehicleNumber}</div>
                  )}
                </div>
                {selectedRide.driverId.rating && (
                  <div className="flex items-center gap-1 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-full">
                    <span className="material-icons text-amber-500" style={{ fontSize: 14 }}>
                      star
                    </span>
                    <span className="text-xs font-black text-amber-600">{selectedRide.driverId.rating}</span>
                  </div>
                )}
              </div>
            )}

            {/* Payment receipt */}
            {ridePayment && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-black dark:text-white">Payment Receipt</h3>
                  <span
                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      ridePayment.status === 'COMPLETED'
                        ? 'bg-green-100 text-green-700'
                        : ridePayment.status === 'REFUNDED'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {ridePayment.status}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {ridePayment.fareBreakdown?.baseFare != null && (
                    <div className="flex justify-between text-gray-500 dark:text-zinc-400">
                      <span>Base Fare</span>
                      <span>₹{ridePayment.fareBreakdown.baseFare}</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.distanceCharge != null && (
                    <div className="flex justify-between text-gray-500 dark:text-zinc-400">
                      <span>Distance Charge</span>
                      <span>₹{ridePayment.fareBreakdown.distanceCharge}</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.timeCharge != null && (
                    <div className="flex justify-between text-gray-500 dark:text-zinc-400">
                      <span>Time Charge</span>
                      <span>₹{ridePayment.fareBreakdown.timeCharge}</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.surgeMultiplier != null && ridePayment.fareBreakdown.surgeMultiplier > 1 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Surge ({ridePayment.fareBreakdown.surgeMultiplier}x)</span>
                      <span>Applied</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.poolDiscount != null && ridePayment.fareBreakdown.poolDiscount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Pool Discount</span>
                      <span>-₹{ridePayment.fareBreakdown.poolDiscount}</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.promoDiscount != null && ridePayment.fareBreakdown.promoDiscount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Promo Discount</span>
                      <span>-₹{ridePayment.fareBreakdown.promoDiscount}</span>
                    </div>
                  )}
                  {ridePayment.fareBreakdown?.taxes != null && (
                    <div className="flex justify-between text-gray-500 dark:text-zinc-400">
                      <span>Taxes & Fees</span>
                      <span>₹{ridePayment.fareBreakdown.taxes}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm dark:text-white pt-2 border-t border-gray-200 dark:border-zinc-700">
                    <span>Total</span>
                    <span>₹{ridePayment.amount}</span>
                  </div>
                  <div className="flex justify-between text-gray-400 mt-1">
                    <span>Payment Method</span>
                    <span className="font-bold">{ridePayment.method}</span>
                  </div>
                  {ridePayment.refundAmount != null && ridePayment.refundAmount > 0 && (
                    <div className="flex justify-between text-amber-600 font-bold mt-1">
                      <span>Refunded</span>
                      <span>₹{ridePayment.refundAmount}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cancellation info */}
            {selectedRide.status === 'CANCELED' && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-800/30">
                <div className="text-sm font-black text-red-700 dark:text-red-400 mb-1">Ride Canceled</div>
                {selectedRide.canceledBy && (
                  <div className="text-xs text-red-600 dark:text-red-400/80">By: {selectedRide.canceledBy}</div>
                )}
                {selectedRide.cancelReason && (
                  <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1">Reason: {selectedRide.cancelReason}</div>
                )}
                {selectedRide.cancellationFee != null && selectedRide.cancellationFee > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1 font-bold">Fee: ₹{selectedRide.cancellationFee}</div>
                )}
              </div>
            )}

            {/* Carbon footprint */}
            {selectedRide.status === 'COMPLETED' && (selectedRide.co2Emissions! > 0 || selectedRide.co2Saved! > 0) && (
              <div className="mb-6 p-4 bg-leaf-50 dark:bg-leaf-900/10 rounded-2xl border border-leaf-100 dark:border-leaf-800/30">
                <div className="text-sm font-black text-leaf-700 dark:text-leaf-400 mb-2">Environmental Impact</div>
                <div className="flex gap-4">
                  {selectedRide.co2Emissions! > 0 && (
                    <div>
                      <div className="text-lg font-black text-gray-700 dark:text-zinc-300">
                        {(selectedRide.co2Emissions! / 1000).toFixed(2)} kg
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">CO₂ Emitted</div>
                    </div>
                  )}
                  {selectedRide.co2Saved! > 0 && (
                    <div>
                      <div className="text-lg font-black text-leaf-600 dark:text-leaf-400">
                        {(selectedRide.co2Saved! / 1000).toFixed(2)} kg
                      </div>
                      <div className="text-[10px] font-bold text-leaf-500 uppercase">CO₂ Saved</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {selectedRide.status === 'COMPLETED' && !selectedRide.hasReview && (
                <button
                  onClick={() => {
                    setShowRideDetail(false);
                    openReviewModal(selectedRide);
                  }}
                  className="flex-1 py-3 bg-leaf-600 text-white rounded-2xl font-black text-sm hover:bg-leaf-700 transition-colors"
                >
                  Rate This Trip
                </button>
              )}
              {selectedRide.status === 'COMPLETED' && (
                <button
                  onClick={() => {
                    setShowRideDetail(false);
                    // TODO: Rebook logic
                  }}
                  className="flex-1 py-3 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm hover:opacity-80 transition-opacity"
                >
                  Rebook
                </button>
              )}
              {selectedRide.status === 'COMPLETED' && (
                <button
                  onClick={() => {
                    // TODO: Report issue
                  }}
                  className="py-3 px-4 border border-gray-200 dark:border-zinc-700 rounded-2xl"
                >
                  <span className="material-icons-outlined text-gray-400" style={{ fontSize: 18 }}>
                    flag
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ═══ REVIEW MODAL ═══ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showReviewModal && reviewRide && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] p-6 animate-in slide-in-from-bottom duration-300">
            {reviewSuccess ? (
              /* Success state */
              <div className="py-12 text-center animate-in zoom-in duration-300">
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-icons text-green-600 text-4xl">check_circle</span>
                </div>
                <h2 className="text-xl font-black dark:text-white mb-2">Thanks for your review!</h2>
                <p className="text-sm text-gray-500 dark:text-zinc-400">Your feedback helps improve our service.</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black dark:text-white">Rate Your Trip</h2>
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
                  >
                    <span className="material-icons-outlined text-gray-500">close</span>
                  </button>
                </div>

                {/* Trip summary */}
                <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl">
                  <div className="text-xs text-gray-400 font-bold mb-1">
                    {new Date(reviewRide.bookingTime || reviewRide.createdAt || '').toLocaleDateString()}
                  </div>
                  <div className="text-sm font-black dark:text-white truncate">
                    {reviewRide.pickup?.address?.split(',')[0]} → {reviewRide.dropoff?.address?.split(',')[0]}
                  </div>
                </div>

                {/* ── Overall rating ── */}
                <div className="text-center mb-6">
                  <div className="text-sm font-black dark:text-white mb-3">How was your ride?</div>
                  <div className="flex justify-center">
                    <StarRating
                      value={reviewRating}
                      hoverValue={reviewHover}
                      size={40}
                      onChange={setReviewRating}
                      onHover={setReviewHover}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-2 h-4">
                    {reviewHover === 1 || reviewRating === 1
                      ? 'Terrible'
                      : reviewHover === 2 || reviewRating === 2
                      ? 'Bad'
                      : reviewHover === 3 || reviewRating === 3
                      ? 'Okay'
                      : reviewHover === 4 || reviewRating === 4
                      ? 'Good'
                      : reviewHover === 5 || reviewRating === 5
                      ? 'Excellent!'
                      : ''}
                  </div>
                </div>

                {/* ── Sub-ratings ── */}
                {reviewRating > 0 && (
                  <div className="mb-6">
                    <div className="text-xs font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-3">
                      Rate Specific Areas
                    </div>
                    <div className="space-y-3">
                      {Object.entries(SUB_RATING_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-zinc-300 font-medium">{label}</span>
                          <StarRating
                            value={reviewSubRatings[key] || 0}
                            size={20}
                            onChange={(v) => setSubRating(key, v)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Tags ── */}
                {reviewRating > 0 && (
                  <div className="mb-6">
                    <div className="text-xs font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-3">
                      What stood out?
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(reviewRating >= 4 ? POSITIVE_TAGS : reviewRating <= 2 ? NEGATIVE_TAGS : [...POSITIVE_TAGS, ...NEGATIVE_TAGS]).map(
                        (tag) => (
                          <button
                            key={tag.key}
                            onClick={() => toggleTag(tag.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${
                              reviewTags.includes(tag.key)
                                ? 'bg-leaf-600 text-white dark:bg-leaf-500 shadow-md'
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                            }`}
                          >
                            <span className="material-icons-outlined" style={{ fontSize: 14 }}>
                              {tag.icon}
                            </span>
                            {tag.label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* ── Comment ── */}
                {reviewRating > 0 && (
                  <div className="mb-6">
                    <div className="text-xs font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                      Add a comment (optional)
                    </div>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="w-full p-3 rounded-2xl bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-sm font-medium dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-leaf-500"
                      rows={3}
                      placeholder="Share your experience..."
                      maxLength={500}
                    />
                    <div className="text-[10px] text-gray-400 text-right mt-1">{reviewComment.length}/500</div>
                  </div>
                )}

                {/* ── Submit ── */}
                <button
                  onClick={submitReview}
                  disabled={reviewRating === 0 || isSubmittingReview}
                  className="w-full py-3.5 bg-leaf-600 text-white rounded-2xl font-black text-sm hover:bg-leaf-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingReview ? (
                    <>
                      <span className="material-icons-outlined animate-spin" style={{ fontSize: 18 }}>
                        sync
                      </span>
                      Submitting...
                    </>
                  ) : (
                    'Submit Review'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityScreen;
