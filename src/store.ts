import type { Feature } from 'ol';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { MIN_FEATURE_EXTENT_RADIUS } from '../constants.ts';
import * as olUtil from './olutil.ts';
import { extentsToFeatures } from './olutil.ts';

interface State {
  fileName: string | null;
  features: Feature[];
  parcels: Record<string, Feature> | null;
}

interface Actions {
  fileOpened: ({
    name,
    features,
  }: { name: string; features: Feature[] }) => void;
  parcelsLoaded: ({ parcels }: { parcels: Feature[][] }) => void;
}

export const useAppStore = create<State & Actions>()(
  immer((set) => ({
    fileName: null,
    features: [],
    parcels: null,
    fileOpened: ({ name, features }: { name: string; features: Feature[] }) =>
      set((state) => {
        state.fileName = name;
        state.features = features;
        state.parcels = null;
      }),
    parcelsLoaded: ({ parcels }: { parcels: Feature[][] }) =>
      set((state) => {
        state.parcels = {};
        for (const parcelGroup of parcels) {
          for (const parcel of parcelGroup) {
            const parcelId = parcel.getId();
            if (typeof parcelId === 'string' && !(parcelId in state.parcels)) {
              state.parcels[parcelId] = parcel;
            }
          }
        }
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
