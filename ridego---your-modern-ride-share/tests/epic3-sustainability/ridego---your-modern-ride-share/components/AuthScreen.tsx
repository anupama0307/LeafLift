import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

type AuthMode = 'WELCOME' | 'SIGNIN' | 'SIGNUP_FORM' | 'EMAIL_OTP' | 'OAUTH_COMPLETE';
type UserRole = 'RIDER' | 'DRIVER';
type AuthRole = 'RIDER' | 'DRIVER';
type AuthStep = 'ROLE' | 'LANDING' | 'OTP' | 'NAME' | 'DOB' | 'GENDER' | 'LICENSE' | 'AADHAR';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess, toggleTheme, isDark }) => {
  const [mode, setMode] = useState<AuthMode>('WELCOME');

  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // Sign Up state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('RIDER');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [license, setLicense] = useState('');
  const [aadhar, setAadhar] = useState('');

  // Email OTP state
  const [emailOtp, setEmailOtp] = useState(['', '', '', '', '', '']);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpPurpose, setOtpPurpose] = useState<'signup' | 'signin'>('signup');
  const [pendingSignInUser, setPendingSignInUser] = useState<any>(null);

  // OAuth complete state (for filling remaining fields after Google/Apple sign in)
  const [oauthUser, setOauthUser] = useState<any>(null);

  // General state
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Handle Google redirect result on page load
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          const pendingMode = sessionStorage.getItem('leaflift_pending_mode');
          sessionStorage.removeItem('leaflift_pending_mode');

          if (pendingMode === 'signin') {
            await handleOAuthSignIn(user);
          } else {
            setOauthUser({
              id: user.uid,
              email: user.email || '',
              firstName: user.displayName?.split(' ')[0] || '',
              lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
              photoURL: user.photoURL,
              authProvider: 'google',
            });
            setFirstName(user.displayName?.split(' ')[0] || '');
            setLastName(user.displayName?.split(' ').slice(1).join(' ') || '');
            setEmail(user.email || '');
            setMode('OAUTH_COMPLETE');
          }
        }
      } catch (err: any) {
        console.error('Redirect result error:', err);
        setError(err.message || 'Failed to complete sign-in');
      }
    };
    handleRedirectResult();
  }, []);

  // --- OAuth Sign In (check if user exists in DB, then send OTP) ---
  const handleOAuthSignIn = async (firebaseUser: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: firebaseUser.email }),
      });
      const data = await response.json();
      if (data.exists && data.user) {
        // Store user data and send OTP for verification
        setPendingSignInUser(data.user);
        setOtpPurpose('signin');
        setIsLoading(false);
        await sendEmailOTP(firebaseUser.email);
      } else {
        setError('No account found with this email. Please sign up first.');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setIsLoading(false);
    }
  };

  // --- Google Sign-In Handler ---
  const handleGoogleAuth = async (forMode: 'signin' | 'signup') => {
    setIsGoogleLoading(true);
    setError(null);
    sessionStorage.setItem('leaflift_pending_mode', forMode);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      sessionStorage.removeItem('leaflift_pending_mode');

      if (forMode === 'signin') {
        await handleOAuthSignIn(user);
      } else {
        setOauthUser({
          id: user.uid,
          email: user.email || '',
          firstName: user.displayName?.split(' ')[0] || '',
          lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
          photoURL: user.photoURL,
          authProvider: 'google',
        });
        setFirstName(user.displayName?.split(' ')[0] || '');
        setLastName(user.displayName?.split(' ').slice(1).join(' ') || '');
        setEmail(user.email || '');
        setMode('OAUTH_COMPLETE');
      }
      setIsGoogleLoading(false);
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, googleProvider);
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

  // --- Email/Password Sign In (verify credentials, then send OTP) ---
  const handleEmailSignIn = async () => {
    if (!signInEmail || !signInPassword) {
      setError('Please enter email and password');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const result = await signInWithEmailAndPassword(auth, signInEmail, signInPassword);
      const user = result.user;

      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await response.json();
      if (data.exists && data.user) {
        // Store user data and send OTP for verification
        setPendingSignInUser(data.user);
        setOtpPurpose('signin');
        setIsLoading(false);
        await sendEmailOTP(signInEmail);
      } else {
        setError('Account not found in our system. Please sign up.');
        setIsLoading(false);
      }
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Wrong password.');
      } else {
        setError(err.message || 'Sign in failed');
      }
      setIsLoading(false);
    }
  };

  // --- Forgot Password ---
  const handleForgotPassword = async () => {
    if (!signInEmail) {
      setError('Please enter your email address first');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, signInEmail);
      setSuccessMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Send Email OTP ---
  const sendEmailOTP = async (targetEmail: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to send OTP');

      setOtpSentTo(targetEmail);
      setOtpTimer(60);
      setMode('EMAIL_OTP');
      setSuccessMessage(`OTP sent to ${targetEmail}`);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Verify Email OTP ---
  const verifyEmailOTP = async () => {
    const otpCode = emailOtp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpSentTo, otp: otpCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Invalid OTP');

      if (otpPurpose === 'signin' && pendingSignInUser) {
        // Sign-in OTP verified — complete login
        onAuthSuccess(pendingSignInUser);
      } else {
        // Sign-up OTP verified — complete registration
        await completeSignup();
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
      setIsLoading(false);
    }
  };

  // --- Complete Signup (after OTP verification) ---
  const completeSignup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // If not OAuth user, create Firebase account
      if (!oauthUser) {
        await createUserWithEmailAndPassword(auth, email, password);
      }

      const userData: any = {
        role,
        firstName,
        lastName,
        email: oauthUser?.email || email,
        phone: `+91${phone}`,
        dob,
        gender,
        authProvider: oauthUser?.authProvider || 'email',
        photoUrl: oauthUser?.photoURL || '',
      };

      if (role === 'DRIVER') {
        userData.license = license;
        userData.aadhar = aadhar;
      }

      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Signup failed');

      onAuthSuccess(data.user);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email already registered. Try signing in instead.');
      } else {
        setError(err.message || 'Signup failed');
      }
      setIsLoading(false);
    }
  };

  // --- Validate Signup Form ---
  const validateSignupForm = (): string | null => {
    if (!firstName.trim()) return 'First name is required';
    if (!lastName.trim()) return 'Last name is required';
    if (!email.trim()) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email';
    if (!phone.trim() || phone.length < 10) return 'Please enter a valid 10-digit phone number';
    if (!oauthUser) {
      if (!password) return 'Password is required';
      if (password.length < 6) return 'Password must be at least 6 characters';
      if (password !== confirmPassword) return 'Passwords do not match';
    }
    if (!dob) return 'Date of birth is required';
    if (!gender) return 'Please select your gender';
    if (role === 'DRIVER') {
      if (!license.trim()) return 'Driving license number is required';
      if (license.length > 16) return 'Driving license number must be at most 16 characters';
      if (!aadhar.trim() || aadhar.length < 12) return 'Please enter a valid 12-digit Aadhar number';
    }
    return null;
  };

  // --- Handle Signup Submit (triggers email OTP) ---
  const handleSignupSubmit = () => {
    const validationError = validateSignupForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setOtpPurpose('signup');
    sendEmailOTP(email);
  };

  // --- Shared Components ---
  const StepHeader = ({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) => (
    <div className="mb-6">
      {onBack && (
        <button onClick={onBack} className="mb-4 p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
          <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
        </button>
      )}
      <h1 className="text-black dark:text-white text-[28px] font-bold leading-tight mb-1">{title}</h1>
      {subtitle && <p className="text-gray-500 dark:text-zinc-400 font-medium text-sm">{subtitle}</p>}
    </div>
  );

  const OAuthButtons = ({ forMode }: { forMode: 'signin' | 'signup' }) => (
    <div className="space-y-3 mb-6">
      <button
        onClick={() => handleGoogleAuth(forMode)}
        disabled={isGoogleLoading}
        className="w-full h-14 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-3 rounded-xl text-black dark:text-white font-bold transition-all border border-gray-200 dark:border-zinc-700 disabled:opacity-50"
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

      <button
        onClick={() => alert('Apple Sign-In coming soon!')}
        className="w-full h-14 bg-black dark:bg-white hover:opacity-90 flex items-center justify-center gap-3 rounded-xl text-white dark:text-black font-bold transition-all"
      >
        <span className="material-icons-outlined">apple</span>
        Continue with Apple
      </button>
    </div>
  );

  const Divider = () => (
    <div className="relative flex py-3 items-center mb-6">
      <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
      <span className="flex-shrink mx-4 text-gray-400 text-sm font-bold uppercase tracking-widest">or</span>
      <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
    </div>
  );

  // ========== RENDER SCREENS ==========

  const renderWelcome = () => (
    <div className="flex-1 px-6 pt-12 flex flex-col animate-in fade-in duration-300">
      <div className="flex justify-end mb-4">
        <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
          <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </div>

      {/* Logo */}
      <div className="mb-8 flex justify-center">
        <div className="relative">
          <div className="size-24 bg-leaf-500 rounded-[28px] flex items-center justify-center shadow-lg shadow-leaf-500/20 rotate-12 absolute -inset-1 blur-sm opacity-50"></div>
          <div className="size-24 bg-black dark:bg-white rounded-[28px] flex items-center justify-center shadow-lg relative z-10 transition-transform hover:scale-110">
            <div className="absolute -top-1 -right-1 size-7 bg-leaf-400 rounded-full border-4 border-white dark:border-black animate-pulse"></div>
            <span className="text-leaf-500 dark:text-leaf-600 font-black text-4xl tracking-tighter">LL</span>
          </div>
        </div>
      </div>

      <h1 className="text-black dark:text-white text-[34px] font-black mb-3 leading-tight text-center">Welcome to LeafLift</h1>
      <p className="text-gray-500 dark:text-zinc-400 mb-10 font-bold text-center text-base">Your eco-friendly ride sharing platform</p>

      <div className="space-y-4">
        <button
          onClick={() => { setMode('SIGNUP_FORM'); setError(null); setSuccessMessage(null); }}
          className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 active:scale-[0.98] transition-all"
        >
          Sign Up
        </button>
        <button
          onClick={() => { setMode('SIGNIN'); setError(null); setSuccessMessage(null); }}
          className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 text-black dark:text-white font-black rounded-xl text-lg active:scale-[0.98] transition-all border border-gray-200 dark:border-zinc-700"
        >
          Sign In
        </button>
      </div>
    </div>
  );

  const renderSignIn = () => (
    <div className="flex-1 px-6 pt-4 pb-10 flex flex-col animate-in fade-in duration-300 overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <button onClick={() => { setMode('WELCOME'); setError(null); setSuccessMessage(null); }} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
          <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
        </button>
        <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
          <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </div>

      {/* Sign In / Sign Up Toggle */}
      <div className="flex bg-[#f3f3f3] dark:bg-zinc-800 rounded-xl p-1 mb-6">
        <button
          type="button"
          className="flex-1 py-3 rounded-lg text-sm font-black transition-all bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm"
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setMode('SIGNUP_FORM'); setError(null); setSuccessMessage(null); }}
          className="flex-1 py-3 rounded-lg text-sm font-black transition-all text-gray-400 dark:text-zinc-500"
        >
          Sign Up
        </button>
      </div>

      <StepHeader title="Sign In" subtitle="Welcome back! Sign in to continue." />

      <OAuthButtons forMode="signin" />
      <Divider />

      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
      {successMessage && <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-sm font-bold">{successMessage}</div>}

      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Email</label>
          <input
            autoFocus
            type="email"
            className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            placeholder="your@email.com"
            value={signInEmail}
            onChange={(e) => setSignInEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Password</label>
          <div className="relative">
            <input
              type={showSignInPassword ? 'text' : 'password'}
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 pr-12 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="Enter your password"
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSignIn(); }}
            />
            <button type="button" onClick={() => setShowSignInPassword(!showSignInPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-zinc-400">
              <span className="material-icons-outlined text-xl">{showSignInPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>
      </div>

      <button onClick={handleForgotPassword} disabled={isLoading} className="text-leaf-600 dark:text-leaf-400 text-sm font-bold mb-6 hover:underline disabled:opacity-50 text-left">
        Forgot password?
      </button>

      <button
        onClick={handleEmailSignIn}
        disabled={!signInEmail || !signInPassword || isLoading}
        className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><span className="material-icons-outlined animate-spin">sync</span> Signing in...</>
        ) : 'Sign In'}
      </button>

      <div className="text-center text-gray-500 dark:text-zinc-400 font-medium mt-6">
        Don't have an account?{' '}
        <button onClick={() => { setMode('SIGNUP_FORM'); setError(null); setSuccessMessage(null); }} className="text-leaf-600 dark:text-leaf-400 font-bold underline cursor-pointer">
          Sign Up
        </button>
      </div>
    </div>
  );

  const renderSignupForm = () => (
    <div className="flex-1 px-6 pt-4 pb-10 flex flex-col animate-in fade-in duration-300 overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <button onClick={() => { setMode('WELCOME'); setError(null); setSuccessMessage(null); }} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
          <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
        </button>
        <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
          <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </div>

      {/* Sign In / Sign Up Toggle */}
      <div className="flex bg-[#f3f3f3] dark:bg-zinc-800 rounded-xl p-1 mb-6">
        <button
          type="button"
          onClick={() => { setMode('SIGNIN'); setError(null); setSuccessMessage(null); }}
          className="flex-1 py-3 rounded-lg text-sm font-black transition-all text-gray-400 dark:text-zinc-500"
        >
          Sign In
        </button>
        <button
          type="button"
          className="flex-1 py-3 rounded-lg text-sm font-black transition-all bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm"
        >
          Sign Up
        </button>
      </div>

      <StepHeader title="Create Account" subtitle="Join LeafLift today" />

      <OAuthButtons forMode="signup" />
      <Divider />

      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}

      {/* Role Toggle */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-3">I am a</label>
        <div className="flex gap-3">
          <button
            onClick={() => setRole('RIDER')}
            className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition-all ${
              role === 'RIDER' ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-gray-200 dark:border-zinc-700 bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
            }`}
          >
            <span className="material-icons-outlined">directions_car</span>
            Rider
          </button>
          <button
            onClick={() => setRole('DRIVER')}
            className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition-all ${
              role === 'DRIVER' ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-gray-200 dark:border-zinc-700 bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
            }`}
          >
            <span className="material-icons-outlined">local_taxi</span>
            Driver
          </button>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {/* Name */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">First Name</label>
            <input
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Last Name</label>
            <input
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Email</label>
          <input
            type="email"
            className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Phone Number</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center px-4 h-14 bg-[#f3f3f3] dark:bg-zinc-800 rounded-xl border-2 border-transparent">
              <span className="text-black dark:text-white font-bold">+91</span>
            </div>
            <input
              type="tel"
              className="flex-1 h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="10-digit phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </div>
        </div>

        {/* Password (only for email signup, not OAuth) */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 pr-12 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
              <span className="material-icons-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Confirm Password</label>
          <input
            type="password"
            className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {/* DOB */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Date of Birth</label>
          <input
            type="date"
            className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-3">Gender</label>
          <div className="grid grid-cols-2 gap-2">
            {['Female', 'Male', 'Non-binary', 'Prefer not to say'].map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`h-12 rounded-xl flex items-center justify-center font-bold text-sm border-2 transition-all ${
                  gender === g ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-transparent bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Driver-specific fields */}
        {role === 'DRIVER' && (
          <>
            <div className="pt-2 border-t border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons-outlined text-leaf-600">verified_user</span>
                <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Driver Verification</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Driving License Number</label>
              <input
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                placeholder="DL-XXXXXXXXXXXXX"
                value={license}
                maxLength={16}
                onChange={(e) => setLicense(e.target.value.slice(0, 16).toUpperCase())}
              />
              <p className="text-xs text-gray-400 font-medium mt-1 px-1">Maximum 16 characters</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Aadhar Number</label>
              <input
                type="text"
                inputMode="numeric"
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                placeholder="XXXX XXXX XXXX"
                value={aadhar}
                onChange={(e) => setAadhar(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
              <p className="text-xs text-gray-400 font-medium mt-1 px-1">Used strictly for identity verification</p>
            </div>
          </>
        )}
      </div>

      <button
        onClick={handleSignupSubmit}
        disabled={isLoading}
        className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
      >
        {isLoading ? (
          <><span className="material-icons-outlined animate-spin">sync</span> Processing...</>
        ) : 'Continue'}
      </button>

      <div className="text-center text-gray-500 dark:text-zinc-400 font-medium">
        Already have an account?{' '}
        <button onClick={() => { setMode('SIGNIN'); setError(null); setSuccessMessage(null); }} className="text-leaf-600 dark:text-leaf-400 font-bold underline cursor-pointer">
          Sign In
        </button>
      </div>
    </div>
  );

  const renderOAuthComplete = () => (
    <div className="flex-1 px-6 pt-4 pb-10 flex flex-col animate-in fade-in duration-300 overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <button onClick={() => { setMode('WELCOME'); setOauthUser(null); setError(null); }} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
          <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
        </button>
        <button onClick={toggleTheme} className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
          <span className="material-icons-outlined text-sm">{isDark ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </div>

      <StepHeader title="Complete Your Profile" subtitle={`Signed in as ${oauthUser?.email}`} />

      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}

      {/* Role Toggle */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-3">I am a</label>
        <div className="flex gap-3">
          <button
            onClick={() => setRole('RIDER')}
            className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition-all ${
              role === 'RIDER' ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-gray-200 dark:border-zinc-700 bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
            }`}
          >
            <span className="material-icons-outlined">directions_car</span>
            Rider
          </button>
          <button
            onClick={() => setRole('DRIVER')}
            className={`flex-1 h-14 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition-all ${
              role === 'DRIVER' ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-gray-200 dark:border-zinc-700 bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
            }`}
          >
            <span className="material-icons-outlined">local_taxi</span>
            Driver
          </button>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {/* Name (pre-filled from OAuth) */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">First Name</label>
            <input
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Last Name</label>
            <input
              className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Phone Number</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center px-4 h-14 bg-[#f3f3f3] dark:bg-zinc-800 rounded-xl border-2 border-transparent">
              <span className="text-black dark:text-white font-bold">+91</span>
            </div>
            <input
              type="tel"
              className="flex-1 h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
              placeholder="10-digit phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </div>
        </div>

        {/* DOB */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Date of Birth</label>
          <input
            type="date"
            className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-3">Gender</label>
          <div className="grid grid-cols-2 gap-2">
            {['Female', 'Male', 'Non-binary', 'Prefer not to say'].map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`h-12 rounded-xl flex items-center justify-center font-bold text-sm border-2 transition-all ${
                  gender === g ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-transparent bg-[#f3f3f3] dark:bg-zinc-800 text-gray-600 dark:text-zinc-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Driver Fields */}
        {role === 'DRIVER' && (
          <>
            <div className="pt-2 border-t border-gray-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons-outlined text-leaf-600">verified_user</span>
                <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Driver Verification</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Driving License Number</label>
              <input
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                placeholder="DL-XXXXXXXXXXXXX"
                value={license}
                maxLength={16}
                onChange={(e) => setLicense(e.target.value.slice(0, 16).toUpperCase())}
              />
              <p className="text-xs text-gray-400 font-medium mt-1 px-1">Maximum 16 characters</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 dark:text-zinc-400 mb-2">Aadhar Number</label>
              <input
                type="text"
                inputMode="numeric"
                className="w-full h-14 bg-[#f3f3f3] dark:bg-zinc-800 border-2 border-transparent rounded-xl px-4 text-black dark:text-white font-medium focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
                placeholder="XXXX XXXX XXXX"
                value={aadhar}
                onChange={(e) => setAadhar(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>
          </>
        )}
      </div>

      <button
        onClick={handleSignupSubmit}
        disabled={isLoading}
        className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><span className="material-icons-outlined animate-spin">sync</span> Processing...</>
        ) : 'Continue'}
      </button>
    </div>
  );

  const renderEmailOTP = () => (
    <div className="flex-1 px-6 pt-8 animate-in fade-in slide-in-from-right duration-300">
      <StepHeader
        onBack={() => {
          if (otpPurpose === 'signin') {
            setMode('SIGNIN');
            setPendingSignInUser(null);
          } else {
            setMode(oauthUser ? 'OAUTH_COMPLETE' : 'SIGNUP_FORM');
          }
          setEmailOtp(['', '', '', '', '', '']);
          setError(null);
          setSuccessMessage(null);
        }}
        title="Verify Your Email"
        subtitle={`Enter the 6-digit code sent to ${otpSentTo}`}
      />

      {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-bold">{error}</div>}
      {successMessage && <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-sm font-bold">{successMessage}</div>}

      <div className="flex gap-2 mb-8 justify-center">
        {emailOtp.map((digit, i) => (
          <input
            key={i}
            id={`email-otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className="w-11 h-14 border-2 border-gray-100 dark:border-zinc-800 bg-[#f3f3f3] dark:bg-zinc-900 rounded-xl text-center text-2xl font-black text-black dark:text-white focus:ring-4 focus:ring-leaf-500/10 focus:border-leaf-500 transition-all"
            value={digit}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              const newOtp = [...emailOtp];
              newOtp[i] = val;
              setEmailOtp(newOtp);
              if (val && i < 5) document.getElementById(`email-otp-${i + 1}`)?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digit && i > 0) document.getElementById(`email-otp-${i - 1}`)?.focus();
            }}
          />
        ))}
      </div>

      <button
        onClick={verifyEmailOTP}
        disabled={emailOtp.join('').length !== 6 || isLoading}
        className="w-full h-14 bg-leaf-600 dark:bg-leaf-500 text-white font-black rounded-xl text-lg shadow-lg shadow-leaf-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <><span className="material-icons-outlined animate-spin">sync</span> Verifying...</>
        ) : otpPurpose === 'signin' ? 'Verify & Sign In' : 'Verify & Sign Up'}
      </button>

      <button
        onClick={() => {
          setEmailOtp(['', '', '', '', '', '']);
          setError(null);
          sendEmailOTP(otpSentTo);
        }}
        disabled={otpTimer > 0 || isLoading}
        className="mt-4 w-full text-center text-sm text-leaf-600 dark:text-leaf-400 font-bold hover:underline disabled:opacity-50"
      >
        {otpTimer > 0 ? `Resend OTP in ${otpTimer}s` : 'Resend OTP'}
      </button>
    </div>
  );

  // ========== MAIN RENDER ==========
  const renderContent = () => {
    switch (mode) {
      case 'WELCOME': return renderWelcome();
      case 'SIGNIN': return renderSignIn();
      case 'SIGNUP_FORM': return renderSignupForm();
      case 'OAUTH_COMPLETE': return renderOAuthComplete();
      case 'EMAIL_OTP': return renderEmailOTP();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-black overflow-y-auto">
      <div className="h-12 w-full flex items-center justify-between px-6 pt-2">
        <span className="text-black dark:text-white font-bold text-sm">9:41</span>
        <button onClick={toggleTheme} className="flex items-center gap-1.5 bg-gray-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
          <span className="material-icons-outlined text-base text-leaf-600 dark:text-leaf-400">
            {isDark ? 'light_mode' : 'dark_mode'}
          </span>
          <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">
            {isDark ? 'Light' : 'Dark'}
          </span>
        </button>
      </div>
      {renderContent()}
      <div className="pb-4 flex justify-center w-full mt-auto">
        <div className="w-32 h-1 bg-black dark:bg-white rounded-full opacity-20"></div>
      </div>
    </div>
  );
};

export default AuthScreen;
