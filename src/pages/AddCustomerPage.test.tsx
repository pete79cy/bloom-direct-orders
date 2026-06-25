import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddCustomerPage from './AddCustomerPage';

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <AddCustomerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AddCustomerPage', () => {
  it('pre-fills trading name, phone, and email from query params', () => {
    renderAt('/customers/new?name=Foo%20Gardens&phone=99123456&email=foo%40bar.gr');
    expect((screen.getByDisplayValue('Foo Gardens') as HTMLInputElement)).toBeTruthy();
    expect((screen.getByDisplayValue('99123456') as HTMLInputElement)).toBeTruthy();
    expect((screen.getByDisplayValue('foo@bar.gr') as HTMLInputElement)).toBeTruthy();
  });

  it('defaults payment terms to 0 and opens with empty fields when no params', () => {
    renderAt('/customers/new');
    // Payment-terms field seeded to "0"
    expect((screen.getByDisplayValue('0') as HTMLInputElement)).toBeTruthy();
    // Save button is disabled until a trading name is entered
    const saveBtn = screen.getByRole('button', { name: /Αποθήκευση πελάτη/i }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});
