import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.venv/**',
      'tools/**',
      'courses/**',
      '.superpowers/**',
      'apps/app/public/**',
      '**/*.config.js',
      'apps/app/expo-env.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
);
