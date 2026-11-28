import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Created: Story = {
  args: { status: 'Created' },
};

export const Funded: Story = {
  args: { status: 'Funded' },
};

export const Settled: Story = {
  args: { status: 'Settled' },
};

export const Disputed: Story = {
  args: { status: 'Disputed' },
};
