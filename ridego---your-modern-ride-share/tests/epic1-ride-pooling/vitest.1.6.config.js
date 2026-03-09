import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        testTimeout: 10000,
        include: ['tests/epic1-ride-pooling/tests/1.6-safety-preferences.test.js'],
        // No setupFiles — 1.6 is pure logic, no DB needed
    },
});
