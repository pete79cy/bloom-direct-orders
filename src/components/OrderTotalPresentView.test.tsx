import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderTotalPresentView, { type PresentLine } from './OrderTotalPresentView';

const lines: PresentLine[] = Array.from({ length: 12 }, (_, i) => ({
  id: `l${i}`,
  description: `Plant ${i}`,
  qty: 2,
  unitPrice: 5,
  lineTotal: 10,
}));

function renderView() {
  return render(
    <OrderTotalPresentView
      open
      onClose={() => {}}
      orderNumber="ORD-2026-001"
      customerName="Test"
      lines={lines}
      subtotal={120}
      vatBreakdown={[{ rate: 19, net: 120, amount: 22.8 }]}
      grandTotal={142.8}
      formatEur={(n) => `${n.toFixed(2)} €`}
    />,
  );
}

/** jsdom does no layout — scrollHeight/clientHeight are always 0, so the
 *  component's mount-time measurement sees "everything fits". Stub the
 *  dimensions on the scroll container, then fire a scroll event to make
 *  the component re-measure. */
function stubScrollMetrics(el: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('OrderTotalPresentView scroll affordance', () => {
  it('shows the more-products pill while content extends below the fold', () => {
    renderView();
    const el = screen.getByTestId('present-lines-scroll');
    stubScrollMetrics(el, { scrollHeight: 900, clientHeight: 400 });
    fireEvent.scroll(el);
    expect(screen.getByText('Κι άλλα προϊόντα')).toBeInTheDocument();
  });

  it('hides the pill once scrolled to the bottom', () => {
    renderView();
    const el = screen.getByTestId('present-lines-scroll');
    stubScrollMetrics(el, { scrollHeight: 900, clientHeight: 400 });
    fireEvent.scroll(el);
    expect(screen.getByText('Κι άλλα προϊόντα')).toBeInTheDocument();

    el.scrollTop = 500; // 900 - 500 - 400 = 0 → bottomed out
    fireEvent.scroll(el);
    expect(screen.queryByText('Κι άλλα προϊόντα')).not.toBeInTheDocument();
  });

  it('does not show the pill when everything fits', () => {
    renderView();
    const el = screen.getByTestId('present-lines-scroll');
    stubScrollMetrics(el, { scrollHeight: 400, clientHeight: 400 });
    fireEvent.scroll(el);
    expect(screen.queryByText('Κι άλλα προϊόντα')).not.toBeInTheDocument();
  });
});
