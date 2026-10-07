import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries', () => ({
  useCreateProduct: () => ({ mutateAsync, isPending: false }),
  lookupBotanicalName: vi.fn(),
}));

import AddProductPage from './AddProductPage';

function renderPage() {
  render(<MemoryRouter initialEntries={['/products/new']}><AddProductPage /></MemoryRouter>);
}

describe('AddProductPage', () => {
  it('keeps save disabled until a name and pot size are given', () => {
    renderPage();
    const save = screen.getByRole('button', { name: /Αποθήκευση προϊόντος/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('π.χ. Λεβάντα'), { target: { value: 'Λεβάντα' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '5L' }));
    expect(save.disabled).toBe(false);
  });

  it('saves plant then variant and offers to start an order', async () => {
    mutateAsync.mockResolvedValue({ plant: { id: 'p1' }, variant: { id: 'v1' } });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('π.χ. Λεβάντα'), { target: { value: 'Λεβάντα' } });
    fireEvent.change(screen.getByPlaceholderText('π.χ. Lavandula angustifolia'), { target: { value: 'Lavandula angustifolia' } });
    fireEvent.click(screen.getByRole('button', { name: '5L' }));
    fireEvent.click(screen.getByRole('button', { name: /Αποθήκευση προϊόντος/ }));
    await waitFor(() => expect(screen.getByText('Νέα παραγγελία με αυτό')).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledWith({
      plant: expect.objectContaining({ scientific_name: 'Lavandula angustifolia', common_name: 'Λεβάντα', product_kind: 'plant' }),
      variant: expect.objectContaining({ variant_code: 'LAVANDULA-ANGUSTIFOLIA__SHRUB__OTHER__P5L__H1-1' }),
    });
  });

  it('a pot needs only a name', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Γλάστρα' }));
    fireEvent.change(screen.getByPlaceholderText('π.χ. Γλάστρα τερακότα 30'), { target: { value: 'Τερακότα 30' } });
    expect((screen.getByRole('button', { name: /Αποθήκευση προϊόντος/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
