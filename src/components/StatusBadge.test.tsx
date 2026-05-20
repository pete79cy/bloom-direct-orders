import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders PENDING with the Greek label', () => {
    render(<StatusBadge status="PENDING" />);
    expect(screen.getByText('Εκκρεμής')).toBeInTheDocument();
  });

  it('renders DELIVERED with green styling', () => {
    const { container } = render(<StatusBadge status="DELIVERED" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toMatch(/green/);
  });
});
