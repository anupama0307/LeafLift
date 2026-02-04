
import React from 'react';

interface AccountScreenProps {
  user?: any;
  onSignOut?: () => void;
}

const AccountScreen: React.FC<AccountScreenProps> = ({ user, onSignOut }) => {
  const isDriver = user?.role === 'DRIVER';

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
        <MenuButton icon="smartphone" title="Simple mode" badge="New" />
        <MenuButton icon="card_giftcard" title="Send a gift" />
        <MenuButton icon="logout" title="Sign out" destructive onClick={onSignOut} />
      </div>

      <div className="mt-12 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-4">
        LeafLift v1.2.0
      </div>
    </div>
  );
};

export default AccountScreen;
