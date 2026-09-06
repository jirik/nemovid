import type {ProxyOptions} from 'vite'

export type ViteConfigSettings = {
  proxy: Record<string, string | ProxyOptions>;
};