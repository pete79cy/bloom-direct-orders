import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutateAsync = vi.fn();
const createVariant = vi.fn();
vi.mock('@/lib/queries', () => ({
  useCreateProduct: () => ({ mutateAsync, isPending: false }),
  useCreateVariant: () => ({ mutateAsync: createVariant, isPending: false }),
  usePlants: () => ({ data: [{ id: 'p-olea', scientific_name: 'Olea europaea', common_name: 'Ελιά', product_kind: 'plant' }] }),
  useVariants: () => ({ data: [{ id: 'v1', plant_id: 'p-olea', variant_code: 'OLEA-EUROPAEA__TREE__OTHER__P35L__H150-175', size_summary: null, default_sell_price: null, pot_volume_l: 35, height_min_cm: 150, height_max_cm: 175 }] }),
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
    fireEvent.change(screen.getByPlaceholderText('π.χ. Γλάστρα τερακότα'), { target: { value: 'Τερακότα 30' } });
    expect((screen.getByRole('button', { name: /Αποθήκευση προϊόντος/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('AddProductPage — subproduct', () => {
  it('picks a product, shows its sizes, refuses a duplicate and saves a new one', async () => {
    createVariant.mockResolvedValue({ id: 'v-new' });
    render(<MemoryRouter><AddProductPage mode="subproduct" /></MemoryRouter>);
    const save = screen.getByRole('button', { name: /Αποθήκευση μεγέθους/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Αναζήτηση προϊόντος'), { target: { value: 'ελι' } });
    fireEvent.click(screen.getByText('Ελιά'));
    expect(screen.getByText('P 35L · H 150–175 CM')).toBeTruthy();

    // Same size as the existing one → blocked before any request.
    fireEvent.click(screen.getByRole('button', { name: '35L' }));
    fireEvent.change(screen.getByLabelText('Ύψος από'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Ύψος έως'), { target: { value: '175' } });
    fireEvent.click(screen.getByText('Περισσότερα (τύπος φυτού)'));
    fireEvent.click(screen.getByRole('button', { name: 'Δέντρο' }));
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Αυτό το μέγεθος υπάρχει ήδη.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '50L' }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Και άλλο μέγεθος')).toBeTruthy());
    expect(createVariant).toHaveBeenCalledWith({
      plantId: 'p-olea',
      variant: expect.objectContaining({ variant_code: 'OLEA-EUROPAEA__TREE__OTHER__P50L__H150-175' }),
    });
  });
});
