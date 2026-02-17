/**
 * Tests for InviteModal component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteModal } from './InviteModal';

// Mock supabase client
vi.mock('@/lib/supabase/client', () => ({
  createBoardInvite: vi.fn().mockResolvedValue({
    id: 'inv-1',
    board_id: 'board-1',
    invited_email: 'test@example.com',
    invited_by: 'user-1',
    role: 'editor',
    token: 'test-token-123',
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }),
}));

// Mock fetch for API route
global.fetch = vi.fn().mockResolvedValue({ ok: true });

const defaultProps = {
  open: true,
  boardId: 'board-1',
  boardTitle: 'Test Board',
  inviterName: 'John Doe',
  inviterUid: 'user-1',
  onClose: vi.fn(),
};

describe('InviteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<InviteModal {...defaultProps} open={false} />);
    expect(screen.queryByText(/Invite to/)).not.toBeInTheDocument();
  });

  it('renders with board title', () => {
    render(<InviteModal {...defaultProps} />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.textContent).toContain('Test Board');
    expect(heading.textContent).toContain('Invite to');
  });

  it('shows email input and role selector', () => {
    render(<InviteModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('colleague@example.com')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows send button disabled when email is empty', () => {
    render(<InviteModal {...defaultProps} />);
    const sendBtn = screen.getByText('Send');
    expect(sendBtn).toBeDisabled();
  });

  it('enables send button with valid email', () => {
    render(<InviteModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('colleague@example.com');
    fireEvent.change(input, { target: { value: 'valid@email.com' } });
    const sendBtn = screen.getByText('Send');
    expect(sendBtn).not.toBeDisabled();
  });

  it('shows email validation error on blur with invalid email', () => {
    render(<InviteModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('colleague@example.com');
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.blur(input);
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('sends invite on button click', async () => {
    render(<InviteModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('colleague@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  it('sends invite on Enter key', async () => {
    render(<InviteModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('colleague@example.com');
    fireEvent.change(input, { target: { value: 'enter@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('enter@example.com')).toBeInTheDocument();
    });
  });

  it('calls onClose when Done is clicked', () => {
    render(<InviteModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Done'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', () => {
    render(<InviteModal {...defaultProps} />);
    const closeButtons = screen.getAllByRole('button');
    // The X button is the first button in the header
    const xButton = closeButtons.find((btn) => btn.querySelector('svg path[d*="M6 18L18 6"]'));
    if (xButton) fireEvent.click(xButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('has editor and viewer role options', () => {
    render(<InviteModal {...defaultProps} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Editor');
    expect(options[1]).toHaveTextContent('Viewer');
  });
});
