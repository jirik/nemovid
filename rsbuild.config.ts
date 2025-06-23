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
      '/api/files': 'http://localhost:8000',
      '/api/ogr2ogr': 'http://localhost:8001',
      '/api/qgis': 'http://localhost:8002',
      '/static/files': 'http://localhost:8000',
    },
  },
});
