
import React, { useState } from 'react';

interface AuthScreenProps {
  onAuthSuccess: (userData: any) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

type AuthRole = 'RIDER' | 'DRIVER';
type AuthStep = 'ROLE' | 'LANDING' | 'OTP' | 'NAME' | 'DOB' | 'GENDER' | 'LICENSE' | 'AADHAR';

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
  const [aadhar, setAadhar] = useState('');

  const handleNext = () => {
    if (step === 'ROLE') setStep('LANDING');
    else if (step === 'LANDING') setStep('OTP');
    else if (step === 'OTP') setStep('NAME');
    else if (step === 'NAME') setStep('DOB');
    else if (step === 'DOB') setStep('GENDER');
    else if (step === 'GENDER') {
      if (role === 'DRIVER') setStep('LICENSE');
      else onAuthSuccess({ role, firstName, lastName, phone, dob, gender });
    }
    else if (step === 'LICENSE') setStep('AADHAR');
    else if (step === 'AADHAR') {
      onAuthSuccess({ role, firstName, lastName, phone, dob, gender, license, aadhar });
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
            <h1 className="text-black dark:text-white text-[32px] font-black mb-8 leading-tight">Welcome to Go-Ride</h1>
            <p className="text-gray-500 dark:text-zinc-400 mb-10 font-bold">Choose how you want to use the app today.</p>
            <div className="space-y-4">
              <button 
                onClick={() => { setRole('RIDER'); setStep('LANDING'); }}
                className="w-full p-6 bg-[#f3f3f3] dark:bg-zinc-900 rounded-2xl flex items-center gap-6 border-2 border-transparent hover:border-[#f2b90d] transition-all group"
              >
                <div className="size-16 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-3xl group-hover:scale-110 transition-transform">directions_car</span>
                </div>
                <div className="text-left">
                  <h3 className="font-black text-xl text-black dark:text-white">I'm a Rider</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-500 font-bold">Find rides easily anytime</p>
                </div>
              </button>
              <button 
                onClick={() => { setRole('DRIVER'); setStep('LANDING'); }}
                className="w-full p-6 bg-[#f3f3f3] dark:bg-zinc-900 rounded-2xl flex items-center gap-6 border-2 border-transparent hover:border-[#f2b90d] transition-all group"
              >
                <div className="size-16 bg-white dark:bg-black rounded-xl flex items-center justify-center shadow-sm">
                  <span className="material-icons-outlined text-3xl group-hover:scale-110 transition-transform text-[#f2b90d]">local_taxi</span>
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
              <div className="size-20 bg-black dark:bg-white rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-[#f2b90d] dark:text-black font-black text-2xl tracking-tighter">GO</span>
              </div>
            </div>
            <h1 className="text-black dark:text-white text-[28px] font-bold text-center mb-8 leading-tight">
              Register as {role === 'DRIVER' ? 'Driver' : 'Rider'}
            </h1>
            <div className="space-y-4 mb-4">
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400">Mobile number</label>
              <div className="flex gap-2 h-[54px]">
                <div className="flex items-center gap-2 px-3 bg-[#f3f3f3] dark:bg-zinc-800 rounded-lg border border-transparent">
                  <img alt="India Flag" className="w-6 h-4 rounded-sm object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAF5Rdntj-ocESaRmwgw_7GngURd3ltP1wfFnqhbMjR2rFDJjGaqBqm-MgzQt72yeVDn6QNIOmhPO8ofGVvotGrZHDC5pzLRFQ0iiCG6n5cnmaqRBq_Q-hENn_bC2nE-fcAkN2s1c1A4CIm59eouh3vnOx4G_gnNmtiN02h7VKCyO858gElmDypT1NI9z0aYkdor9yokp1Bt6eYO92ZNR_qUstAZPI1L73fdqQYgXz423xCmg4cMm2AR8HQGKpRcLRmx8bbJSpmMA88"/>
                  <span className="material-icons-outlined text-gray-600 dark:text-zinc-500 text-[20px]">arrow_drop_down</span>
                </div>
                <div className="flex-1 flex items-center px-4 bg-white dark:bg-zinc-900 border-2 border-black dark:border-zinc-700 rounded-lg focus-within:border-[#f2b90d] transition-colors">
                  <span className="text-black dark:text-white font-medium mr-2">+91</span>
                  <input 
                    className="w-full bg-transparent border-none p-0 text-black dark:text-white font-medium placeholder:text-gray-400 focus:ring-0" 
                    placeholder="Mobile number" 
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={handleNext}
              disabled={phone.length < 10}
              className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg mb-8 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              Continue
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
                    else setStep('OTP');
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
                  className="w-14 h-14 border-2 border-black dark:border-zinc-700 bg-transparent rounded-lg text-center text-2xl font-bold text-black dark:text-white focus:ring-0 focus:border-[#f2b90d] transition-all" 
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
            <button onClick={handleNext} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg shadow-lg">Verify</button>
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
             <button onClick={handleNext} disabled={!firstName || !lastName} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg">Next</button>
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
            <button onClick={handleNext} disabled={aadhar.length < 12} className="w-full h-14 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg text-lg disabled:opacity-50 shadow-lg">Complete Registration</button>
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
