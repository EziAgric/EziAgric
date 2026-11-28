import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import StatusBadge from './StatusBadge';

expect.extend(toHaveNoViolations);

describe('StatusBadge', () => {
  it('renders the status label', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<StatusBadge status="completed" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
