/**
 * Invite Accept Page — /invite/[token]
 *
 * When a user clicks the invite link from their email:
 * 1. If not logged in → redirect to signup with a return URL
 * 2. If logged in → accept the invite and redirect to the board
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { fetchInviteByToken, acceptBoardInvite, ensureUser } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/brand/BrandLogo';

type InviteState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'preview'; boardTitle: string; inviterName: string; role: string }
  | { status: 'accepting' }
  | { status: 'accepted'; boardId: string }
  | { status: 'error'; message: string };

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const token = params.token as string;

  const [state, setState] = useState<InviteState>({ status: 'loading' });

  // Fetch invite details
  useEffect(() => {
    if (!token) return;

    const loadInvite = async () => {
      const invite = await fetchInviteByToken(token);
      if (!invite) {
        setState({ status: 'not_found' });
        return;
      }

      if (new Date(invite.expires_at) < new Date()) {
        setState({ status: 'expired' });
        return;
      }

      setState({
        status: 'preview',
        boardTitle: invite.board_title,
        inviterName: invite.inviter_name ?? 'Someone',
        role: invite.role,
      });
    };

    loadInvite();
  }, [token]);

  // If not logged in and invite loaded, redirect to signup with return URL
  useEffect(() => {
    if (!authLoading && !user && state.status === 'preview') {
      const returnUrl = encodeURIComponent(`/invite/${token}`);
      router.push(`/signup?returnUrl=${returnUrl}`);
    }
  }, [authLoading, user, state.status, token, router]);

  const handleAccept = useCallback(async () => {
    if (!user) return;

    setState({ status: 'accepting' });

    try {
      // Ensure user exists in Supabase
      await ensureUser(user);

      const result = await acceptBoardInvite(token, user.uid);
      if (!result) {
        setState({ status: 'error', message: 'This invite is no longer valid.' });
        return;
      }

      setState({ status: 'accepted', boardId: result.boardId });

      // Redirect to the board after a brief delay
      setTimeout(() => {
        router.push(`/board/${result.boardId}`);
      }, 1500);
    } catch {
      setState({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
  }, [user, token, router]);

  // Auto-accept if user is logged in and invite is valid
  useEffect(() => {
    if (user && state.status === 'preview') {
      handleAccept();
    }
  }, [user, state.status, handleAccept]);

  return (
    <div className="hero-bg relative flex min-h-screen items-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-5">
        <BrandLogo size="xl" showText={false} logoClassName="h-24 w-auto drop-shadow-none" />
      </div>
      <div className="hero-blob left-[-4rem] top-[2rem] h-64 w-64 bg-cyan-300/50" />
      <div className="hero-blob right-[-5rem] top-[8rem] h-80 w-80 bg-blue-300/45" />
      <div className="hero-blob bottom-[-6rem] left-[40%] h-72 w-72 bg-emerald-300/40" />

      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="glass-panel rounded-3xl p-8 text-center shadow-[0_28px_80px_-40px_rgba(0,61,130,0.55)]">
          {/* Loading */}
          {(state.status === 'loading' || authLoading) && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-blue-100">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Loading invitation...</h2>
            </>
          )}

          {/* Not found */}
          {state.status === 'not_found' && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-red-100">
                <svg className="h-8 w-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Invitation not found</h2>
              <p className="mb-6 text-sm text-slate-500">
                This invite link is invalid or has already been used.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-cyan-200"
              >
                Go to Login
              </button>
            </>
          )}

          {/* Expired */}
          {state.status === 'expired' && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
                <svg className="h-8 w-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Invitation expired</h2>
              <p className="mb-6 text-sm text-slate-500">
                This invite link has expired. Ask the board owner to send a new one.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-cyan-200"
              >
                Go to Login
              </button>
            </>
          )}

          {/* Preview (shown briefly before auto-accept or redirect to signup) */}
          {state.status === 'preview' && !authLoading && user && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-blue-100">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Joining board...</h2>
            </>
          )}

          {/* Accepting */}
          {state.status === 'accepting' && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 to-blue-100">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Accepting invitation...</h2>
              <p className="text-sm text-slate-500">Setting up your access...</p>
            </>
          )}

          {/* Accepted */}
          {state.status === 'accepted' && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-green-100">
                <svg className="h-8 w-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">You&apos;re in!</h2>
              <p className="text-sm text-slate-500">Redirecting you to the board...</p>
            </>
          )}

          {/* Error */}
          {state.status === 'error' && (
            <>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-red-100">
                <svg className="h-8 w-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="mb-2 text-xl font-bold text-slate-900">Something went wrong</h2>
              <p className="mb-6 text-sm text-slate-500">{state.message}</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-cyan-200"
              >
                Go to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
