'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { BrandLogo } from '@/components/brand/BrandLogo';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const featureHighlights = [
    {
      title: 'Real-time multiplayer sync',
      description: 'Bring your team together in milliseconds.',
      accent: 'from-cyan-400 to-cyan-600',
      icon: (
        <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Infinite canvas with smooth navigation',
      description: 'Pan, zoom, and expand without limits.',
      accent: 'from-blue-400 to-blue-600',
      icon: (
        <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
        </svg>
      ),
    },
    {
      title: 'Persistent boards with auto-save',
      description: 'Every stroke, state, and comment is saved for you.',
      accent: 'from-emerald-400 to-emerald-600',
      icon: (
        <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
  ];

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
      <div className="hero-blob left-[-4rem] top-[2rem] h-48 w-48 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-56 w-56 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-52 w-52 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-center gap-8">
        <div className="hidden max-w-xs lg:block">
          <p className="mb-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-700">
            Real-Time Collaboration
          </p>
          <h1 className="text-3xl font-bold leading-tight text-slate-900">
            Build together on
            {' '}
            <span className="neon-title">an infinite canvas</span>
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Create, edit, and share whiteboards in real time with your team.
          </p>
        </div>

        <div className="glass-panel w-full max-w-sm rounded-[28px] border border-white/30 bg-white/60 p-6 shadow-[0_20px_80px_-40px_rgba(2,6,23,0.55)] backdrop-blur-3xl">
          <div className="space-y-4 pb-4">
            <div>
              <h2 className="text-center text-2xl font-semibold text-slate-900">Welcome to Collabry</h2>
            </div>
            <div className="space-y-3">
              {featureHighlights.map((feature) => (
                <div key={feature.title} className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.accent} shadow-sm shadow-slate-200`}
                  >
                    {feature.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{feature.title}</p>
                    <p className="text-xs text-slate-500">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 pt-4">
            <button
              onClick={() => router.push('/signup')}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.02]"
            >
              Create Account
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
