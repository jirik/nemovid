import type { Feature } from 'ol';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { MIN_FEATURE_EXTENT_RADIUS } from '../constants.ts';
import { assertIsDefined } from './assert.ts';
import { getParcelLabel, getParcelZoning } from './cuzk.ts';
import * as olUtil from './olutil.ts';
import {
  type ParcelAreas,
  ParcelCoveredAreaM2PropName,
  ParcelCoveredAreaPercPropName,
  extentsToFeatures,
  filterParcels,
} from './olutil.ts';

export type ParcelFilters = {
  maxCoveredAreaM2: number;
  maxCoveredAreaPerc: number;
};

interface State {
  fileName: string | null;
  features: Feature[];
  parcels: Record<string, SimpleParcel> | null;
  parcelFeatures: Record<string, Feature> | null;
  zonings: Record<string, SimpleZoning> | null;
  titleDeeds: Record<string, SimpleTitleDeed> | null;
  owners: Record<string, SimpleOwner> | null;
  highlightedParcel: number | null;
  highlightedFeature: number | null;
  parcelAreasTimestamp: number | null;
  parcelInfosTimestamp: number | null;
  processedParcels: number | null;
  parcelFilters: ParcelFilters;
}

interface Actions {
  fileOpened: ({
    name,
    features,
  }: { name: string; features: Feature[] }) => void;
  parcelsLoaded: ({ parcels }: { parcels: Feature[] }) => void;
  parcelAreasLoaded: ({
    parcelAreas,
  }: { parcelAreas: Record<string, ParcelAreas> }) => void;
  parcelFiltersChanged: (opts: Partial<ParcelFilters>) => void;
  mapPointerMove: ({
    highlightedParcel,
    highlightedFeature,
  }: {
    highlightedParcel?: Feature | null;
    highlightedFeature?: Feature | null;
  }) => void;
  parcelAreasProgress: (processedParcels: number) => void;
  titleDeedsLoaded: ({
    titleDeeds,
    owners,
  }: {
    titleDeeds: Record<string, SimpleTitleDeed>;
    owners: Record<string, SimpleOwner>;
  }) => void;
}

export const defaultFilters: ParcelFilters = {
  maxCoveredAreaM2: 1_000_000_000,
  maxCoveredAreaPerc: 100,
};

export const useAppStore = create<State & Actions>()(
  immer((set) => ({
    fileName: null,
    features: [],
    parcels: null,
    parcelFeatures: null,
    zonings: null,
    titleDeeds: null,
    owners: null,
    processedParcels: null,
    highlightedParcel: null,
    highlightedFeature: null,
    parcelAreasTimestamp: null,
    parcelInfosTimestamp: null,
    parcelFilters: { ...defaultFilters },
    fileOpened: ({ name, features }: { name: string; features: Feature[] }) =>
      set((state) => {
        state.fileName = name;
        state.features = features;
        state.parcels = null;
        state.parcelFeatures = null;
        state.zonings = null;
        state.titleDeeds = null;
        state.owners = null;
        state.parcelFilters = { ...defaultFilters };
        state.parcelAreasTimestamp = null;
        state.parcelInfosTimestamp = null;
        state.processedParcels = null;
      }),
    parcelsLoaded: ({ parcels }: { parcels: Feature[] }) =>
      set((state) => {
        const parcelsDict: Record<string, SimpleParcel> = {};
        state.parcelFeatures = {};
        state.zonings = {};
        for (const parcelFeature of parcels) {
          const parcelId = parcelFeature.getId() as number;
          console.assert(typeof parcelId === 'number');

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
            const parcel: SimpleParcel = {
              id: parcelId,
              label: getParcelLabel(parcelFeature),
              titleDeed: null,
              zoning: zoningId,
            };

            parcelsDict[parcelId] = parcel;
            zoning.parcels.push(parcelId);
            state.parcelFeatures[parcelId] = parcelFeature;
          }
        }
        state.parcels = parcelsDict;
      }),
    parcelAreasLoaded: ({
      parcelAreas,
    }: { parcelAreas: Record<string, ParcelAreas> }) =>
      set((state) => {
        assertIsDefined(state.parcelFeatures);
        for (const [parcelId, areas] of Object.entries(parcelAreas)) {
          const parcel = state.parcelFeatures[parcelId];
          parcel.set(ParcelCoveredAreaM2PropName, areas.coveredAreaM2);
          parcel.set(ParcelCoveredAreaPercPropName, areas.coveredAreaPerc);
        }
        state.parcelAreasTimestamp = Date.now();
        // @ts-ignore
        const stats = getParcelStats(state);
        assertIsDefined(stats.maxCoveredAreaM2);
        state.parcelFilters.maxCoveredAreaM2 = stats.maxCoveredAreaM2;
        state.parcelFilters.maxCoveredAreaPerc = 100;
        state.processedParcels = null;
      }),
    mapPointerMove: ({
      highlightedParcel,
      highlightedFeature,
    }: {
      highlightedParcel?: Feature | null;
      highlightedFeature?: Feature | null;
    }) =>
      set((state) => {
        state.highlightedParcel = highlightedParcel
          ? (highlightedParcel.getId() as number)
          : null;
        const featureFid = highlightedFeature?.getId();
        state.highlightedFeature =
          typeof featureFid === 'number' ? featureFid : null;
      }),
    parcelFiltersChanged: (filters: Partial<ParcelFilters>) =>
      set((state) => {
        state.parcelFilters = {
          ...state.parcelFilters,
          ...filters,
        };
      }),
    parcelAreasProgress: (processedParcels: number) =>
      set((state) => {
        state.processedParcels = processedParcels;
      }),
    titleDeedsLoaded: ({
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
      }),
  })),
);

const createAppSelector = createSelector.withTypes<State>();

export const getMainExtents = createAppSelector(
  [(state) => state.features],
  (features) => {
    const mainExtents = olUtil.getMainExtents({
      features,
      minExtentRadius: MIN_FEATURE_EXTENT_RADIUS, // meters
    });
    return mainExtents;
  },
);

export const getMainExtentFeatures = createAppSelector(
  [getMainExtents],
  (mainExtents) => {
    const extentFeatures = extentsToFeatures({ extents: mainExtents });
    return extentFeatures;
  },
);

export type Owner = {
  id: number;
  label: string;
  titleDeeds: TitleDeed[];
};

export type TitleDeed = {
  id: number;
  number: number;
  owners: Owner[];
  parcels: Parcel[];
  zoning: Zoning;
};

export type Zoning = {
  id: string;
  title: string;
  parcels: Parcel[];
  titleDeeds: Record<string, TitleDeed>;
};

export type Parcel = {
  id: number;
  label: string;
  zoning: Zoning;
  titleDeed: TitleDeed | null;
};

export type SimpleZoning = Omit<Zoning, 'parcels' | 'titleDeeds'> & {
  parcels: number[];
  titleDeeds: number[];
};
export type SimpleTitleDeed = Omit<
  TitleDeed,
  'zoning' | 'parcels' | 'owners'
> & {
  zoning: string;
  parcels: number[];
  owners: number[];
};

export type SimpleParcel = Omit<Parcel, 'zoning' | 'titleDeed'> & {
  zoning: string;
  titleDeed: number | null;
};

export type SimpleOwner = Omit<Owner, 'titleDeeds'> & {
  titleDeeds: number[];
};

export const getFilteredParcels = createAppSelector(
  [
    (state) => state.parcels,
    (state) => state.parcelFeatures,
    (state) => state.parcelFilters,
  ],
  (parcels, features, parcelFilters) => {
    return filterParcels({
      models: parcels,
      features: features,
      filters: parcelFilters,
    });
  },
);

export const getZonings = createAppSelector(
  [
    (state) => state.zonings,
    getFilteredParcels,
    (state) => state.titleDeeds,
    (state) => state.owners,
  ],
  (simpleZonings, filteredParcels, simpleTitleDeeds, simpleOwners) => {
    const simpleParcels = filteredParcels;
    if (
      simpleZonings == null ||
      simpleParcels == null ||
      simpleOwners == null
    ) {
      return null;
    }
    const zonings = Object.values(simpleZonings || {}).reduce(
      (prev: Record<string, Zoning>, simpleZoning) => {
        const zoningSimpleParcels = simpleZoning.parcels
          .filter((pid) => pid in simpleParcels)
          .map((pid) => simpleParcels[pid]);
        const zoningSimpleTitleDeeds: SimpleTitleDeed[] = [];
        for (const simpleTitleDeed of Object.values(simpleTitleDeeds || {})) {
          if (simpleTitleDeed.zoning === simpleZoning.id) {
            zoningSimpleTitleDeeds.push(simpleTitleDeed);
          }
        }
        const zoning: Zoning = {
          ...simpleZoning,
          parcels: [],
          titleDeeds: {},
        };
        const zoningParcels = zoningSimpleParcels.map((simpleParcel) => {
          const parcel: Parcel = {
            ...simpleParcel,
            zoning,
            titleDeed: null,
          };
          return parcel;
        });
        const zoningTitleDeeds = zoningSimpleTitleDeeds.map(
          (simpleTitleDeed) => {
            const parcels: Parcel[] = simpleTitleDeed.parcels
              .filter((pid) => pid in simpleParcels)
              .map((pid) => {
                const parcel = zoningParcels.find((p) => p.id === pid);
                assertIsDefined(parcel);
                return parcel;
              });
            const owners: Owner[] = simpleTitleDeed.owners.map((ownerId) => {
              return {
                ...simpleOwners[ownerId],
                titleDeeds: [],
                parcels: [],
              };
            });
            const titleDeed: TitleDeed = {
              ...simpleTitleDeed,
              parcels,
              zoning,
              owners,
            };
            for (const owner of owners) {
              owner.titleDeeds.push(titleDeed);
            }
            for (const parcel of parcels) {
              parcel.titleDeed = titleDeed;
            }
            return titleDeed;
          },
        );
        zoning.titleDeeds = zoningTitleDeeds.reduce(
          (prev: Record<number, TitleDeed>, td) => {
            prev[td.id] = td;
            return prev;
          },
          {},
        );
        zoning.parcels = zoningParcels;
        if (zoning.parcels.length > 0) {
          prev[zoning.id] = zoning;
        }
        return prev;
      },
      {},
    );
    for (const zoning of Object.values(zonings)) {
      zoning.parcels.sort((a, b) => {
        const aParts = (a.label as string)
          .split(/\D+/)
          .map((s) => Number.parseInt(s));
        const bParts = (b.label as string)
          .split(/\D+/)
          .map((s) => Number.parseInt(s));
        return aParts[0] - bParts[0] || aParts[1] - bParts[1];
      });
    }
    return zonings;
  },
);

export const getParcels = createAppSelector([getZonings], (zonings) => {
  if (zonings == null) {
    return null;
  }
  const parcels: Record<string, Parcel> = {};
  for (const zoning of Object.values(zonings)) {
    for (const parcel of Object.values(zoning.parcels)) {
      parcels[parcel.id] = parcel;
    }
  }
  return parcels;
});

export const getParcelStats = createAppSelector(
  [(state) => state.parcelFeatures, (state) => state.parcelAreasTimestamp],
  (parcels, parcelAreasTimestamp): ParcelStats => {
    let result: ParcelStats = {
      maxCoveredAreaM2: null,
    };
    if (parcelAreasTimestamp != null) {
      result = {
        maxCoveredAreaM2: 0,
      };
      for (const parcel of Object.values(parcels || {})) {
        result.maxCoveredAreaM2 = Math.max(
          result.maxCoveredAreaM2 || 0,
          parcel.get(ParcelCoveredAreaM2PropName),
        );
      }
    }
    return result;
  },
);

export const getAreaFiltersState = createAppSelector(
  [(state) => state.parcels, getParcelStats],
  (parcels, parcelStats): boolean | null => {
    if (parcels == null || Object.values(parcels).length === 0) {
      return false;
    }
    if (parcelStats.maxCoveredAreaM2 != null) {
      return true;
    }
    return null;
  },
);

export const getIsFileOpened = createAppSelector(
  [(state) => state.fileName],
  (fileName): boolean => {
    return fileName != null;
  },
);

export type ParcelStats = {
  maxCoveredAreaM2: number | null;
};
