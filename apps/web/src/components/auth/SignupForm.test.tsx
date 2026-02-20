/**
 * Test cases for SignupForm component (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from './SignupForm';
import * as auth from '@/lib/firebase/auth';

// Mock Next.js router
const mockPush = vi.fn();
const mockGet = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

// Mock Firebase auth
vi.mock('@/lib/firebase/auth', () => ({
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithGithub: vi.fn(),
}));

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders signup form with all fields', () => {
    render(<SignupForm />);
    
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    
    const submitButton = screen.getByRole('button', { name: /^sign up$/i });
    expect(submitButton).toBeInTheDocument();
  });
  
  it('handles signup successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signUp).mockResolvedValue({} as any);
    
    render(<SignupForm />);
    
    await user.type(screen.getByLabelText(/display name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    
    const submitButton = screen.getByRole('button', { name: /^sign up$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(auth.signUp).toHaveBeenCalledWith('john@example.com', 'password123', 'John Doe');
      expect(mockPush).toHaveBeenCalledWith('/verify-email');
    });
  });
  
  it('validates password length', async () => {
    const user = userEvent.setup();
    
    render(<SignupForm />);
    
    await user.type(screen.getByLabelText(/display name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText('Password'), '12345');
    await user.type(screen.getByLabelText('Confirm Password'), '12345');
    
    const submitButton = screen.getByRole('button', { name: /^sign up$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 6 characters/i);
      expect(auth.signUp).not.toHaveBeenCalled();
    });
  });
  
  it('displays error message on signup failure', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.signUp).mockRejectedValue(new Error('Email already in use'));
    
    render(<SignupForm />);
    
    await user.type(screen.getByLabelText(/display name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    
    const submitButton = screen.getByRole('button', { name: /^sign up$/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/email already in use/i);
    });
  });
  
  it('shows password requirement hint', () => {
    render(<SignupForm />);
    
    expect(screen.getByText(/minimum 6 characters/i)).toBeInTheDocument();
  });
});
