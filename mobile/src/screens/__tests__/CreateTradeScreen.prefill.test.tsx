/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react-native';
import CreateTradeScreen, { buildInitialFormData } from '../CreateTradeScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const SELLER = 'G' + 'S'.repeat(55);
const prefill = {
  listingId: 'l1',
  commodity: 'Maize',
  quantity: '40',
  unit: 'kg',
  pricePerUnit: '450',
  sellerAddress: SELLER,
};

describe('CreateTradeScreen listing prefill', () => {
  it('buildInitialFormData returns blank defaults without a prefill', () => {
    const d = buildInitialFormData();
    expect(d).toMatchObject({ commodity: '', quantity: '', sellerAddress: '', pricePerUnit: '' });
  });

  it('buildInitialFormData applies listing fields and keeps the other defaults', () => {
    expect(buildInitialFormData(prefill)).toMatchObject({
      commodity: 'Maize',
      quantity: '40',
      unit: 'kg',
      pricePerUnit: '450',
      sellerAddress: SELLER,
      buyerRatio: 50,
      sellerRatio: 50,
      deliveryDays: '7',
    });
  });

  it('renders step 1 with the prefilled values and an enabled Continue button', () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    const { getByDisplayValue, getByText } = render(
      <CreateTradeScreen {...({ navigation, route: { params: { prefill } } } as any)} />,
    );
    expect(getByDisplayValue('40')).toBeTruthy();
    expect(getByDisplayValue('450')).toBeTruthy();
    expect(getByDisplayValue(SELLER)).toBeTruthy();
    expect(getByText('NGN 18,000')).toBeTruthy();
    const continueBtn = getByText('Continue').parent?.parent as any;
    expect(continueBtn.props.accessibilityState?.disabled ?? continueBtn.props.disabled).toBeFalsy();
  });

  it('renders blank without a prefill', () => {
    const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    const { queryByDisplayValue } = render(
      <CreateTradeScreen {...({ navigation, route: { params: undefined } } as any)} />,
    );
    expect(queryByDisplayValue('40')).toBeNull();
  });
});
