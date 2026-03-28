import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

it('renders label', () => {
  render(<Button>Click</Button>);
  expect(screen.getByText('Click')).toBeInTheDocument();
});
