import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import postcssMantine from 'postcss-preset-mantine';
import postcssSimpleVars from 'postcss-simple-vars';

export default defineConfig({
  plugins: [pluginReact()],
  tools: {
    postcss: (_opts, { addPlugins }) => {
      addPlugins([
        postcssMantine,
        postcssSimpleVars({
          variables: {
            'mantine-breakpoint-xs': '36em',
            'mantine-breakpoint-sm': '48em',
            'mantine-breakpoint-md': '62em',
            'mantine-breakpoint-lg': '75em',
            'mantine-breakpoint-xl': '88em',
          },
        }),
      ]);
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
