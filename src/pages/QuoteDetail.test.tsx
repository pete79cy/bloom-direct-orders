import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuoteDetail as QuoteDetailData } from '@/types';

const save = vi.fn();
const detail: QuoteDetailData = {
  quote: {
    id: 'q1', quote_number: 'QT-2026-001', customer_id: 'c1', status: 'DRAFT', currency: 'EUR',
    issue_date: '2026-10-01', valid_until: '2099-01-01', notes: '', terms: '',
    revision_of_quote_id: null, revision_no: 0, created_at: '2026-10-01', updated_at: '2026-10-01',
  },
  lines: [{
    id: 'l1', quote_id: 'q1', line_no: 1, offered_variant_id: 'v1', qty: 2, unit_sell_price: 10,
    discount_pct: 0, vat_rate: 19, description_override: '',
    display: { plant_common_name: 'Λεβάντα' } as never,
  }],
  customer: null, statusHistory: [], linkedOrder: null, isLatestRevision: true,
};

vi.mock('@/lib/queries', () => ({
  useQuote: () => ({ data: detail, isLoading: false, error: null }),
  useCustomerPrices: () => ({ data: [] }),
  useVariants: () => ({ data: [] }),
  usePlants: () => ({ data: [] }),
}));
vi.mock('@/hooks/useQuoteSaver', () => ({
  useQuoteSaver: () => ({ save, sheet: null, isSaving: false }),
}));

import QuoteDetail from './QuoteDetail';

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/quotes/q1']}>
      <Routes><Route path="/quotes/:id" element={<QuoteDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('QuoteDetail', () => {
  it('opens the present view', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Προβολή συνόλου' }));
    expect(screen.getAllByText('QT-2026-001').length).toBeGreaterThan(1);
  });

  it('edits a line price and saves all lines', async () => {
    save.mockResolvedValue({ ok: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Επεξεργασία γραμμών' }));
    fireEvent.change(screen.getByLabelText('Τιμή'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Αποθήκευση αλλαγών' }));
    expect(save).toHaveBeenCalledTimes(1);
    const payload = save.mock.calls[0][0];
    expect(payload.audit.action).toBe('PWA_EDIT_LINES');
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({ id: 'l1', qty: 2, unit_sell_price: 12.5 });
  });
});
