import type { OwnerType } from './server/vfk';
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

type OwnerGroupAllMatches = {
  groupId: string;
  groupType: 'AllMatches';
  ownerTypesAnyOf: Partial<OwnerType>[];
  label: string;
  color: [number, number, number];
};

type OwnerGroupAllWithinIcos = {
  groupId: string;
  groupType: 'AllWithinIcos';
  ownerIcosAnyOf: [number, ...number[]]; // at least one ico must be provided
  ownerIcosAllowed: number[];
  label: string;
  color: [number, number, number];
};

type OwnerGroupAnyWithinIcos = {
  groupId: string;
  groupType: 'AnyWithinIcos';
  ownerIcosAnyOf: [number, ...number[]]; // at least one ico must be provided
  label: string;
  color: [number, number, number];
};

type DefaultOwnerGroup = {
  groupType: 'Default';
  groupId: string;
  label: string;
  color: [number, number, number];
};

export type OwnerGroup =
  | OwnerGroupAllMatches
  | OwnerGroupAllWithinIcos
  | OwnerGroupAnyWithinIcos
  | DefaultOwnerGroup;

type OwnerGroups = {
  [groupId: string]:
    | Omit<DefaultOwnerGroup, 'groupId'>
    | Omit<OwnerGroupAllMatches, 'groupId'>
    | Omit<OwnerGroupAllWithinIcos, 'groupId'>
    | Omit<OwnerGroupAnyWithinIcos, 'groupId'>;
} & {
  default: Omit<DefaultOwnerGroup, 'groupId'>;
};

export type InputSettings = {
  parcelRestUrlTemplate: string | null;
  ownerTypeRestUrlTemplate: string | null;
  parcelInfoUrlTemplate: string | null;
  titleDeedInfoUrlTemplate: string | null;
  ownerInfoUrlTemplate: string | null;
  publicUrl: string;
  ownerGroups: OwnerGroups;
};

type Settings = Omit<InputSettings, 'ownerGroups'> & {
  ownerGroups: { [groupId: string]: OwnerGroup };
};
