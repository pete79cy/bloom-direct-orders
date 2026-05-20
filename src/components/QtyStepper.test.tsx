import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QtyStepper from './QtyStepper';

describe('QtyStepper', () => {
  it('renders the value', () => {
    render(<QtyStepper value={5} onChange={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('calls onChange with value+1 when + tapped', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={3} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Αύξηση'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('calls onChange with value-1 when − tapped', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={3} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Μείωση'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('does not go below the min', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={1} min={1} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Μείωση'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
