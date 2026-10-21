import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import LeaveReviewScreen from '../LeaveReviewScreen';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

describe('LeaveReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders review form', () => {
    render(<LeaveReviewScreen />);
    expect(screen.getByText('Leave a Review')).toBeTruthy();
  });

  it('shows rating stars', () => {
    render(<LeaveReviewScreen />);
    
    expect(screen.getByTestId('star-button-1')).toBeTruthy();
    expect(screen.getByTestId('star-button-2')).toBeTruthy();
    expect(screen.getByTestId('star-button-3')).toBeTruthy();
    expect(screen.getByTestId('star-button-4')).toBeTruthy();
    expect(screen.getByTestId('star-button-5')).toBeTruthy();
  });

  it('has title and comment input fields', () => {
    render(<LeaveReviewScreen />);
    
    expect(screen.getByTestId('review-title-input')).toBeTruthy();
    expect(screen.getByTestId('review-comment-input')).toBeTruthy();
  });

  it('validates rating is required', async () => {
    render(<LeaveReviewScreen />);
    
    // Try to submit without rating
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please select a rating')).toBeTruthy();
    });
  });

  it('validates title is required', async () => {
    render(<LeaveReviewScreen />);
    
    // Set a rating but no title
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a review title')).toBeTruthy();
    });
  });

  it('validates comment is required', async () => {
    render(<LeaveReviewScreen />);
    
    // Set rating and title but no comment
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    const titleInput = screen.getByTestId('review-title-input');
    fireEvent.changeText(titleInput, 'Great trade');
    
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter your review comment')).toBeTruthy();
    });
  });

  it('shows rating label when star is selected', async () => {
    render(<LeaveReviewScreen />);
    
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    await waitFor(() => {
      expect(screen.getByText('Excellent')).toBeTruthy();
    });
  });

  it('submits review successfully', async () => {
    render(<LeaveReviewScreen />);
    
    // Fill in the form
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    const titleInput = screen.getByTestId('review-title-input');
    fireEvent.changeText(titleInput, 'Great experience');
    
    const commentInput = screen.getByTestId('review-comment-input');
    fireEvent.changeText(commentInput, 'The trade was completed smoothly and the product quality was excellent.');
    
    // Submit
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Review Submitted!')).toBeTruthy();
    });
  });

  it('shows success state with done button', async () => {
    render(<LeaveReviewScreen />);
    
    // Fill and submit the form
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    const titleInput = screen.getByTestId('review-title-input');
    fireEvent.changeText(titleInput, 'Great experience');
    
    const commentInput = screen.getByTestId('review-comment-input');
    fireEvent.changeText(commentInput, 'The trade was completed smoothly and the product quality was excellent.');
    
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('done-button')).toBeTruthy();
    });
  });

  it('validates minimum comment length', async () => {
    render(<LeaveReviewScreen />);
    
    // Set rating and short comment
    const star5 = screen.getByTestId('star-button-5');
    fireEvent.press(star5);
    
    const titleInput = screen.getByTestId('review-title-input');
    fireEvent.changeText(titleInput, 'Good trade');
    
    const commentInput = screen.getByTestId('review-comment-input');
    fireEvent.changeText(commentInput, 'Short');
    
    const submitButton = screen.getByTestId('submit-review-button');
    fireEvent.press(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Comment must be at least 10 characters')).toBeTruthy();
    });
  });

  it('shows character count for comment', () => {
    render(<LeaveReviewScreen />);
    
    expect(screen.getByText('0/500')).toBeTruthy();
    
    const commentInput = screen.getByTestId('review-comment-input');
    fireEvent.changeText(commentInput, 'Hello');
    
    expect(screen.getByText('5/500')).toBeTruthy();
  });
});