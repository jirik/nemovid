import type { Settings } from './settings.ts';

export default {
  parcelRestUrlTemplate: null,
  parcelInfoUrlTemplate: null,
  titleDeedInfoUrlTemplate: null,
  ownerInfoUrlTemplate: null,
  publicUrl: import.meta.env.PUBLIC_PUBLIC_URL,
} satisfies Settings;
