import inputSettings from './settings/settings.ts';

const settings: Settings = {
  ...inputSettings,
  ownerGroups: Object.entries(inputSettings.ownerGroups).reduce(
    (prev: Settings['ownerGroups'], [groupId, ownerGroup]) => {
      prev[groupId] = { ...ownerGroup, groupId };
      return prev;
    },
    {},
  ),
};

export default settings;

type OwnerGroupById = {
  groupId: string;
  ownerId: number;
  label: string;
  color: [number, number, number];
};

type DefaultOwnerGroup = {
  groupId: string;
  label: string;
  color: [number, number, number];
};

export type OwnerGroup = OwnerGroupById | DefaultOwnerGroup;

type OwnerGroups = {
  [groupId: string]:
    | Omit<OwnerGroupById, 'groupId'>
    | Omit<DefaultOwnerGroup, 'groupId'>;
} & {
  default: Omit<DefaultOwnerGroup, 'groupId'>;
};

export type InputSettings = {
  parcelRestUrlTemplate: string | null;
  parcelInfoUrlTemplate: string | null;
  titleDeedInfoUrlTemplate: string | null;
  ownerInfoUrlTemplate: string | null;
  publicUrl: string;
  ownerGroups: OwnerGroups;
};

type Settings = Omit<InputSettings, 'ownerGroups'> & {
  ownerGroups: { [groupId: string]: OwnerGroup };
};
