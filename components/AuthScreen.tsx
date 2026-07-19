import React, { useState } from 'react';
import { ArrowRight, Apple, Loader2, Lock, Mail, Sparkles } from 'lucide-react';
import {
  sendResetEmail,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../services/firebaseAuth';

type Mode = 'login' | 'signup';

const getAuthErrorMessage = (authError: unknown) => {
  if (!(authError instanceof Error)) {
    return 'Authentication failed.';
  }

  const message = authError.message;

  if (message.includes('auth/unauthorized-domain')) {
    return 'This site is not allowed in Firebase yet. Add the current domain under Authentication > Settings > Authorized domains, then try again.';
  }

  if (message.includes('auth/popup-blocked')) {
    return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
  }

  if (message.includes('auth/popup-closed-by-user')) {
    return 'The sign-in window was closed before the sign-in finished.';
  }

  if (message.includes('auth/network-request-failed')) {
    return 'Firebase could not reach the network. Check your connection and try again.';
  }

  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password') || message.includes('auth/user-not-found')) {
    return 'The email or password is incorrect.';
  }

  if (message.includes('auth/email-already-in-use')) {
    return 'An account already exists for that email address.';
  }

  if (message.includes('Firebase auth is not configured')) {
    return 'Firebase authentication is not configured in this workspace yet.';
  }

  return 'We could not complete sign-in right now. Please try again.';
};

const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'email' | 'google' | 'apple' | 'reset'>(null);

  const clearStatus = () => {
    setError(null);
    setMessage(null);
  };

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    clearStatus();
    setLoading('email');

    try {
      if (mode === 'signup') {
        await signUpWithEmail(email.trim(), password, displayName.trim() || undefined);
        setMessage('Account created. You are signed in.');
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(null);
    }
  };

  const handleProviderAuth = async (provider: 'google' | 'apple') => {
    clearStatus();
    setLoading(provider);

    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(null);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }

    clearStatus();
    setLoading('reset');

    try {
      await sendResetEmail(email.trim());
      setMessage('Password reset email sent.');
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#d9d9d9] text-black">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(0,51,255,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(0,0,0,0.08),_transparent_30%)]" />
      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex items-center justify-center px-6 py-14 lg:px-16">
          <div className="max-w-xl space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-600">Articulate workspace access</div>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-lg text-5xl font-semibold tracking-tight sm:text-6xl">
                Sign in to keep your canvas, chat, and projects in sync.
              </h1>
              <p className="max-w-lg text-base leading-7 text-neutral-700">
                Use email and password, or continue with Google or Apple. Your project snapshots stay tied to your Firebase account.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { title: 'Canvas sync', body: 'Project state follows your account.' },
                { title: 'Fast auth', body: 'Email, Google, or Apple sign-in.' },
                { title: 'Saved sessions', body: 'Return to the same workspace later.' },
              ].map(card => (
                <div key={card.title} className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm backdrop-blur">
                  <div className="text-sm font-medium">{card.title}</div>
                  <div className="mt-2 text-sm leading-6 text-neutral-600">{card.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 lg:px-10">
          <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/90 p-6 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">Firebase auth</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
              </div>
              <div className="rounded-full bg-black px-3 py-2 text-xs font-mono uppercase tracking-[0.22em] text-white">Secure</div>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-full bg-neutral-100 p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`rounded-full px-4 py-2 transition-colors ${mode === 'login' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`rounded-full px-4 py-2 transition-colors ${mode === 'signup' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
              >
                Signup
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleEmailAuth}>
              {mode === 'signup' && (
                <label className="block">
                  <span className="mb-2 block text-xs font-mono uppercase tracking-[0.22em] text-neutral-500">Display name</span>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 outline-none transition-colors placeholder:text-neutral-300 focus:border-black"
                    placeholder="Your name"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-mono uppercase tracking-[0.22em] text-neutral-500">Email</span>
                <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 focus-within:border-black">
                  <Mail className="h-4 w-4 text-neutral-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-transparent outline-none placeholder:text-neutral-300"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-mono uppercase tracking-[0.22em] text-neutral-500">Password</span>
                <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 focus-within:border-black">
                  <Lock className="h-4 w-4 text-neutral-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-transparent outline-none placeholder:text-neutral-300"
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </label>

              {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              {message && <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

              <button
                type="submit"
                disabled={loading !== null}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-black text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200" />
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-400">or continue with</div>
              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleProviderAuth('google')}
                disabled={loading !== null}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white transition-colors hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full border border-black/10 bg-gradient-to-br from-red-500 via-amber-400 to-blue-500 text-[10px] font-bold text-white">G</span>}
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderAuth('apple')}
                disabled={loading !== null}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white transition-colors hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
                <span>Continue with Apple</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading !== null}
              className="mt-5 w-full text-center text-xs font-mono uppercase tracking-[0.22em] text-neutral-500 transition-colors hover:text-black disabled:opacity-60"
            >
              {loading === 'reset' ? 'Sending reset email...' : 'Forgot password?'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;