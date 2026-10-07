import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutateAsync = vi.fn();
const createVariant = vi.fn();
vi.mock('@/lib/queries', () => ({
  useCreateProduct: () => ({ mutateAsync, isPending: false }),
  useCreateVariant: () => ({ mutateAsync: createVariant, isPending: false }),
  usePlants: () => ({ data: [{ id: 'p-olea', scientific_name: 'Olea europaea', common_name: 'Ελιά', product_kind: 'plant' }] }),
  useVariants: () => ({ data: [{ id: 'v1', plant_id: 'p-olea', variant_code: 'OLEA-EUROPAEA__TREE__OTHER__P35L__H150-175', plant_type: 'TREE', form: 'OTHER', size_summary: null, default_sell_price: null, pot_volume_l: 35, height_min_cm: 150, height_max_cm: 175 }] }),
  useSuppliers: () => ({ data: [{ id: 's-sol', name: 'Φυτώρια Σολομού' }, { id: 's-ita', name: 'Vivai Italia' }] }),
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
    mutateAsync.mockResolvedValue({ plant: { id: 'p1' }, variant: { id: 'v1' }, supplierLinked: true });
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('π.χ. Λεβάντα'), { target: { value: 'Λεβάντα' } });
    fireEvent.change(screen.getByPlaceholderText('π.χ. Lavandula angustifolia'), { target: { value: 'Lavandula angustifolia' } });
    fireEvent.click(screen.getByRole('button', { name: '5L' }));
    fireEvent.click(screen.getByRole('button', { name: /Αποθήκευση προϊόντος/ }));
    await waitFor(() => expect(screen.getByText('Νέα παραγγελία με αυτό')).toBeTruthy());
    expect(mutateAsync).toHaveBeenCalledWith({
      plant: expect.objectContaining({ scientific_name: 'Lavandula angustifolia', common_name: 'Λεβάντα', product_kind: 'plant' }),
      variant: expect.objectContaining({ variant_code: 'LAVANDULA-ANGUSTIFOLIA__SHRUB__BUSH__P5L__H1-1' }),
      supplier: expect.any(Function),
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
    createVariant.mockResolvedValue({ variant: { id: 'v-new' }, supplierLinked: true });
    render(<MemoryRouter><AddProductPage mode="subproduct" /></MemoryRouter>);
    const save = screen.getByRole('button', { name: /Αποθήκευση μεγέθους/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Αναζήτηση προϊόντος'), { target: { value: 'ελι' } });
    fireEvent.click(screen.getByText('Ελιά'));
    expect(screen.getByText('P 35L · H 150–175 CM')).toBeTruthy();

    // Type/form come from the existing sizes (TREE / OTHER), so the same
    // pot + height is the exact duplicate → blocked before any request.
    fireEvent.click(screen.getByRole('button', { name: '35L' }));
    fireEvent.change(screen.getByLabelText('Ύψος από'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Ύψος έως'), { target: { value: '175' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Αυτό το μέγεθος υπάρχει ήδη.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '50L' }));
    // Supplier + cost ride along as the desktop's third/fourth call.
    fireEvent.click(screen.getByRole('button', { name: 'Vivai Italia' }));
    expect(screen.getByText('Τιμή αγοράς')).toBeTruthy();
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Και άλλο μέγεθος')).toBeTruthy());
    expect(createVariant).toHaveBeenCalledTimes(1);
    const call = createVariant.mock.calls[0][0];
    expect(call.plantId).toBe('p-olea');
    expect(call.variant).toMatchObject({ variant_code: 'OLEA-EUROPAEA__TREE__OTHER__P50L__H150-175', plant_type: 'TREE', form: 'OTHER' });
    expect(call.supplier('v-new')).toMatchObject({ product: { supplier_id: 's-ita', variant_id: 'v-new' }, price: null });
  });
});
