'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { BrandLogo } from '@/components/brand/BrandLogo';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // If already logged in, skip landing page and go straight to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="hero-bg relative flex min-h-screen items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
        <BrandLogo size="xl" showText={false} logoClassName="h-24 w-auto drop-shadow-none" />
      </div>
      <div className="hero-blob left-[-4rem] top-[2rem] h-64 w-64 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-80 w-80 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-72 w-72 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-center gap-12">
        <div className="hidden max-w-sm lg:block">
          <p className="mb-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-700">
            Real-Time Collaboration
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            Build together on
            {' '}
            <span className="neon-title">an infinite canvas</span>
          </h1>
          <p className="mt-4 text-slate-600">
            Create, edit, and share whiteboards in real time with your team.
          </p>
        </div>

        <div className="glass-panel w-full max-w-md rounded-3xl p-7 shadow-[0_28px_80px_-40px_rgba(0,61,130,0.55)]">
          <h2 className="mb-1 text-center text-3xl font-bold text-slate-900">Welcome to Collabry</h2>
          <p className="mb-6 text-center text-sm text-slate-600">Start a board and collaborate instantly</p>

          <div className="space-y-3">
            <button
              onClick={() => router.push('/signup')}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-2.5 font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.01]"
            >
              Create Account
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Sign In
            </button>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2">Real-time multiplayer sync</div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">Infinite canvas with smooth navigation</div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">Persistent boards with auto-save</div>
          </div>
        </div>
      </div>
    </div>
  );
}
