
import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider } from '../src/firebase';

interface AuthScreenProps {
  onAuthSuccess: (userData: any) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

type AuthRole = 'RIDER' | 'DRIVER';
type AuthStep = 'ROLE' | 'LANDING' | 'OTP' | 'NAME' | 'DOB' | 'GENDER' | 'LICENSE' | 'AADHAR' | 'EMAIL_AUTH';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Extend Window interface for recaptchaVerifier
declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier | undefined;
    confirmationResult: ConfirmationResult | undefined;
  }
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess, toggleTheme, isDark }) => {
  const [role, setRole] = useState<AuthRole | null>(() => {
    // Restore role from sessionStorage after redirect
    const savedRole = sessionStorage.getItem('leaflift_pending_role');
    return savedRole as AuthRole | null;
  });
  const [step, setStep] = useState<AuthStep>('ROLE');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']); // 6 digits for Firebase
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [license, setLicense] = useState('');
  const [aadhar, setAadhar] = useState('');

  // Email auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [existingUser, setExistingUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Initialize reCAPTCHA verifier
  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          setError('reCAPTCHA expired. Please try again.');
        }
      });
    }
  };

  // Handle redirect result on page load
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          const savedRole = sessionStorage.getItem('leaflift_pending_role') || 'RIDER';

          const userData = {
            id: user.uid,
            email: user.email,
            firstName: user.displayName?.split(' ')[0] || '',
            lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
            photoURL: user.photoURL,
            phone: user.phoneNumber || '',
            role: savedRole,
            authProvider: 'google',
          };

          sessionStorage.removeItem('leaflift_pending_role');
          onAuthSuccess(userData);
        }
      } catch (err: any) {
        console.error('Redirect result error:', err);
        setError(err.message || 'Failed to complete sign-in');
      }
    };

    handleRedirectResult();
  }, [onAuthSuccess]);

  // Google Sign-In Handler - tries popup first, falls back to redirect
  const handleGoogleSignIn = async () => {
    if (!role) {
      setError('Please select a role first');
      return;
    }

    setIsGoogleLoading(true);
    setError(null);

    // Save role for after redirect
    sessionStorage.setItem('leaflift_pending_role', role);

    try {
      // Try popup first
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userData = {
        id: user.uid,
        email: user.email,
        firstName: user.displayName?.split(' ')[0] || '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
        photoURL: user.photoURL,
        phone: user.phoneNumber || '',
        role: role,
        authProvider: 'google',
      };

      sessionStorage.removeItem('leaflift_pending_role');
      onAuthSuccess(userData);
    } catch (err: any) {
      console.error('Google sign-in error:', err);

      // If popup fails, try redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, googleProvider);
          // Page will redirect, no need to handle here
        } catch (redirectErr: any) {
          setError(redirectErr.message || 'Failed to sign in with Google');
          setIsGoogleLoading(false);
        }
      } else {
        setError(err.message || 'Failed to sign in with Google');
        setIsGoogleLoading(false);
      }
    }
  };

  // Firebase Phone Auth - Send OTP
  const sendOTP = async () => {
    if (phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setupRecaptcha();
      const phoneNumber = `+91${phone}`;
      const appVerifier = window.recaptchaVerifier!;

      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(confirmation);
      window.confirmationResult = confirmation;
      setStep('OTP');
    } catch (err: any) {
      console.error('Phone auth error:', err);
      // Reset reCAPTCHA on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }

      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to send OTP');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Firebase Phone Auth - Verify OTP
  const verifyOTP = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const confirmation = confirmationResult || window.confirmationResult;
      if (!confirmation) {
        throw new Error('No confirmation result. Please request a new OTP.');
      }

      const result = await confirmation.confirm(otpCode);
      const user = result.user;

      // Check if this is a new user (no display name set)
      if (!user.displayName) {
        // New user - go to name step
        setExistingUser(null);
        setStep('NAME');
      } else {
        // Existing user - log them in
        const userData = {
          id: user.uid,
          email: user.email || '',
          firstName: user.displayName?.split(' ')[0] || '',
          lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
          photoURL: user.photoURL || '',
          phone: user.phoneNumber || `+91${phone}`,
          role: role,
          authProvider: 'phone',
        };
        onAuthSuccess(userData);
      }
    } catch (err: any) {
      console.error('OTP verification error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Invalid OTP. Please check and try again.');
      } else if (err.code === 'auth/code-expired') {
        setError('OTP expired. Please request a new one.');
      } else {
        setError(err.message || 'Failed to verify OTP');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Firebase Email/Password Auth Handler
  const handleEmailAuth = async () => {
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (!role) {
      setError('Please select a role first');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsEmailLoading(true);
    setError(null);

    try {
      let result;
      
      if (isSignUp) {
        // Create new account
        result = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        // Sign in to existing account
        result = await signInWithEmailAndPassword(auth, email, password);
      }

      const user = result.user;

      // For new users, go to name step
      if (isSignUp) {
        setExistingUser(null);
        setStep('NAME');
      } else {
        // Existing user - log them in
        const userData = {
          id: user.uid,
          email: user.email || email,
          firstName: user.displayName?.split(' ')[0] || '',
          lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
          photoURL: user.photoURL || '',
          phone: '',
          role: role,
          authProvider: 'email',
        };
        onAuthSuccess(userData);
      }
    } catch (err: any) {
      console.error('Email auth error:', err);
      
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already registered. Try signing in instead.');
        setIsSignUp(false);
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found. Try signing up instead.');
        setIsSignUp(true);
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Send password reset email
  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setIsEmailLoading(true);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email);
      setError(null);
      alert('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError(err.message || 'Failed to send reset email');
      }
    } finally {
      setIsEmailLoading(false);
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
    else if (step === 'LANDING') sendOTP(); // Changed from checkUser to sendOTP
    else if (step === 'OTP') {
      verifyOTP(); // Use Firebase OTP verification
    }
    else if (step === 'NAME') setStep('DOB');
    else if (step === 'DOB') setStep('GENDER');
    else if (step === 'GENDER') {
      if (role === 'DRIVER') setStep('LICENSE');
      else handleSignup({ role, firstName, lastName, phone: `+91${phone}`, dob, gender });
    }
    else if (step === 'LICENSE') setStep('AADHAR');
    else if (step === 'AADHAR') {
      handleSignup({ role, firstName, lastName, phone: `+91${phone}`, dob, gender, license, aadhar });
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
              {/* Google Sign-In - Fully functional */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="w-full h-14 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-3 rounded-lg text-black dark:text-white font-bold transition-all border border-gray-200 dark:border-zinc-700 disabled:opacity-50"
              >
                {isGoogleLoading ? (
                  <>
                    <span className="material-icons-outlined animate-spin">sync</span>
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>

              {/* Apple Sign-In - Coming soon */}
              <button
                onClick={() => alert('Apple Sign-In coming soon!')}
                className="w-full h-14 bg-black dark:bg-white hover:opacity-90 flex items-center justify-center gap-3 rounded-lg text-white dark:text-black font-bold transition-all"
              >
                <span className="material-icons-outlined">apple</span>
                Continue with Apple
              </button>

              {/* Email Sign-In - Now functional */}
              <button
                onClick={() => {
                  setError(null);
                  setEmail('');
                  setPassword('');
                  setStep('EMAIL_AUTH');
                }}
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 hover:opacity-80 flex items-center justify-center gap-3 rounded-lg text-black dark:text-white font-bold transition-all"
              >
                <span className="material-icons-outlined">email</span>
                Continue with Email
              </button>
            </div>
          </div>
        );
      case 'OTP':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader
              onBack={() => {
                setStep('LANDING');
                setOtp(['', '', '', '', '', '']);
                setError(null);
              }}
              title={`Enter the 6-digit code sent to +91 ${phone}`}
            />
            {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
            <div className="flex gap-2 mb-8 justify-center">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className="w-11 h-14 border-2 border-gray-100 dark:border-zinc-800 bg-[#f3f3f3] dark:bg-zinc-900 rounded-xl text-center text-2xl font-black text-black dark:text-white focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                  value={digit}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    const newOtp = [...otp];
                    newOtp[i] = val;
                    setOtp(newOtp);
                    if (val && i < 5) {
                      document.getElementById(`otp-${i + 1}`)?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && i > 0) {
                      document.getElementById(`otp-${i - 1}`)?.focus();
                    }
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleNext}
              disabled={otp.join('').length !== 6 || isLoading}
              className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="material-icons-outlined animate-spin">sync</span>
                  Verifying...
                </>
              ) : 'Verify'}
            </button>
            <button
              onClick={() => {
                setOtp(['', '', '', '', '', '']);
                setError(null);
                if (window.recaptchaVerifier) {
                  window.recaptchaVerifier.clear();
                  window.recaptchaVerifier = undefined;
                }
                sendOTP();
              }}
              className="mt-4 w-full text-center text-sm text-leaf-600 dark:text-leaf-400 font-bold hover:underline"
            >
              Resend OTP
            </button>
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
              {isLoading ? (
                <>
                  <span className="material-icons-outlined animate-spin">sync</span>
                  Completing...
                </>
              ) : 'Complete Registration'}
            </button>
          </div>
        );
      case 'EMAIL_AUTH':
        return (
          <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
            <StepHeader 
              onBack={() => {
                setStep('LANDING');
                setError(null);
              }}
              title={isSignUp ? 'Create Account' : 'Sign In'}
              subtitle={isSignUp ? 'Enter your email and create a password' : 'Enter your email and password'}
            />
            {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
            
            <div className="space-y-4 mb-6">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Email</label>
                <input
                  autoFocus
                  type="email"
                  className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              {/* Password Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 pr-12 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                    placeholder={isSignUp ? 'Create a password (min 6 chars)' : 'Enter your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && email && password) {
                        handleEmailAuth();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                  >
                    <span className="material-icons-outlined text-xl">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Forgot Password - only show for login */}
            {!isSignUp && (
              <button
                onClick={handleForgotPassword}
                disabled={isEmailLoading}
                className="text-leaf-600 dark:text-leaf-400 text-sm font-bold mb-6 hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}
            
            {/* Submit Button */}
            <button 
              onClick={handleEmailAuth}
              disabled={!email || !password || isEmailLoading}
              className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
            >
              {isEmailLoading ? (
                <>
                  <span className="material-icons-outlined animate-spin">sync</span>
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
            
            {/* Toggle Sign Up / Sign In */}
            <p className="text-center text-gray-500 dark:text-zinc-400 font-medium">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-leaf-600 dark:text-leaf-400 font-bold hover:underline"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
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
      {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
      <div id="recaptcha-container"></div>
    </div>
  );
};

export default AuthScreen;
