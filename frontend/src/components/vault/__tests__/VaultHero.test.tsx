import React from 'react';
import { render, screen } from '@testing-library/react';
import { VaultHero } from '../VaultHero';

describe('VaultHero Component', () => {
    const defaultProps = {
        escrowId: '8492-AX',
        custodyType: 'Institutional Custody',
        status: 'Funds Locked',
        isSecured: true,
    };

    it('renders without crashing with all props', () => {
        const { container } = render(<VaultHero {...defaultProps} />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('displays the vault system active label', () => {
        render(<VaultHero {...defaultProps} />);
        expect(screen.getByText('Vault System Active')).toBeInTheDocument();
    });

    it('displays the escrow ID correctly', () => {
        render(<VaultHero {...defaultProps} />);
        expect(screen.getByText('Escrow #8492-AX')).toBeInTheDocument();
    });

    it('displays the custody type', () => {
        render(<VaultHero {...defaultProps} />);
        expect(screen.getByText('Institutional Custody')).toBeInTheDocument();
    });

    it('displays the vault status label', () => {
        render(<VaultHero {...defaultProps} />);
        expect(screen.getByText('Vault Status')).toBeInTheDocument();
    });

    it('displays the status value', () => {
        render(<VaultHero {...defaultProps} />);
        expect(screen.getByText('Funds Locked')).toBeInTheDocument();
    });

    it('displays "Secured On-Chain" when isSecured is true', () => {
        render(<VaultHero {...defaultProps} isSecured={true} />);
        expect(screen.getByText('Secured On-Chain')).toBeInTheDocument();
    });

    it('does not display "Secured On-Chain" when isSecured is false', () => {
        render(<VaultHero {...defaultProps} isSecured={false} />);
        expect(screen.queryByText('Secured On-Chain')).not.toBeInTheDocument();
    });

    it('renders the shield icon', () => {
        const { container } = render(<VaultHero {...defaultProps} />);
        const shieldIcon = container.querySelector('svg');
        expect(shieldIcon).toBeInTheDocument();
    });

    it('renders the check icon when isSecured is true', () => {
        const { container } = render(<VaultHero {...defaultProps} isSecured={true} />);
        const checkIcon = container.querySelector('svg');
        expect(checkIcon).toBeInTheDocument();
    });

    it('applies responsive layout classes', () => {
        const { container } = render(<VaultHero {...defaultProps} />);
        const header = container.firstChild as HTMLElement;
        expect(header).toHaveClass('flex', 'flex-col', 'lg:flex-row');
    });

    it('handles different escrow IDs', () => {
        render(<VaultHero {...defaultProps} escrowId="1234-XY" />);
        expect(screen.getByText('Escrow #1234-XY')).toBeInTheDocument();
    });

    it('handles different custody types', () => {
        render(<VaultHero {...defaultProps} custodyType="Self-Custody" />);
        expect(screen.getByText('Self-Custody')).toBeInTheDocument();
    });

    it('handles different status values', () => {
        render(<VaultHero {...defaultProps} status="Funds Released" />);
        expect(screen.getByText('Funds Released')).toBeInTheDocument();
    });
});
