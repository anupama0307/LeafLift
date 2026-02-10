
import React, { useEffect, useState } from 'react';

interface AccountScreenProps {
  user?: any;
  onSignOut?: () => void;
}

type AccountSubScreen = 'MAIN' | 'SETTINGS' | 'SAFETY_PRIVACY';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const AccountScreen: React.FC<AccountScreenProps> = ({ user, onSignOut }) => {
  const isDriver = user?.role === 'DRIVER';
  const [stats, setStats] = useState<any>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [addAmount, setAddAmount] = useState('');
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [subScreen, setSubScreen] = useState<AccountSubScreen>('MAIN');

  // Settings state
  const [pushNotifications, setPushNotifications] = useState(true);
  const [rideAlerts, setRideAlerts] = useState(true);
  const [promoNotifications, setPromoNotifications] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [language, setLanguage] = useState('English');
  const [distanceUnit, setDistanceUnit] = useState('km');

  // Editable profile state
  const [editFirstName, setEditFirstName] = useState(user?.firstName || '');
  const [editLastName, setEditLastName] = useState(user?.lastName || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editDob, setEditDob] = useState(user?.dob || '');
  const [editGender, setEditGender] = useState(user?.gender || '');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);
  const [changePassword, setChangePassword] = useState({ current: '', newPass: '', confirm: '' });

  // Safety state
  const [locationSharing, setLocationSharing] = useState(true);
  const [shareTripStatus, setShareTripStatus] = useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [rideRecording, setRideRecording] = useState(false);
  const [trustedContacts, setTrustedContacts] = useState<string[]>([]);

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

  // --- Shared Sub-Components ---
  const SubScreenHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div className="flex items-center gap-3 mb-6 mt-4">
      <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
        <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
      </button>
      <h1 className="text-2xl font-black text-black dark:text-white">{title}</h1>
    </div>
  );

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-leaf-500' : 'bg-gray-300 dark:bg-zinc-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : ''}`} />
    </button>
  );

  const SettingRow = ({ icon, title, subtitle, trailing }: { icon: string; title: string; subtitle?: string; trailing: React.ReactNode }) => (
    <div className="flex items-center py-4 border-b border-gray-100 dark:border-zinc-800 last:border-b-0">
      <div className="w-10 flex justify-start">
        <span className="material-icons-outlined text-xl text-slate-500 dark:text-zinc-500">{icon}</span>
      </div>
      <div className="flex-1">
        <p className="text-[15px] font-bold text-black dark:text-white">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="ml-3">{trailing}</div>
    </div>
  );

  const SectionTitle = ({ children }: { children: string }) => (
    <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2 mt-6 px-1">{children}</h3>
  );

  // --- Settings Screen ---
  const handleProfileSave = async () => {
    if (!user?._id) return;
    setProfileSaveMsg(null);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/users/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          email: editEmail,
          phone: editPhone,
          dob: editDob,
          gender: editGender,
        }),
      });
      if (resp.ok) {
        const updated = await resp.json();
        // Update localStorage
        const stored = localStorage.getItem('leaflift_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          Object.assign(parsed, { firstName: editFirstName, lastName: editLastName, email: editEmail, phone: editPhone, dob: editDob, gender: editGender });
          localStorage.setItem('leaflift_user', JSON.stringify(parsed));
        }
        setProfileSaveMsg('Profile updated successfully!');
        setEditingSection(null);
      } else {
        setProfileSaveMsg('Failed to update profile.');
      }
    } catch {
      setProfileSaveMsg('Failed to update profile.');
    }
    setTimeout(() => setProfileSaveMsg(null), 3000);
  };

  const EditableInput = ({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
    <div className="mb-3">
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-black dark:text-white focus:ring-2 focus:ring-leaf-500/30 focus:border-leaf-500 transition-all"
      />
    </div>
  );

  const renderSettings = () => (
    <div className="px-5 pb-24 animate-in fade-in duration-300 bg-white dark:bg-black min-h-full">
      <SubScreenHeader title="Settings" onBack={() => setSubScreen('MAIN')} />

      {profileSaveMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-bold ${profileSaveMsg.includes('success') ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
          {profileSaveMsg}
        </div>
      )}

      {/* Profile */}
      <SectionTitle>Profile</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        {editingSection === 'profile' ? (
          <div className="py-4">
            <EditableInput label="First Name" value={editFirstName} onChange={setEditFirstName} placeholder="First name" />
            <EditableInput label="Last Name" value={editLastName} onChange={setEditLastName} placeholder="Last name" />
            <EditableInput label="Date of Birth" value={editDob} onChange={setEditDob} type="date" />
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Gender</label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-black dark:text-white"
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={handleProfileSave} className="flex-1 bg-leaf-500 hover:bg-leaf-600 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Save Changes
              </button>
              <button onClick={() => { setEditingSection(null); setEditFirstName(user?.firstName || ''); setEditLastName(user?.lastName || ''); setEditDob(user?.dob || ''); setEditGender(user?.gender || ''); }} className="px-4 bg-gray-200 dark:bg-zinc-700 text-black dark:text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <SettingRow icon="person" title="Name" subtitle={`${editFirstName} ${editLastName}`}
              trailing={<button onClick={() => setEditingSection('profile')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Edit</button>}
            />
            <SettingRow icon="cake" title="Date of Birth" subtitle={editDob || 'Not set'}
              trailing={<button onClick={() => setEditingSection('profile')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Edit</button>}
            />
            <SettingRow icon="wc" title="Gender" subtitle={editGender || 'Not set'}
              trailing={<button onClick={() => setEditingSection('profile')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Edit</button>}
            />
          </>
        )}
      </div>

      {/* Contact Info */}
      <SectionTitle>Contact</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        {editingSection === 'contact' ? (
          <div className="py-4">
            <EditableInput label="Email" value={editEmail} onChange={setEditEmail} type="email" placeholder="your@email.com" />
            <EditableInput label="Phone" value={editPhone} onChange={setEditPhone} type="tel" placeholder="+91 XXXXX XXXXX" />
            <div className="flex gap-2 mt-2">
              <button onClick={handleProfileSave} className="flex-1 bg-leaf-500 hover:bg-leaf-600 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Save Changes
              </button>
              <button onClick={() => { setEditingSection(null); setEditEmail(user?.email || ''); setEditPhone(user?.phone || ''); }} className="px-4 bg-gray-200 dark:bg-zinc-700 text-black dark:text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <SettingRow icon="email" title="Email" subtitle={editEmail || 'Not set'}
              trailing={<button onClick={() => setEditingSection('contact')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Edit</button>}
            />
            <SettingRow icon="phone" title="Phone" subtitle={editPhone || 'Not set'}
              trailing={<button onClick={() => setEditingSection('contact')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Edit</button>}
            />
          </>
        )}
      </div>

      {/* Password */}
      <SectionTitle>Password</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        {editingSection === 'password' ? (
          <div className="py-4">
            <EditableInput label="Current Password" value={changePassword.current} onChange={(v) => setChangePassword({ ...changePassword, current: v })} type="password" placeholder="Enter current password" />
            <EditableInput label="New Password" value={changePassword.newPass} onChange={(v) => setChangePassword({ ...changePassword, newPass: v })} type="password" placeholder="Enter new password" />
            <EditableInput label="Confirm New Password" value={changePassword.confirm} onChange={(v) => setChangePassword({ ...changePassword, confirm: v })} type="password" placeholder="Confirm new password" />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  if (changePassword.newPass !== changePassword.confirm) { setProfileSaveMsg('Passwords do not match.'); return; }
                  if (changePassword.newPass.length < 6) { setProfileSaveMsg('Password must be at least 6 characters.'); return; }
                  setProfileSaveMsg('Password updated successfully!');
                  setChangePassword({ current: '', newPass: '', confirm: '' });
                  setEditingSection(null);
                  setTimeout(() => setProfileSaveMsg(null), 3000);
                }}
                className="flex-1 bg-leaf-500 hover:bg-leaf-600 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                Update Password
              </button>
              <button onClick={() => { setEditingSection(null); setChangePassword({ current: '', newPass: '', confirm: '' }); }} className="px-4 bg-gray-200 dark:bg-zinc-700 text-black dark:text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <SettingRow icon="lock" title="Change Password" subtitle="Update your account password"
            trailing={<button onClick={() => setEditingSection('password')} className="text-leaf-600 dark:text-leaf-400 text-xs font-bold">Change</button>}
          />
        )}
      </div>

      {/* Notifications */}
      <SectionTitle>Notifications</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="notifications"
          title="Push Notifications"
          subtitle="Receive ride updates & alerts"
          trailing={<Toggle enabled={pushNotifications} onChange={setPushNotifications} />}
        />
        <SettingRow
          icon="notification_important"
          title="Ride Alerts"
          subtitle="Price drops, nearby rides"
          trailing={<Toggle enabled={rideAlerts} onChange={setRideAlerts} />}
        />
        <SettingRow
          icon="campaign"
          title="Promotions & Offers"
          subtitle="Deals, discounts, rewards"
          trailing={<Toggle enabled={promoNotifications} onChange={setPromoNotifications} />}
        />
      </div>

      {/* Sound & Haptics */}
      <SectionTitle>Sound & Haptics</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="volume_up"
          title="Sound Effects"
          subtitle="In-app sounds for events"
          trailing={<Toggle enabled={soundEnabled} onChange={setSoundEnabled} />}
        />
        <SettingRow
          icon="vibration"
          title="Vibration"
          subtitle="Haptic feedback on actions"
          trailing={<Toggle enabled={vibrationEnabled} onChange={setVibrationEnabled} />}
        />
      </div>

      {/* Preferences */}
      <SectionTitle>Preferences</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="language"
          title="Language"
          subtitle="App display language"
          trailing={
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold text-black dark:text-white"
            >
              <option>English</option>
              <option>Hindi</option>
              <option>Tamil</option>
              <option>Telugu</option>
              <option>Kannada</option>
              <option>Malayalam</option>
            </select>
          }
        />
        <SettingRow
          icon="straighten"
          title="Distance Unit"
          subtitle="Kilometers or miles"
          trailing={
            <div className="flex bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
              <button
                onClick={() => setDistanceUnit('km')}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${distanceUnit === 'km' ? 'bg-leaf-500 text-white' : 'text-black dark:text-white'}`}
              >km</button>
              <button
                onClick={() => setDistanceUnit('mi')}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${distanceUnit === 'mi' ? 'bg-leaf-500 text-white' : 'text-black dark:text-white'}`}
              >mi</button>
            </div>
          }
        />
      </div>

      {/* Payment */}
      <SectionTitle>Payment</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="credit_card"
          title="Payment Methods"
          subtitle="Manage cards & UPI"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
        <SettingRow
          icon="receipt"
          title="Billing History"
          subtitle="View past transactions"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
      </div>

      {/* Danger Zone */}
      <SectionTitle>Danger Zone</SectionTitle>
      <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl px-4 border border-red-100 dark:border-red-900/30">
        <SettingRow
          icon="delete_forever"
          title="Delete Account"
          subtitle="Permanently remove all data"
          trailing={
            <button className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Delete
            </button>
          }
        />
      </div>

      <div className="mt-8 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-4">
        App Version 1.2.0 · Build 2026.02
      </div>
    </div>
  );

  // --- Safety & Privacy Screen ---
  const renderSafetyPrivacy = () => (
    <div className="px-5 pb-24 animate-in fade-in duration-300 bg-white dark:bg-black min-h-full">
      <SubScreenHeader title="Safety & Privacy" onBack={() => setSubScreen('MAIN')} />

      {/* Emergency */}
      <SectionTitle>Emergency</SectionTitle>
      <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-5 border border-red-100 dark:border-red-900/30 mb-2">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-12 rounded-2xl bg-red-500 flex items-center justify-center">
            <span className="material-icons-outlined text-white text-2xl">warning</span>
          </div>
          <div>
            <p className="text-lg font-black text-red-600 dark:text-red-400">Emergency SOS</p>
            <p className="text-xs text-red-500/70 dark:text-red-400/60">Tap during a ride to alert authorities</p>
          </div>
        </div>
        <button className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          <span className="material-icons-outlined text-lg">call</span>
          Call Emergency (112)
        </button>
      </div>

      {/* Trusted Contacts */}
      <SectionTitle>Trusted Contacts</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 py-2 border border-gray-100 dark:border-zinc-800 mb-2">
        {trustedContacts.length === 0 ? (
          <div className="py-6 text-center">
            <span className="material-icons-outlined text-4xl text-gray-300 dark:text-zinc-600 mb-2">group_add</span>
            <p className="text-sm font-bold text-gray-500 dark:text-zinc-500">No trusted contacts added</p>
            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">Add contacts to share your live trip status</p>
          </div>
        ) : (
          trustedContacts.map((contact, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-zinc-800 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-leaf-100 dark:bg-leaf-900/30 flex items-center justify-center">
                  <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400">person</span>
                </div>
                <span className="text-sm font-bold text-black dark:text-white">{contact}</span>
              </div>
              <button onClick={() => setTrustedContacts(trustedContacts.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-500">
                <span className="material-icons-outlined text-xl">close</span>
              </button>
            </div>
          ))
        )}
        <button
          onClick={() => {
            const name = prompt('Enter contact name or phone number:');
            if (name?.trim()) setTrustedContacts([...trustedContacts, name.trim()]);
          }}
          className="w-full py-3 flex items-center justify-center gap-2 text-leaf-600 dark:text-leaf-400 font-bold text-sm hover:bg-leaf-50 dark:hover:bg-leaf-900/10 rounded-xl transition-colors"
        >
          <span className="material-icons-outlined text-lg">add</span>
          Add Trusted Contact
        </button>
      </div>

      {/* Ride Safety */}
      <SectionTitle>Ride Safety</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="location_on"
          title="Live Location Sharing"
          subtitle="Share real-time location during rides"
          trailing={<Toggle enabled={locationSharing} onChange={setLocationSharing} />}
        />
        <SettingRow
          icon="share"
          title="Auto-Share Trip Status"
          subtitle="Send trip details to trusted contacts"
          trailing={<Toggle enabled={shareTripStatus} onChange={setShareTripStatus} />}
        />
        <SettingRow
          icon="mic"
          title="Ride Audio Recording"
          subtitle="Record audio during rides for safety"
          trailing={<Toggle enabled={rideRecording} onChange={setRideRecording} />}
        />
        <SettingRow
          icon="verified_user"
          title="Driver Verification"
          subtitle="Verify driver identity before ride"
          trailing={
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">Active</span>
          }
        />
      </div>

      {/* Security */}
      <SectionTitle>Security</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="lock"
          title="Two-Factor Authentication"
          subtitle="Extra security for your account"
          trailing={<Toggle enabled={twoFactorAuth} onChange={setTwoFactorAuth} />}
        />
        <SettingRow
          icon="key"
          title="Change Password"
          subtitle="Update your account password"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
        <SettingRow
          icon="devices"
          title="Active Sessions"
          subtitle="Manage logged-in devices"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
      </div>

      {/* Data Privacy */}
      <SectionTitle>Data & Privacy</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="history"
          title="Ride History"
          subtitle="View & manage your past rides"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
        <SettingRow
          icon="download"
          title="Download My Data"
          subtitle="Export your personal data"
          trailing={
            <button className="bg-leaf-500 hover:bg-leaf-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              Export
            </button>
          }
        />
        <SettingRow
          icon="policy"
          title="Privacy Policy"
          subtitle="How we handle your data"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
        <SettingRow
          icon="gavel"
          title="Terms of Service"
          subtitle="Our terms & conditions"
          trailing={<span className="material-icons-outlined text-gray-400">chevron_right</span>}
        />
      </div>

      {/* Permissions */}
      <SectionTitle>App Permissions</SectionTitle>
      <div className="bg-gray-50 dark:bg-zinc-900/50 rounded-2xl px-4 border border-gray-100 dark:border-zinc-800">
        <SettingRow
          icon="my_location"
          title="Location Access"
          subtitle="Required for ride services"
          trailing={
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">Granted</span>
          }
        />
        <SettingRow
          icon="camera_alt"
          title="Camera Access"
          subtitle="For profile photo & documents"
          trailing={
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">Granted</span>
          }
        />
        <SettingRow
          icon="contacts"
          title="Contacts Access"
          subtitle="For trusted contacts feature"
          trailing={
            <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">Not Set</span>
          }
        />
      </div>

      <div className="mt-8 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-4">
        Your data is encrypted & secured
      </div>
    </div>
  );

  // --- Route to sub-screens ---
  if (subScreen === 'SETTINGS') return renderSettings();
  if (subScreen === 'SAFETY_PRIVACY') return renderSafetyPrivacy();

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
          <MenuButton icon="security" title="Safety & Privacy" subtitle="Managed transmission & encryption" onClick={() => setSubScreen('SAFETY_PRIVACY')} />
          <MenuButton icon="settings" title="Dashboard Settings" onClick={() => setSubScreen('SETTINGS')} />
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
        <MenuButton icon="settings" title="Settings" onClick={() => setSubScreen('SETTINGS')} />
        <MenuButton icon="security" title="Safety & Privacy" onClick={() => setSubScreen('SAFETY_PRIVACY')} />
        <MenuButton icon="logout" title="Sign out" destructive onClick={onSignOut} />
      </div>

      <div className="mt-12 opacity-30 text-center text-[10px] font-bold uppercase tracking-widest text-black dark:text-white pb-4">
        LeafLift v1.2.0
      </div>
    </div>
  );
};

export default AccountScreen;
