import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/epic3-sustainability/tests/3.7-visual-sustainability-metrics.test.js',
    ],
  },
});
