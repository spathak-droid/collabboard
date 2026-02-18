import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObjectActionsPopup } from './ObjectActionsPopup';

describe('ObjectActionsPopup', () => {
  it('renders delete/duplicate/copy actions', () => {
    render(
      <ObjectActionsPopup
        x={200}
        y={100}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onCopy={vi.fn()}
      />
    );

    expect(screen.getByRole('toolbar', { name: 'Object actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('fires callbacks on delete/duplicate/copy', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const onCopy = vi.fn();

    render(
      <ObjectActionsPopup
        x={200}
        y={100}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onCopy={onCopy}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });
});
