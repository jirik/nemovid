const settingsName = import.meta.env.PUBLIC_SETTINGS_NAME;

const settings = require(`${settingsName}`).default as Settings;

console.log(
  `using settings from module ${settingsName} located at ${require.resolve(`${settingsName}`)}`,
  settings,
);

export default settings;

export type Settings = {
  parcelRestUrlTemplate: string | null;
  parcelInfoUrlTemplate: string | null;
  titleDeedInfoUrlTemplate: string | null;
  ownerInfoUrlTemplate: string | null;
  publicUrl: string;
};
