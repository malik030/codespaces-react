import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the UPIME search experience', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', {
      name: /find public sector university courses from one degree idea/i,
    }),
  ).toBeDefined();
  expect(screen.getByRole('button', { name: /scrape university data/i })).toBeDefined();
});
