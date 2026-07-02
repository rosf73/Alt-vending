import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['domain/**/*.ts'],
      thresholds: {
        // §10.3: domain 라인 커버리지 ≥ 90%
        lines: 90,
      },
    },
  },
});
