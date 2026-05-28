import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeTextLineSheet from './FreeTextLineSheet';

describe('FreeTextLineSheet', () => {
  it('renders nothing when open=false', () => {
    render(
      <FreeTextLineSheet open={false} initialName="" onClose={() => {}} onAdd={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pre-fills the name input from initialName', () => {
    render(
      <FreeTextLineSheet
        open={true}
        initialName="Ficus benjamina"
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const nameInput = screen.getByLabelText(/Όνομα φυτού/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Ficus benjamina');
  });

  it('disables commit when name has fewer than 2 chars', () => {
    render(
      <FreeTextLineSheet
        open={true}
        initialName="F"
        onClose={() => {}}
        onAdd={() => {}}
      />,
    );
    const commit = screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i });
    expect(commit).toBeDisabled();
  });

  it('calls onAdd with name+size+qty+unit_price+vat_rate+description on commit', () => {
    const onAdd = vi.fn();
    render(
      <FreeTextLineSheet
        open={true}
        initialName="Ficus benjamina"
        onClose={() => {}}
        onAdd={onAdd}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Μέγεθος/i), { target: { value: 'P 5L' } });
    // PriceInput maintains internal text state; we set value via change + blur to commit.
    const priceInput = screen.getByLabelText(/Τιμή πώλησης/i);
    fireEvent.change(priceInput, { target: { value: '8.50' } });
    fireEvent.blur(priceInput);
    // QtyStepper: click + twice → qty becomes 3
    fireEvent.click(screen.getByLabelText('Αύξηση'));
    fireEvent.click(screen.getByLabelText('Αύξηση'));
    fireEvent.click(screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }));
    expect(onAdd).toHaveBeenCalledWith({
      name: 'Ficus benjamina',
      size: 'P 5L',
      qty: 3,
      unit_price: 8.5,
      vat_rate: 19,
      description: '',
    });
  });

  it('trims whitespace from name and size on commit', () => {
    const onAdd = vi.fn();
    render(
      <FreeTextLineSheet open={true} initialName="  Hello  " onClose={() => {}} onAdd={onAdd} />,
    );
    fireEvent.change(screen.getByLabelText(/Μέγεθος/i), { target: { value: '  P 5L  ' } });
    const priceInput = screen.getByLabelText(/Τιμή πώλησης/i);
    fireEvent.change(priceInput, { target: { value: '1.00' } });
    fireEvent.blur(priceInput);
    fireEvent.click(screen.getByRole('button', { name: /Προσθήκη στην παραγγελία/i }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Hello', size: 'P 5L' }),
    );
  });

  it('calls onClose when the close button is tapped', () => {
    const onClose = vi.fn();
    render(
      <FreeTextLineSheet open={true} initialName="Foo" onClose={onClose} onAdd={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText(/Κλείσιμο/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
