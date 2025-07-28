import type { InputSettings } from './../settings.ts';

export default {
  parcelRestUrlTemplate: null,
  parcelInfoUrlTemplate: null,
  titleDeedInfoUrlTemplate: null,
  ownerInfoUrlTemplate: null,
  publicUrl: import.meta.env.PUBLIC_PUBLIC_URL,
  ownerGroups: {
    default: {
      label: 'ostatní',
      color: [255, 255, 0],
    },
  },
} satisfies InputSettings;
