import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = '/api/admin';
const SERVER_API = '/api';

interface PaymentSummary {
  totalRevenue: number;
  platformRevenue: number;
  driverPayouts: number;
  taxes: number;
  totalTransactions: number;
  avgTransactionValue: number;
}

interface DailyRevenue {
  date: string;
  total: number;
  platform: number;
  count: number;
}

interface MethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

interface DisputeStats {
  open: number;
  underReview: number;
  resolved: number;
  slaBreached: number;
  criticalActive: number;
}

interface Dispute {
  _id: string;
  rideId: any;
  raisedBy: { _id: string; firstName: string; lastName: string; role: string };
  category: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
}

type RevenuePeriod = 'day' | 'week' | 'month';

const RevenueAnalytics: React.FC = () => {
  const [period, setPeriod] = useState<RevenuePeriod>('week');
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyRevenue[]>([]);
  const [methodData, setMethodData] = useState<MethodBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  // Dispute management
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputeStats, setDisputeStats] = useState<DisputeStats | null>(null);
  const [disputeFilter, setDisputeFilter] = useState<string>('');
  const [disputePage, setDisputePage] = useState(1);
  const [disputePages, setDisputePages] = useState(1);
  const [loadingDisputes, setLoadingDisputes] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [showDisputeDetail, setShowDisputeDetail] = useState(false);

  // Active tab
  const [activeSection, setActiveSection] = useState<'revenue' | 'disputes'>('revenue');

  // ── Fetch revenue data ──
  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/revenue?period=${period}`);
      if (resp.ok) {
        const data = await resp.json();
        setSummary(data.summary || null);
        setDailyData(data.dailyRevenue || []);
        setMethodData(data.methodBreakdown || []);
      }
    } catch (error) {
      console.error('Revenue fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  // ── Fetch disputes ──
  const fetchDisputes = useCallback(async () => {
    setLoadingDisputes(true);
    try {
      const params = new URLSearchParams({ page: String(disputePage), limit: '10' });
      if (disputeFilter) params.append('status', disputeFilter);

      const resp = await fetch(`${API_BASE}/disputes?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        setDisputes(data.disputes || []);
        setDisputeStats(data.stats || null);
        setDisputePages(data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Disputes fetch error:', error);
    } finally {
      setLoadingDisputes(false);
    }
  }, [disputeFilter, disputePage]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  useEffect(() => {
    if (activeSection === 'disputes') fetchDisputes();
  }, [activeSection, fetchDisputes]);

  // ── Chart calculations ──
  const chartMax = useMemo(() => {
    if (dailyData.length === 0) return 1;
    return Math.max(...dailyData.map((d) => d.total), 1);
  }, [dailyData]);

  const totalMethodAmount = useMemo(
    () => methodData.reduce((s, m) => s + m.amount, 0) || 1,
    [methodData]
  );

  // ── Priority badge ──
  const priorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-100 text-red-700',
      HIGH: 'bg-orange-100 text-orange-700',
      MEDIUM: 'bg-amber-100 text-amber-700',
      LOW: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[priority] || colors.MEDIUM}`}>
        {priority}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      OPEN: 'bg-blue-100 text-blue-700',
      UNDER_REVIEW: 'bg-amber-100 text-amber-700',
      RESOLVED: 'bg-green-100 text-green-700',
      ESCALATED: 'bg-red-100 text-red-700',
      CLOSED: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || colors.OPEN}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const methodIcon = (method: string) => {
    const icons: Record<string, string> = {
      WALLET: 'account_balance_wallet',
      UPI: 'qr_code',
      CARD: 'credit_card',
      CASH: 'payments',
      NET_BANKING: 'account_balance',
    };
    return icons[method] || 'payment';
  };

  const methodColor = (method: string) => {
    const colors: Record<string, string> = {
      WALLET: '#8b5cf6',
      UPI: '#06b6d4',
      CARD: '#f59e0b',
      CASH: '#10b981',
      NET_BANKING: '#3b82f6',
    };
    return colors[method] || '#94a3b8';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Revenue & Operations</h1>
          <p className="text-sm text-gray-500 mt-1">Financial overview and dispute management</p>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0">
          <button
            onClick={() => setActiveSection('revenue')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === 'revenue' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Revenue
          </button>
          <button
            onClick={() => setActiveSection('disputes')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === 'disputes' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            Disputes
            {disputeStats && disputeStats.open > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full">{disputeStats.open}</span>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ═══ REVENUE SECTION ═══ */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeSection === 'revenue' && (
        <>
          {/* Period selector */}
          <div className="flex gap-2 mb-8">
            {(['day', 'week', 'month'] as RevenuePeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all capitalize ${
                  period === p ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                This {p}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <span className="material-icons-outlined text-4xl animate-spin text-blue-500">sync</span>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-6 text-white">
                    <div className="text-sm font-medium opacity-80 mb-1">Total Revenue</div>
                    <div className="text-3xl font-black">₹{summary.totalRevenue.toLocaleString()}</div>
                    <div className="text-xs opacity-60 mt-2">{summary.totalTransactions} transactions</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-6 text-white">
                    <div className="text-sm font-medium opacity-80 mb-1">Platform Revenue</div>
                    <div className="text-3xl font-black">₹{summary.platformRevenue.toLocaleString()}</div>
                    <div className="text-xs opacity-60 mt-2">
                      {summary.totalRevenue > 0 ? Math.round((summary.platformRevenue / summary.totalRevenue) * 100) : 0}% of total
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-2xl p-6 text-white">
                    <div className="text-sm font-medium opacity-80 mb-1">Driver Payouts</div>
                    <div className="text-3xl font-black">₹{summary.driverPayouts.toLocaleString()}</div>
                    <div className="text-xs opacity-60 mt-2">
                      Avg ₹{summary.avgTransactionValue} per ride
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-gray-400 mb-1">Taxes Collected</div>
                    <div className="text-2xl font-black text-gray-900">₹{summary.taxes.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-gray-400 mb-1">Avg Transaction</div>
                    <div className="text-2xl font-black text-gray-900">₹{summary.avgTransactionValue}</div>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-gray-400 mb-1">Total Transactions</div>
                    <div className="text-2xl font-black text-gray-900">{summary.totalTransactions}</div>
                  </div>
                </div>
              )}

              {/* Daily Revenue Chart */}
              {dailyData.length > 0 && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
                  <h3 className="text-lg font-black text-gray-900 mb-4">Daily Revenue</h3>
                  <div className="flex items-end gap-2 h-48">
                    {dailyData.map((day, i) => {
                      const height = (day.total / chartMax) * 100;
                      const platformHeight = (day.platform / chartMax) * 100;
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                            <div className="font-bold">₹{day.total.toLocaleString()}</div>
                            <div className="text-gray-300">{day.count} rides • ₹{day.platform} platform</div>
                            <div className="text-gray-400">{day.date}</div>
                          </div>
                          <div className="w-full flex flex-col items-center" style={{ height: '100%', justifyContent: 'flex-end' }}>
                            <div
                              className="w-full bg-blue-500 rounded-t-lg transition-all duration-300 hover:bg-blue-600 relative"
                              style={{ height: `${Math.max(height, 2)}%`, minHeight: 4 }}
                            >
                              <div
                                className="absolute bottom-0 left-0 right-0 bg-purple-500 rounded-t-sm"
                                style={{ height: `${Math.max(platformHeight / (height || 1) * 100, 0)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-[9px] font-bold text-gray-400 mt-1">
                            {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-4 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-blue-500" />
                      <span>Total</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-purple-500" />
                      <span>Platform</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Methods */}
              {methodData.length > 0 && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
                  <h3 className="text-lg font-black text-gray-900 mb-4">Payment Methods</h3>
                  <div className="space-y-4">
                    {methodData.map((m) => {
                      const percentage = Math.round((m.amount / totalMethodAmount) * 100);
                      return (
                        <div key={m.method} className="flex items-center gap-4">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${methodColor(m.method)}20` }}
                          >
                            <span className="material-icons-outlined" style={{ fontSize: 20, color: methodColor(m.method) }}>
                              {methodIcon(m.method)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-bold text-gray-700">{m.method}</span>
                              <span className="text-sm font-black text-gray-900">₹{m.amount.toLocaleString()}</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${percentage}%`, backgroundColor: methodColor(m.method) }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[10px] text-gray-400">{m.count} transactions</span>
                              <span className="text-[10px] font-bold text-gray-400">{percentage}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ═══ DISPUTES SECTION ═══ */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeSection === 'disputes' && (
        <>
          {/* Dispute Stats */}
          {disputeStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-2xl font-black text-blue-600">{disputeStats.open}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Open</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-2xl font-black text-amber-600">{disputeStats.underReview}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Under Review</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-2xl font-black text-green-600">{disputeStats.resolved}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Resolved</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-2xl font-black text-red-600">{disputeStats.slaBreached}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">SLA Breached</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <div className="text-2xl font-black text-red-700">{disputeStats.criticalActive}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase">Critical</div>
              </div>
            </div>
          )}

          {/* Dispute Filters */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {['', 'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED'].map((f) => (
              <button
                key={f}
                onClick={() => { setDisputeFilter(f); setDisputePage(1); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  disputeFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f ? f.replace('_', ' ') : 'All'}
              </button>
            ))}
          </div>

          {/* Disputes List */}
          {loadingDisputes ? (
            <div className="py-20 text-center">
              <span className="material-icons-outlined text-4xl animate-spin text-blue-500">sync</span>
            </div>
          ) : disputes.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
              <span className="material-icons-outlined text-5xl text-gray-200">gavel</span>
              <div className="text-lg font-bold text-gray-400 mt-2">No disputes found</div>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map((dispute) => (
                <div
                  key={dispute._id}
                  onClick={() => { setSelectedDispute(dispute); setShowDisputeDetail(true); }}
                  className={`bg-white rounded-2xl p-5 shadow-sm border cursor-pointer hover:shadow-md transition-shadow ${
                    dispute.priority === 'CRITICAL'
                      ? 'border-red-200 bg-red-50/30'
                      : dispute.priority === 'HIGH'
                      ? 'border-orange-200 bg-orange-50/30'
                      : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        dispute.priority === 'CRITICAL' ? 'bg-red-100' : 'bg-gray-100'
                      }`}>
                        <span className={`material-icons-outlined ${
                          dispute.priority === 'CRITICAL' ? 'text-red-600' : 'text-gray-500'
                        }`} style={{ fontSize: 20 }}>
                          {dispute.category === 'SAFETY_CONCERN' ? 'health_and_safety' :
                           dispute.category === 'OVERCHARGE' ? 'price_check' :
                           dispute.category === 'LOST_ITEM' ? 'search' :
                           'report_problem'}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">
                          {dispute.category.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          By: {dispute.raisedBy?.firstName} {dispute.raisedBy?.lastName} • {new Date(dispute.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {priorityBadge(dispute.priority)}
                      {statusBadge(dispute.status)}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{dispute.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Dispute Pagination */}
          {disputePages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={() => setDisputePage((p) => Math.max(1, p - 1))}
                disabled={disputePage === 1}
                className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-bold disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-sm font-bold text-gray-500">
                Page {disputePage} of {disputePages}
              </span>
              <button
                onClick={() => setDisputePage((p) => Math.min(disputePages, p + 1))}
                disabled={disputePage === disputePages}
                className="px-4 py-2 rounded-xl bg-gray-100 text-sm font-bold disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RevenueAnalytics;
