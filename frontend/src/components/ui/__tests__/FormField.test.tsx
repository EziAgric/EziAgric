import React from 'react';
import { render, screen } from '@testing-library/react';
import { FormField } from '../FormField';

describe('FormField Component', () => {
    const defaultProps = {
        label: 'Test Label',
        name: 'test-field',
        children: <input type="text" />,
    };

    it('renders without crashing with all props', () => {
        const { container } = render(<FormField {...defaultProps} />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('displays the label text', () => {
        render(<FormField {...defaultProps} />);
        expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('renders the child input element', () => {
        render(<FormField {...defaultProps} />);
        const input = screen.getByRole('textbox');
        expect(input).toBeInTheDocument();
    });

    it('displays required asterisk when required is true', () => {
        render(<FormField {...defaultProps} required={true} />);
        const asterisk = screen.getByText('*');
        expect(asterisk).toBeInTheDocument();
    });

    it('does not display required asterisk when required is false', () => {
        render(<FormField {...defaultProps} required={false} />);
        const asterisk = screen.queryByText('*');
        expect(asterisk).not.toBeInTheDocument();
    });

    it('displays hint text when provided', () => {
        render(<FormField {...defaultProps} hint="This is a hint" />);
        expect(screen.getByText('This is a hint')).toBeInTheDocument();
    });

    it('does not display hint text when not provided', () => {
        render(<FormField {...defaultProps} />);
        const hint = screen.queryByText('This is a hint');
        expect(hint).not.toBeInTheDocument();
    });

    it('displays error message when error is provided', () => {
        render(<FormField {...defaultProps} error="This is an error" />);
        expect(screen.getByText('This is an error')).toBeInTheDocument();
    });

    it('does not display error message when error is not provided', () => {
        render(<FormField {...defaultProps} />);
        const error = screen.queryByText('This is an error');
        expect(error).not.toBeInTheDocument();
    });

    it('does not display hint when error is present', () => {
        render(<FormField {...defaultProps} hint="This is a hint" error="This is an error" />);
        const hint = screen.queryByText('This is a hint');
        expect(hint).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<FormField {...defaultProps} className="custom-class" />);
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('custom-class');
    });

    it('applies base styling classes', () => {
        const { container } = render(<FormField {...defaultProps} />);
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('flex', 'flex-col', 'gap-1.5');
    });

    it('generates unique id for input', () => {
        render(<FormField {...defaultProps} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('id');
        const id = input.getAttribute('id');
        expect(id).toContain('test-field');
    });

    it('sets aria-invalid when error is present', () => {
        render(<FormField {...defaultProps} error="Error message" />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid when error is not present', () => {
        render(<FormField {...defaultProps} />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-invalid', 'false');
    });

    it('sets aria-describedby with error id when error is present', () => {
        render(<FormField {...defaultProps} error="Error message" />);
        const input = screen.getByRole('textbox');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toContain('error');
    });

    it('sets aria-describedby with hint id when hint is present', () => {
        render(<FormField {...defaultProps} hint="Hint message" />);
        const input = screen.getByRole('textbox');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toContain('hint');
    });

    it('sets aria-describedby with both error and hint ids when both are present', () => {
        render(<FormField {...defaultProps} hint="Hint message" error="Error message" />);
        const input = screen.getByRole('textbox');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toContain('error');
        expect(describedBy).toContain('hint');
    });

    it('renders error icon when error is present', () => {
        const { container } = render(<FormField {...defaultProps} error="Error message" />);
        const svgIcon = container.querySelector('svg');
        expect(svgIcon).toBeInTheDocument();
    });

    it('handles different input types', () => {
        render(
            <FormField label="Email" name="email">
                <input type="email" />
            </FormField>
        );
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('type', 'email');
    });

    it('handles text input type', () => {
        render(
            <FormField label="Text" name="text">
                <input type="text" />
            </FormField>
        );
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('type', 'text');
    });

    it('handles tel input type', () => {
        render(
            <FormField label="Phone" name="phone">
                <input type="tel" />
            </FormField>
        );
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('type', 'tel');
    });

    it('handles date input type', () => {
        render(
            <FormField label="Date" name="date">
                <input type="date" />
            </FormField>
        );
        const input = screen.getByLabelText('Date');
        expect(input).toHaveAttribute('type', 'date');
    });

    it('handles textarea as child', () => {
        render(
            <FormField label="Description" name="description">
                <textarea />
            </FormField>
        );
        const textarea = screen.getByRole('textbox');
        expect(textarea).toBeInTheDocument();
    });

    it('handles select as child', () => {
        render(
            <FormField label="Options" name="options">
                <select>
                    <option value="1">Option 1</option>
                    <option value="2">Option 2</option>
                </select>
            </FormField>
        );
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
    });
});
