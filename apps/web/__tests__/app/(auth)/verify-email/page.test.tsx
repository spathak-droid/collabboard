/**
 * Tests for the Email Verification page
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VerifyEmailPage from '@/app/(auth)/verify-email/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock firebase auth functions
const mockResendVerificationEmail = vi.fn();
const mockSignOut = vi.fn();
vi.mock('@/lib/firebase/auth', () => ({
  resendVerificationEmail: () => mockResendVerificationEmail(),
  signOut: () => mockSignOut(),
}));

// Mock firebase config
vi.mock('@/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({
    currentUser: { reload: vi.fn(), emailVerified: false },
  }),
}));

// Mock BrandLogo
vi.mock('@/components/brand/BrandLogo', () => ({
  BrandLogo: () => <div data-testid="brand-logo">Logo</div>,
}));

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResendVerificationEmail.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
  });

  it('shows loading spinner when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<VerifyEmailPage />);
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument();
  });

  it('redirects to /login when no user is signed in', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<VerifyEmailPage />);
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('redirects to /dashboard when user is already verified', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: true, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows verification UI for unverified user', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    expect(screen.getByText('Verify your email')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
    expect(screen.getByText('Resend verification email')).toBeInTheDocument();
    expect(screen.getByText('Waiting for verification...')).toBeInTheDocument();
  });

  it('shows sign out option', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    expect(screen.getByText('Sign out or use a different email')).toBeInTheDocument();
  });

  it('calls resendVerificationEmail on resend button click', async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByText('Resend verification email'));

    await waitFor(() => {
      expect(mockResendVerificationEmail).toHaveBeenCalled();
    });
  });

  it('shows success message after resending', async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByText('Resend verification email'));

    await waitFor(() => {
      expect(screen.getByText('Verification email sent! Check your inbox.')).toBeInTheDocument();
    });
  });

  it('shows error message when resend fails', async () => {
    mockResendVerificationEmail.mockRejectedValue(new Error('Something went wrong'));
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByText('Resend verification email'));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('calls signOut and redirects to login on sign out click', async () => {
    mockUseAuth.mockReturnValue({
      user: { uid: '1', email: 'test@test.com', emailVerified: false, displayName: 'Test', photoURL: null },
      loading: false,
    });
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByText('Sign out or use a different email'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
