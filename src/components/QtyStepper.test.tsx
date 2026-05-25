import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QtyStepper from './QtyStepper';

describe('QtyStepper', () => {
  it('renders the value in the input', () => {
    render(<QtyStepper value={5} onChange={() => {}} />);
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
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

  it('commits a typed value on blur', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={1} min={1} onChange={onChange} />);
    const input = screen.getByLabelText('Ποσότητα') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard('150');
    input.blur();
    expect(onChange).toHaveBeenCalledWith(150);
  });

  it('commits on Enter', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={1} min={1} onChange={onChange} />);
    const input = screen.getByLabelText('Ποσότητα') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard('42{Enter}');
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('strips non-digit characters', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={1} min={1} onChange={onChange} />);
    const input = screen.getByLabelText('Ποσότητα') as HTMLInputElement;
    await userEvent.click(input);
    // Type a value with letters and punctuation mixed in
    await userEvent.keyboard('a1b2c3');
    input.blur();
    expect(onChange).toHaveBeenCalledWith(123);
  });

  it('clamps a typed value below min', async () => {
    const onChange = vi.fn();
    render(<QtyStepper value={5} min={1} onChange={onChange} />);
    const input = screen.getByLabelText('Ποσότητα') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.keyboard('0');
    input.blur();
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
