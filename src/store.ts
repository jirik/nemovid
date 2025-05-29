import type { Feature } from 'ol';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { MIN_FEATURE_EXTENT_RADIUS } from '../constants.ts';
import { assertIsDefined } from './assert.ts';
import * as olUtil from './olutil.ts';
import {
  type ParcelAreas,
  ParcelCoveredAreaM2PropName,
  ParcelCoveredAreaPercPropName,
  extentsToFeatures,
} from './olutil.ts';

export type ParcelFilters = {
  maxCoveredAreaM2: number;
  maxCoveredAreaPerc: number;
};

interface State {
  fileName: string | null;
  features: Feature[];
  parcels: Record<string, Feature> | null;
  highlightedParcel: string | null;
  highlightedFeature: number | null;
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
    highlightedParcel: null,
    highlightedFeature: null,
    parcelFilters: { ...defaultFilters },
    fileOpened: ({ name, features }: { name: string; features: Feature[] }) =>
      set((state) => {
        state.fileName = name;
        state.features = features;
        state.parcels = null;
        state.parcelFilters = { ...defaultFilters };
      }),
    parcelsLoaded: ({ parcels }: { parcels: Feature[] }) =>
      set((state) => {
        const parcelsDict: Record<string, Feature> = {};
        for (const parcel of parcels) {
          const parcelId = parcel.getId();
          if (typeof parcelId === 'string' && !(parcelId in parcelsDict)) {
            parcelsDict[parcelId] = parcel;
          }
        }
        state.parcels = parcelsDict;
      }),
    parcelAreasLoaded: ({
      parcelAreas,
    }: { parcelAreas: Record<string, ParcelAreas> }) =>
      set((state) => {
        for (const [parcelId, areas] of Object.entries(parcelAreas)) {
          assertIsDefined(state.parcels);
          const parcel = state.parcels[parcelId];
          parcel.set(ParcelCoveredAreaM2PropName, areas.coveredAreaM2, true);
          parcel.set(
            ParcelCoveredAreaPercPropName,
            areas.coveredAreaPerc,
            true,
          );
        }
        // @ts-ignore
        const stats = getParcelStats(state);
        if (stats.maxCoveredAreaM2 > 0) {
          state.parcelFilters.maxCoveredAreaM2 = stats.maxCoveredAreaM2;
          state.parcelFilters.maxCoveredAreaPerc = 100;
        }
      }),
    mapPointerMove: ({
      highlightedParcel,
      highlightedFeature,
    }: {
      highlightedParcel?: Feature | null;
      highlightedFeature?: Feature | null;
    }) =>
      set((state) => {
        state.highlightedParcel =
          (highlightedParcel?.getId() as string) || null;
        const featureFid = highlightedFeature?.get('fid');
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

export type Zoning = {
  id: string;
  title: string;
  parcels: Feature[];
};

export const getParcelsByZoning = createAppSelector(
  [(state) => state.parcels],
  (parcels) => {
    const zonings: Record<string, Zoning> = {};
    for (const parcel of Object.values(parcels || {})) {
      const zoningUrl = parcel.get('zoning')['xlink:href'] as string;
      const zoningTitle = parcel.get('zoning')['xlink:title'] as string;
      const zoningId = URL.parse(zoningUrl)?.searchParams.get('Id');
      assertIsDefined(zoningId);
      if (!(zoningId in zonings)) {
        zonings[zoningId] = {
          id: zoningId,
          title: zoningTitle,
          parcels: [],
        };
      }
      zonings[zoningId].parcels.push(parcel);
    }
    for (const zoning of Object.values(zonings)) {
      zoning.parcels.sort((a, b) => {
        const aParts = (a.get('label') as string)
          .split(/\D+/)
          .map((s) => Number.parseInt(s));
        const bParts = (b.get('label') as string)
          .split(/\D+/)
          .map((s) => Number.parseInt(s));
        return aParts[0] - bParts[0] || aParts[1] - bParts[1];
      });
    }
    return zonings;
  },
);

export const getParcelStats = createAppSelector(
  [(state) => state.parcels],
  (parcels): ParcelStats => {
    const result: ParcelStats = {
      maxCoveredAreaM2: 0,
    };
    for (const parcel of Object.values(parcels || {})) {
      result.maxCoveredAreaM2 = Math.max(
        result.maxCoveredAreaM2,
        parcel.get(ParcelCoveredAreaM2PropName),
      );
    }
    return result;
  },
);

export type ParcelStats = {
  maxCoveredAreaM2: number;
};
