
import React, { useState } from 'react';

interface AuthScreenProps {
  onAuthSuccess: (userData: any) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

type AuthRole = 'RIDER' | 'DRIVER';
type AuthStep = 'ROLE' | 'LANDING' | 'OTP' | 'NAME' | 'DOB' | 'GENDER' | 'LICENSE' | 'LICENSE_UPLOAD' | 'AADHAR' | 'AADHAR_UPLOAD';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess, toggleTheme, isDark }) => {
  const [role, setRole] = useState<AuthRole | null>(null);
  const [step, setStep] = useState<AuthStep>('ROLE');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [license, setLicense] = useState('');
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [aadhar, setAadhar] = useState('');
  const [aadharUrl, setAadharUrl] = useState<string | null>(null);

  const [existingUser, setExistingUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkUser = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, role }),
      });
      const data = await response.json();
      if (data.exists) {
        setExistingUser(data.user);
      } else {
        setExistingUser(null);
      }
      setStep('OTP');
    } catch (err: any) {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (userData: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      onAuthSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 'ROLE') setStep('LANDING');
    else if (step === 'LANDING') checkUser();
    else if (step === 'OTP') {
      if (existingUser) {
        onAuthSuccess(existingUser);
      } else {
        setStep('NAME');
      }
    }
    else if (step === 'NAME') setStep('DOB');
    else if (step === 'DOB') setStep('GENDER');
    else if (step === 'GENDER') {
      if (role === 'DRIVER') setStep('LICENSE');
      else handleSignup({ role, firstName, lastName, phone, dob, gender });
    }
    else if (step === 'LICENSE') setStep('LICENSE_UPLOAD');
    else if (step === 'LICENSE_UPLOAD') setStep('AADHAR');
    else if (step === 'AADHAR') setStep('AADHAR_UPLOAD');
    else if (step === 'AADHAR_UPLOAD') {
      handleSignup({ role, firstName, lastName, phone, dob, gender, license, licenseUrl, aadhar, aadharUrl });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'license' | 'aadhar') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'license') setLicenseUrl(reader.result as string);
        else setAadharUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const StepHeader = ({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) => (
    <div className="mb-8">
      {onBack && (
        <button onClick={onBack} className="mb-6 p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
          <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
        </button>
      )}
      <h1 className="text-black dark:text-white text-[28px] font-bold leading-tight mb-2">{title}</h1>
      {subtitle && <p className="text-gray-500 dark:text-zinc-400 font-medium">{subtitle}</p>}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 'ROLE':
        return (
          <div className="flex-1 px-6 pt-12 flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-end mb-4">
              <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
                <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
              </button>
            </div>
            <h1 className="text-black dark:text-white text-[32px] font-black mb-8 leading-tight">Welcome to LeafLift</h1>
            <p className="text-gray-500 dark:text-zinc-400 mb-10 font-bold">Choose how you want to use the app today.</p>
            <div className="space-y-4">
              <button
                onClick={() => { setRole('RIDER'); setStep('LANDING'); }}
                className="w-full p-6 bg-[#f3f3f3] dark:bg-zinc-900 rounded-2xl flex items-center gap-6 border-2 border-transparent hover:border-leaf-500 transition-all group"
              >
                <div className="size-16 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-3xl group-hover:scale-110 transition-transform text-leaf-600">directions_car</span>
                </div>
                <div className="text-left">
                  <h3 className="font-black text-xl text-black dark:text-white">I'm a Rider</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-500 font-bold">Find rides easily anytime</p>
                </div>
              </button>
              <button
                onClick={() => { setRole('DRIVER'); setStep('LANDING'); }}
                className="w-full p-6 bg-[#f3f3f3] dark:bg-zinc-900 rounded-2xl flex items-center gap-6 border-2 border-transparent hover:border-leaf-500 transition-all group"
              >
                <div className="size-16 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-3xl group-hover:scale-110 transition-transform text-leaf-600">local_taxi</span>
                </div>
                <div className="text-left">
                  <h3 className="font-black text-xl text-black dark:text-white">I'm a Driver</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-500 font-bold">Earn money on your schedule</p>
                </div>
              </button>
            </div>
          </div>
        );
      case 'LANDING':
        return (
          <div className="flex-1 px-6 pt-4 pb-10 flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setStep('ROLE')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
              </button>
              <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
                <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
              </button>
            </div>
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="size-20 bg-leaf-500 rounded-[24px] flex items-center justify-center shadow-lg shadow-leaf-500/20 rotate-12 absolute -inset-1 blur-sm opacity-50"></div>
                <div className="size-20 bg-black dark:bg-white rounded-[24px] flex items-center justify-center shadow-lg relative z-10 transition-transform hover:scale-110">
                  <div className="absolute -top-1 -right-1 size-6 bg-leaf-400 rounded-full border-4 border-white dark:border-black animate-pulse"></div>
                  <span className="text-leaf-500 dark:text-leaf-600 font-black text-3xl tracking-tighter">LL</span>
                </div>
              </div>
            </div>
            <h1 className="text-black dark:text-white text-[28px] font-bold text-center mb-8 leading-tight">
              Register as {role === 'DRIVER' ? 'Driver' : 'Rider'}
            </h1>
            <div className="space-y-4 mb-4">
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400">Mobile number</label>
              <div className="flex gap-2 h-[54px]">
                <div className="flex items-center gap-2 px-3 bg-[#f3f3f3] dark:bg-zinc-800 rounded-lg border border-transparent">
                  <img alt="India Flag" className="w-6 h-4 rounded-sm object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAF5Rdntj-ocESaRmwgw_7GngURd3ltP1wfFnqhbMjR2rFDJjGaqBqm-MgzQt72yeVDn6QNIOmhPO8ofGVvotGrZHDC5pzLRFQ0iiCG6n5cnmaqRBq_Q-hENn_bC2nE-fcAkN2s1c1A4CIm59eouh3vnOx4G_gnNmtiN02h7VKCyO858gElmDypT1NI9z0aYkdor9yokp1Bt6eYO92ZNR_qUstAZPI1L73fdqQYgXz423xCmg4cMm2AR8HQGKpRcLRmx8bbJSpmMA88" />
                  <span className="material-icons-outlined text-gray-600 dark:text-zinc-500 text-[20px]">arrow_drop_down</span>
                </div>
                <div className="flex-1 flex items-center px-4 bg-white dark:bg-zinc-900 border-2 border-gray-100 dark:border-zinc-800 rounded-xl focus-within:border-leaf-500 focus-within:ring-4 focus-within:ring-leaf-500/10 transition-all">
                  <span className="text-black dark:text-white font-bold mr-2">+91</span>
                  <input
                    className="w-full bg-transparent border-none p-0 text-black dark:text-white font-bold placeholder:text-gray-400 focus:ring-0"
                    placeholder="Mobile number"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
            <button
              onClick={handleNext}
              disabled={phone.length < 10 || isLoading}
              className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg mb-8 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-leaf-500/20 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="material-icons-outlined animate-spin shadow-sm">sync</span>
                  Processing...
                </>
              ) : 'Continue'}
            </button>
            <div className="relative flex py-3 items-center mb-6">
              <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-sm font-bold uppercase tracking-widest">or</span>
              <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
            </div>
            <div className="space-y-3 mb-8">
              {['Apple', 'Google', 'Email'].map(method => (
                <button
                  key={method}
                  onClick={() => {
                    // Even if social login, user must provide mobile number as per request
                    // So we stay on LANDING but show they need to fill phone if they haven't
                    if (!phone) alert("Please provide your mobile number first.");
                    else checkUser();
                  }}
                  className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 hover:opacity-80 flex items-center justify-center gap-3 rounded-lg text-black dark:text-white font-bold transition-all"
                >
                  <span className="material-icons-outlined">{method.toLowerCase()}</span>
                  Continue with {method}
                </button>
              ))}
            </div>
          </div>
        );
      case 'OTP':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader
              onBack={() => setStep('LANDING')}
              title={`Enter the 4-digit code sent to +91 ${phone}`}
            />
            <div className="flex gap-4 mb-8">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  type="text"
                  maxLength={1}
                  className="w-14 h-14 border-2 border-gray-100 dark:border-zinc-800 bg-[#f3f3f3] dark:bg-zinc-900 rounded-xl text-center text-2xl font-black text-black dark:text-white focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                  value={digit}
                  onChange={(e) => {
                    const newOtp = [...otp];
                    newOtp[i] = e.target.value;
                    setOtp(newOtp);
                    if (e.target.value && i < 3) {
                      (e.target.nextSibling as HTMLInputElement)?.focus();
                    }
                  }}
                />
              ))}
            </div>
            <button onClick={handleNext} className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95">Verify</button>
            <p className="mt-6 text-sm text-gray-500 font-bold">Resend code in 0:30</p>
          </div>
        );
      case 'NAME':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader title="What's your name?" />
            <div className="space-y-4 mb-8">
              <input
                autoFocus
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-none rounded-lg px-4 text-black dark:text-white font-medium focus:ring-2 focus:ring-[#f2b90d]"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-none rounded-lg px-4 text-black dark:text-white font-medium focus:ring-2 focus:ring-[#f2b90d]"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
            <button onClick={handleNext} disabled={!firstName || !lastName || isLoading} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <span className="material-icons-outlined animate-spin shadow-sm">sync</span>
                  Saving...
                </>
              ) : 'Next'}
            </button>
          </div>
        );
      case 'DOB':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader
              title="When were you born?"
              subtitle="This helps us confirm you're of legal age."
            />
            <input
              type="date"
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-none rounded-lg px-4 text-black dark:text-white font-medium mb-8 focus:ring-2 focus:ring-[#f2b90d]"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
            <button onClick={handleNext} disabled={!dob} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg">Next</button>
          </div>
        );
      case 'GENDER':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader title="Select your gender" />
            <div className="space-y-3 mb-8">
              {['Female', 'Male', 'Non-binary', 'Prefer not to say'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`w-full h-14 rounded-lg flex items-center px-4 font-bold border-2 transition-all ${gender === g ? 'border-[#f2b90d] bg-black text-white dark:bg-white dark:text-black' : 'border-transparent bg-[#f3f3f3] dark:bg-zinc-800 text-black dark:text-white'}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <button onClick={handleNext} disabled={!gender} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg">Next</button>
          </div>
        );
      case 'LICENSE':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader title="Driving License" subtitle="Please enter your valid driving license number." />
            <div className="space-y-4 mb-8">
              <input
                autoFocus
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-none rounded-lg px-4 text-black dark:text-white font-medium focus:ring-2 focus:ring-[#f2b90d]"
                placeholder="License Number (e.g. DL-XXXXXXXXXXXXX)"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
              />
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700/50 flex gap-3">
                <span className="material-icons-outlined text-yellow-600">info</span>
                <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">Your license details will be verified for safety.</p>
              </div>
            </div>
            <button onClick={handleNext} disabled={!license} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg">Next</button>
          </div>
        );
      case 'AADHAR':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader title="Aadhar Card" subtitle="Enter your 12-digit Aadhar number." />
            <div className="space-y-4 mb-8">
              <input
                autoFocus
                type="number"
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-none rounded-lg px-4 text-black dark:text-white font-medium focus:ring-2 focus:ring-[#f2b90d]"
                placeholder="XXXX XXXX XXXX"
                value={aadhar}
                onChange={(e) => setAadhar(e.target.value.slice(0, 12))}
              />
              <p className="text-xs text-gray-400 font-bold px-1">Aadhar data is used strictly for identity verification.</p>
            </div>
            {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
            <button onClick={handleNext} disabled={aadhar.length < 12 || isLoading} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg flex items-center justify-center gap-2">
              Next
            </button>
          </div>
        );
      case 'LICENSE_UPLOAD':
      case 'AADHAR_UPLOAD':
        const isLicense = step === 'LICENSE_UPLOAD';
        const currentUrl = isLicense ? licenseUrl : aadharUrl;
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader
              title={`Upload ${isLicense ? 'Driving License' : 'Aadhar Card'}`}
              subtitle={`Please upload a clear photo of your ${isLicense ? 'license' : 'Aadhar card'} for verification.`}
            />
            <div className="flex-1 flex flex-col items-center justify-center mb-8">
              <input
                type="file"
                id="doc-upload"
                className="hidden"
                accept="image/*"
                onChange={(e) => handleFileChange(e, isLicense ? 'license' : 'aadhar')}
              />
              <label
                htmlFor="doc-upload"
                className={`w-full aspect-[4/3] rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all overflow-hidden ${currentUrl ? 'border-leaf-500 bg-leaf-50/50 dark:bg-leaf-900/10' : 'border-gray-200 dark:border-zinc-800 bg-[#f3f3f3] dark:bg-zinc-900 hover:border-leaf-500'}`}
              >
                {currentUrl ? (
                  <img src={currentUrl} className="w-full h-full object-cover" alt="Document Preview" />
                ) : (
                  <>
                    <div className="size-16 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm">
                      <span className="material-icons-outlined text-3xl text-leaf-600">cloud_upload</span>
                    </div>
                    <div className="text-center">
                      <p className="font-bold dark:text-white">Tap to upload photo</p>
                      <p className="text-xs text-gray-500 font-medium">PNG, JPG or JPEG up to 10MB</p>
                    </div>
                  </>
                )}
              </label>

              {currentUrl && (
                <button
                  onClick={() => isLicense ? setLicenseUrl(null) : setAadharUrl(null)}
                  className="mt-4 text-red-500 font-bold text-sm flex items-center gap-1"
                >
                  <span className="material-icons-outlined text-sm">delete</span>
                  Remove and retake
                </button>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={!currentUrl || isLoading}
              className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all overflow-hidden relative"
            >
              {isLoading ? (
                <>
                  <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span>Running Background Check...</span>
                </>
              ) : (
                <>
                  <span className="material-icons-outlined text-xl">{isLicense ? 'arrow_forward' : 'verified_user'}</span>
                  {isLicense ? 'Next' : 'Complete & Verify'}
                </>
              )}
            </button>
            {!isLicense && !isLoading && (
              <p className="mt-4 text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
                By completing, you agree to our <span className="text-leaf-500">Identity Verification Protocol</span><br />
                and background screening process.
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-black overflow-y-auto">
      <div className="h-12 w-full flex items-center justify-between px-6 pt-2">
        <span className="text-black dark:text-white font-bold text-sm">9:41</span>
        <div className="flex items-center gap-1.5">
          <span className="material-icons-outlined text-[18px] text-black dark:text-white">signal_cellular_4_bar</span>
          <span className="material-icons-outlined text-[18px] text-black dark:text-white">wifi</span>
          <span className="material-icons-outlined text-[22px] text-black dark:text-white">battery_full</span>
        </div>
      </div>
      {renderStep()}
      <div className="pb-4 flex justify-center w-full mt-auto">
        <div className="w-32 h-1 bg-black dark:bg-white rounded-full opacity-20"></div>
      </div>
    </div>
  );
};

export default AuthScreen;
