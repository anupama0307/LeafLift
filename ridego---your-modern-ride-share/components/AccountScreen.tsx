
import React, { useEffect, useState } from 'react';

interface AccountScreenProps {
  user?: any;
  onSignOut?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const AccountScreen: React.FC<AccountScreenProps> = ({ user, onSignOut }) => {
  const isDriver = user?.role === 'DRIVER';
  const [stats, setStats] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [addAmount, setAddAmount] = useState('');
  const [showAddMoney, setShowAddMoney] = useState(false);

  useEffect(() => {
    if (!user?._id) return;
    fetch(`${API_BASE_URL}/api/users/${user._id}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
    fetch(`${API_BASE_URL}/api/users/${user._id}/wallet`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWalletBalance(d.walletBalance || 0); })
      .catch(() => {});
  }, [user]);

  const handleAddMoney = async () => {
    const amt = parseFloat(addAmount);
    if (!amt || amt <= 0 || !user?._id) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/${user._id}/wallet/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt })
      });
      if (resp.ok) {
        const d = await resp.json();
        setWalletBalance(d.walletBalance || walletBalance + amt);
        setAddAmount('');
        setShowAddMoney(false);
      }
    } catch {}
  };

  const MenuButton: React.FC<{ icon: string; title: string; subtitle?: string; badge?: string; onClick?: () => void; destructive?: boolean }> = ({ icon, title, subtitle, badge, onClick, destructive }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center py-5 group hover:bg-gray-50 dark:hover:bg-zinc-900/30 px-4 -mx-4 transition-colors"
    >
      <div className="w-10 flex justify-start">
        <span className={`material-icons-outlined text-2xl ${destructive ? 'text-red-500' : 'text-slate-600 dark:text-zinc-500'}`}>{icon}</span>
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center justify-between">
          <p className={`text-[17px] font-bold ${destructive ? 'text-red-500' : 'text-black dark:text-white'}`}>{title}</p>
          {badge && (
            <span className="bg-leaf-100 dark:bg-leaf-900/30 text-[9px] font-black text-leaf-700 dark:text-leaf-400 px-2.5 py-1 rounded-full uppercase tracking-wider">{badge}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-zinc-500">{subtitle}</p>
        )}
      </div>
    </button>
  );

  const fullName = user ? `${user.firstName} ${user.lastName}` : 'Guest User';

  if (isDriver) {
    return (
      <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500 bg-white dark:bg-black min-h-full">
        {/* Driver Profile Header */}
        <div className="mt-8 flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="size-20 rounded-[28px] bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center overflow-hidden border-4 border-leaf-500 shadow-xl">
              <span className="material-icons-outlined text-5xl text-zinc-400">person</span>
            </div>
            <div>
              <h1 className="text-3xl font-black text-black dark:text-white leading-tight">{fullName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-black dark:bg-white text-white dark:text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Verified Driver</span>
                <div className="flex items-center text-leaf-600 dark:text-leaf-400">
                  <span className="material-icons text-sm">star</span>
                  <span className="text-xs font-black ml-1">5.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Driver Financials Overview */}
        <div className="bg-gradient-to-br from-black to-zinc-800 dark:from-leaf-500 dark:to-leaf-600 text-white p-6 rounded-[32px] mb-8 shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Available to Withdraw</p>
            <h2 className="text-4xl font-black mb-4">₹4,250.00</h2>
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase opacity-60">This Week</span>
                <span className="font-bold text-lg">₹12,400</span>
              </div>
              <div className="w-px h-8 bg-white/20 dark:bg-black/20 self-center"></div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase opacity-60">Trips</span>
                <span className="font-bold text-lg">42</span>
              </div>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 size-32 opacity-10 -rotate-12">
            <span className="material-icons text-[120px]">account_balance_wallet</span>
          </div>
        </div>

        {/* Driver Verification Status */}
        <div className="mb-8">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 px-1">Verification Status</h3>
          <div className="bg-gray-50 dark:bg-zinc-900/50 p-6 rounded-[32px] space-y-5 border border-gray-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-2xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-green-500">verified_user</span>
                </div>
                <span className="text-sm font-black">Driving License</span>
              </div>
              <span className="material-icons text-green-500">check_circle</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-2xl bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-green-500">fingerprint</span>
                </div>
                <span className="text-sm font-black">Aadhar Verification</span>
              </div>
              <span className="material-icons text-green-500">check_circle</span>
            </div>
          </div>
        </div>

        {/* Driver Menu */}
        <div className="space-y-1">
          <MenuButton icon="analytics" title="Eco-Driving Insights" subtitle="Efficiency Score: 88%" badge="Eco" />
          <MenuButton icon="security" title="Safety & Privacy" subtitle="Managed transmission & encryption" />
          <MenuButton icon="settings" title="Dashboard Settings" />
          <MenuButton icon="help_outline" title="Driver Support" />
          <MenuButton icon="logout" title="Sign out" destructive onClick={onSignOut} />
        </div>

        <div className="mt-12 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-8">
          LeafLift Driver v1.2.0
        </div>
      </div>
    );
  }

  /* Default Rider View */
  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500 bg-white dark:bg-black min-h-full">
      <div className="flex justify-between items-center mt-6 mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-black dark:text-white leading-tight">{fullName}</h1>
          <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full bg-leaf-50 dark:bg-leaf-900/30">
            <span className="material-icons-outlined text-sm mr-1 text-leaf-600 dark:text-leaf-400">star</span>
            <span className="text-sm font-black text-leaf-700 dark:text-leaf-400">5.0</span>
          </div>
        </div>
        <div className="w-20 h-20 rounded-2xl bg-[#f3f3f3] dark:bg-zinc-800 flex items-center justify-center shadow-lg overflow-hidden">
          <span className="material-icons-outlined text-5xl text-slate-400">person</span>
        </div>
      </div>

      {/* Wallet Card */}
      <div className="bg-gradient-to-br from-green-500 to-green-700 text-white p-5 rounded-3xl mb-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">LeafLift Wallet</p>
          <h2 className="text-3xl font-black mt-1">₹{walletBalance.toFixed(2)}</h2>
          <button
            onClick={() => setShowAddMoney(!showAddMoney)}
            className="mt-3 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
          >
            + Add Money
          </button>
        </div>
        <div className="absolute right-2 bottom-2 opacity-10">
          <span className="material-icons text-[100px]">account_balance_wallet</span>
        </div>
      </div>

      {/* Add Money */}
      {showAddMoney && (
        <div className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl mb-6 border border-gray-100 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              type="number"
              placeholder="Enter amount"
              className="flex-1 bg-white dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm font-bold dark:text-white border border-gray-200 dark:border-zinc-700"
            />
            <button
              onClick={handleAddMoney}
              className="bg-green-500 text-white px-5 py-3 rounded-xl font-bold text-sm"
            >
              Add
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            {[100, 200, 500, 1000].map(amt => (
              <button
                key={amt}
                onClick={() => setAddAmount(String(amt))}
                className="flex-1 bg-white dark:bg-zinc-800 py-2 rounded-lg text-xs font-bold dark:text-white border border-gray-200 dark:border-zinc-700"
              >
                ₹{amt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CO2 & Trips Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl">
          <span className="material-icons-outlined text-green-500 mb-1">eco</span>
          <p className="text-2xl font-black text-green-600 dark:text-green-400">
            {stats ? `${(stats.totalCO2Saved / 1000).toFixed(1)}kg` : '0kg'}
          </p>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">CO₂ Saved</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl">
          <span className="material-icons-outlined text-orange-500 mb-1">cloud</span>
          <p className="text-2xl font-black text-orange-600 dark:text-orange-400">
            {stats ? `${(stats.totalCO2Emitted / 1000).toFixed(1)}kg` : '0kg'}
          </p>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">CO₂ Emitted</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl">
          <span className="material-icons-outlined text-blue-500 mb-1">directions_car</span>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
            {stats?.totalTrips || 0}
          </p>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">Total Trips</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl">
          <span className="material-icons-outlined text-purple-500 mb-1">straighten</span>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {stats ? `${(stats.totalKmTraveled).toFixed(0)}km` : '0km'}
          </p>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">Traveled</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-[#f3f3f3] dark:bg-zinc-900 p-4 rounded-2xl text-center">
          <span className="material-icons-outlined text-blue-500 mb-1">help_outline</span>
          <p className="text-xs font-bold text-black dark:text-white">Help</p>
        </div>
        <div className="bg-[#f3f3f3] dark:bg-zinc-900 p-4 rounded-2xl text-center">
          <span className="material-icons-outlined text-green-500 mb-1">account_balance_wallet</span>
          <p className="text-xs font-bold text-black dark:text-white">Wallet</p>
        </div>
        <div className="bg-[#f3f3f3] dark:bg-zinc-900 p-4 rounded-2xl text-center">
          <span className="material-icons-outlined text-purple-500 mb-1">receipt_long</span>
          <p className="text-xs font-bold text-black dark:text-white">Trips</p>
        </div>
      </div>

      <div className="space-y-1">
        <MenuButton icon="settings" title="Settings" />
        <MenuButton icon="security" title="Safety & Privacy" />
        <MenuButton icon="logout" title="Sign out" destructive onClick={onSignOut} />
      </div>

      <div className="mt-12 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-4">
        LeafLift v1.2.0
      </div>
    </div>
  );
};

export default AccountScreen;
