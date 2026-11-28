/* eslint-disable no-undef */
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useBiometrics', () => ({
  useBiometrics: jest.fn(),
}));

import { useBiometrics } from '../../hooks/useBiometrics';
import SecuritySettingsScreen from '../SecuritySettingsScreen';

const mockUseBiometrics = useBiometrics as jest.MockedFunction<
  typeof useBiometrics
>;
const setBiometricsEnabled = jest.fn();

const navigation = { goBack: jest.fn() };

function renderScreen() {
  return render(
    <SecuritySettingsScreen
      navigation={navigation as never}
      route={{} as never}
    />
  );
}

describe('SecuritySettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBiometrics.mockReturnValue({
      isAvailable: true,
      isDeviceSecure: true,
      biometricsEnabled: true,
      loading: false,
      setBiometricsEnabled,
      authenticate: jest.fn(),
    });
    setBiometricsEnabled.mockResolvedValue(undefined);
  });

  it('shows the biometric preference toggle', () => {
    const { getByTestId, getByText } = renderScreen();

    expect(getByText('Biometric authentication')).toBeTruthy();
    expect(getByTestId('biometrics-toggle').props.value).toBe(true);
  });

  it('lets the user disable biometrics', () => {
    const { getByTestId } = renderScreen();

    fireEvent(getByTestId('biometrics-toggle'), 'valueChange', false);

    expect(setBiometricsEnabled).toHaveBeenCalledWith(false);
  });

  it('disables the toggle when the device has no biometric or PIN protection', () => {
    mockUseBiometrics.mockReturnValue({
      isAvailable: false,
      isDeviceSecure: false,
      biometricsEnabled: true,
      loading: false,
      setBiometricsEnabled,
      authenticate: jest.fn(),
    });

    const { getByTestId, getByText } = renderScreen();

    expect(getByTestId('biometrics-toggle').props.disabled).toBe(true);
    expect(getByText(/no biometrics or secure screen lock/)).toBeTruthy();
  });
});
