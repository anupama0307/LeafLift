import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    cacheDir: 'd:/vitest-cache',
    test: {
        globals: true,
        testTimeout: 30000,
        // No setupFiles: these tests are pure-logic, no MongoDB required
        include: ['tests/5.5-gender-pooling.test.js'],
    },
});
