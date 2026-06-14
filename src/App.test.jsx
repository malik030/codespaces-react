import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Upime scraper workflow', () => {
  render(<App />);

  expect(screen.getAllByText(/Upime/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Scrape public sector university courses/i)).toBeDefined();
  expect(screen.getByLabelText(/Gemini API key/i)).toBeDefined();
  expect(screen.getByRole('button', { name: /Suggest related courses/i })).toBeDefined();
  expect(screen.getByRole('button', { name: /Scrape public universities/i })).toBeDefined();
});
