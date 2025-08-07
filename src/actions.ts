import merge from 'lodash.merge';
import type { Feature } from 'ol';
import GeoJSON from 'ol/format/GeoJSON';
import type Polygon from 'ol/geom/Polygon';
import { assertIsDefined } from './assert.ts';
import { getFilter } from './codeList.ts';
import { getParcelLabel, getParcelZoning } from './cuzk.ts';

import { type ParcelCover, ParcelHasBuildingPropName } from './olutil.ts';
import type { OwnerType, TitleDeedOwnerOverview } from './server/vfk';
import settings from './settings.ts';
import {
  type MapLayer,
  type ParcelFilters,
  type SimpleOwner,
  type SimpleParcel,
  type SimpleTitleDeed,
  type SimpleZoning,
  defaultFilters,
  getCodeLists,
  getParcelStats,
  useAppStore,
} from './store.ts';
import type { State } from './store.ts';

const set = useAppStore.getState().set;

const ownerTypeMatches = (
  ownerType: OwnerType,
  pattern: Partial<OwnerType>,
): boolean => {
  return (
    (!('owner_ico' in pattern) || pattern.owner_ico === ownerType.owner_ico) &&
    (!('type_code' in pattern) || pattern.type_code === ownerType.type_code) &&
    (!('type_group' in pattern) || pattern.type_group === ownerType.type_group)
  );
};

export const fileOpened = ({
  name,
  features,
}: { name: string; features: Feature[] | null }) =>
  set((state) => {
    state.fileName = name;
    state.constrnFeatures = features;
    state.coverFeatures = null;
    state.parcels = null;
    state.parcelFeatures = null;
    state.zonings = null;
    state.titleDeeds = null;
    state.owners = null;
    state.parcelFilters = { ...defaultFilters };
    state.parcelCoversTimestamp = null;
    state.parcelInfosTimestamp = null;
    state.processedParcels = null;
  });

export const parcelsLoaded = ({ parcels }: { parcels: Feature[] }) =>
  set((state) => {
    const parcelsDict: Record<string, SimpleParcel> = {};
    state.parcelFeatures = {};
    state.zonings = {};
    for (const parcelFeature of parcels) {
      const parcelId = parcelFeature.getId() as string;
      console.assert(typeof parcelId === 'string');

      if (!(parcelId in parcelsDict)) {
        const simpleZoning = getParcelZoning(parcelFeature);
        const zoningId = simpleZoning.id;
        assertIsDefined(zoningId);
        if (!(zoningId in state.zonings)) {
          state.zonings[zoningId] = {
            id: zoningId,
            title: simpleZoning.title,
            parcels: [],
            titleDeeds: [],
          };
        }
        const zoning = state.zonings[zoningId] as SimpleZoning;
        const landUseCode = parcelFeature.get('landUse') as string;
        const landTypeCode = parcelFeature.get('landType') as string;
        const hasBuilding = parcelFeature.get(
          ParcelHasBuildingPropName,
        ) as boolean;
        const parcel: SimpleParcel = {
          id: parcelId,
          label: getParcelLabel(parcelFeature),
          titleDeed: null,
          zoning: zoningId,
          landUse: landUseCode,
          landType: landTypeCode,
          hasBuilding,
        };

        parcelsDict[parcelId] = parcel;
        zoning.parcels.push(parcelId);
        state.parcelFeatures[parcelId] = parcelFeature;
      }
    }
    state.parcels = parcelsDict;
    const newCodeLists = getCodeLists({ ...state } as State);
    state.parcelFilters.landUse = getFilter({ codeList: newCodeLists.landUse });
    state.parcelFilters.landType = getFilter({
      codeList: newCodeLists.landType,
    });
  });

export const parcelCoverLoaded = ({
  parcelCover,
}: { parcelCover: Record<string, ParcelCover> }) =>
  set((state) => {
    assertIsDefined(state.parcelFeatures);
    const format = new GeoJSON();
    const coverFeatures: { [id: string]: Feature } = {};
    for (const [parcelId, cover] of Object.entries(parcelCover)) {
      for (const geojsonFeature of cover) {
        const coverFeature = format.readFeature(
          geojsonFeature,
        ) as Feature<Polygon>;
        const coverGeom = coverFeature.getGeometry();
        assertIsDefined(coverGeom);
        const coverArea = coverGeom.getArea();
        const coverId = Object.values(coverFeatures).length + 1;
        coverFeature.setId(coverId);
        coverFeature.setProperties({
          parcelId,
          area: coverArea,
        });
        coverFeatures[coverId] = coverFeature;
      }
    }
    state.coverFeatures = coverFeatures;
    state.parcelCoversTimestamp = Date.now();
    // @ts-ignore
    const stats = getParcelStats(state);
    assertIsDefined(stats.maxCoveredAreaM2);
    state.parcelFilters.maxCoveredAreaM2 = stats.maxCoveredAreaM2;
    state.parcelFilters.maxCoveredAreaPerc = 100;
    state.processedParcels = null;
  });

export const mapPointerMove = ({
  highlightedParcel,
}: {
  highlightedParcel?: Feature | null;
}) =>
  set((state) => {
    state.highlightedParcel = highlightedParcel
      ? (highlightedParcel.getId() as string)
      : null;
  });

export const parcelFiltersChanged = (filters: Partial<ParcelFilters>) =>
  set((state) => {
    merge(state.parcelFilters, filters);
  });

export const parcelCoverProgress = (processedParcels: number) =>
  set((state) => {
    state.processedParcels = processedParcels;
  });

export const titleDeedsLoaded = ({
  titleDeeds,
  owners,
}: {
  titleDeeds: Record<string, SimpleTitleDeed>;
  owners: Record<string, SimpleOwner>;
}) =>
  set((state) => {
    state.titleDeeds = titleDeeds;
    state.owners = owners;
    state.parcelInfosTimestamp = Date.now();
  });

export const titleDeedsOwnerTypesLoaded = ({
  ownerships,
}: {
  ownerships: TitleDeedOwnerOverview[];
}) =>
  set((state) => {
    assertIsDefined(state.titleDeeds);
    for (const ownership of ownerships) {
      const titleDeed: SimpleTitleDeed | undefined =
        state.titleDeeds[ownership.title_deed_id];
      console.assert(
        !!titleDeed,
        `Title deed ${ownership.title_deed_id} not found: `,
        ownership,
      );
      titleDeed.ownersCount = ownership.owners_count;
      titleDeed.ownerTypes = ownership.owner_types;
    }

    assertIsDefined(state.parcelFeatures);
    for (const titleDeed of Object.values(state.titleDeeds)) {
      const ownerTypes = titleDeed.ownerTypes;
      const group = Object.values(settings.ownerGroups).find(
        (group) =>
          (group.groupType === 'AllMatches' &&
            ownerTypes.every((ot) => {
              return !!group.ownerTypesAnyOf.find((pot) =>
                ownerTypeMatches(ot, pot),
              );
            })) ||
          (group.groupType === 'AllWithinIcos' &&
            ownerTypes.every(
              (ot) =>
                ot.owner_ico != null &&
                (group.ownerIcosAnyOf.includes(ot.owner_ico) ||
                  group.ownerIcosAllowed.includes(ot.owner_ico)),
            ) &&
            group.ownerIcosAnyOf.every((ico) =>
              ownerTypes.find((ot) => ot.owner_ico === ico),
            )) ||
          (group.groupType === 'AnyWithinIcos' &&
            ownerTypes.some(
              (ot) =>
                ot.owner_ico != null &&
                group.ownerIcosAnyOf.includes(ot.owner_ico),
            )),
      );
      if (group) {
        for (const parcelId of titleDeed.parcels) {
          const parcel = state.parcelFeatures[parcelId];
          parcel.set('ownerGroup', group.groupId);
        }
      }
    }
    console.log('done');
  });

export const codeListsLoaded = (codeLists: Partial<State['codeLists']>) =>
  set((state) => {
    state.codeLists = {
      ...state.codeLists,
      ...codeLists,
    };
  });

export const mapLayersChange = (mapLayers: {
  [id: string]: Partial<MapLayer>;
}) => {
  set((state) => {
    for (const [id, layer] of Object.entries(mapLayers)) {
      state.mapLayers[id] = {
        ...state.mapLayers[id],
        ...layer,
      };
    }
  });
};
