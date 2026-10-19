import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SupplierLinkBodies } from './new-product';

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { useLinkSupplier } from './queries';

const link: SupplierLinkBodies = {
  product: { supplier_id: 's1', variant_id: 'v1', supplier_sku: '', supplier_name_text: 'x' },
  price: { cost_price: 13, currency: 'EUR' },
};

function setup(prices: Array<{ supplier_product_id: string; cost_price: number }>) {
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === '/api/supplier-products') return { id: 'sp1' };
    if (path === '/api/supplier-prices' && !init?.method) return prices;
    return {};
  });
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useLinkSupplier(), { wrapper }).result;
}

const pricePosts = () => apiFetch.mock.calls.filter(([path, init]) => path === '/api/supplier-prices' && init?.method === 'POST');

describe('useLinkSupplier (retry)', () => {
  beforeEach(() => apiFetch.mockReset());

  it('does not re-add a cost the earlier attempt already recorded', async () => {
    const result = setup([{ supplier_product_id: 'sp1', cost_price: 13 }]);
    await result.current.mutateAsync(link);
    expect(pricePosts()).toHaveLength(0);
  });

  it('records the cost when it is missing or different', async () => {
    const result = setup([{ supplier_product_id: 'sp1', cost_price: 11 }, { supplier_product_id: 'sp-other', cost_price: 13 }]);
    await result.current.mutateAsync(link);
    expect(pricePosts()).toHaveLength(1);
    expect(JSON.parse(pricePosts()[0][1].body)).toMatchObject({ supplier_product_id: 'sp1', cost_price: 13 });
  });
});
