import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the UPIME workflow', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeDefined();
  expect(screen.getAllByText(/UPIME/i).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/Gemini API key/i)).toBeDefined();
  expect(screen.getByRole('button', { name: /Suggest related courses/i })).toBeDefined();
  expect(screen.getByText(/Scraped public university data/i)).toBeDefined();
});
