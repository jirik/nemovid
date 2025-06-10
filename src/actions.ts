import type { Feature } from 'ol';
import { assertIsDefined } from './assert.ts';
import { getParcelLabel, getParcelZoning } from './cuzk.ts';
import {
  type ParcelAreas,
  ParcelCoveredAreaM2PropName,
  ParcelCoveredAreaPercPropName,
} from './olutil.ts';
import {
  type ParcelFilters,
  type SimpleOwner,
  type SimpleParcel,
  type SimpleTitleDeed,
  type SimpleZoning,
  defaultFilters,
  getParcelStats,
  useAppStore,
} from './store.ts';
import type { State } from './store.ts';

const set = useAppStore.getState().set;

export const fileOpened = ({
  name,
  features,
}: { name: string; features: Feature[] }) =>
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
  });

export const parcelsLoaded = ({ parcels }: { parcels: Feature[] }) =>
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
        const landUseCode = parcelFeature.get('landUse') as string | null;
        const parcel: SimpleParcel = {
          id: parcelId,
          label: getParcelLabel(parcelFeature),
          titleDeed: null,
          zoning: zoningId,
          landUse: landUseCode,
        };

        parcelsDict[parcelId] = parcel;
        zoning.parcels.push(parcelId);
        state.parcelFeatures[parcelId] = parcelFeature;
      }
    }
    state.parcels = parcelsDict;
  });

export const parcelAreasLoaded = ({
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
  });

export const mapPointerMove = ({
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
  });

export const parcelFiltersChanged = (filters: Partial<ParcelFilters>) =>
  set((state) => {
    state.parcelFilters = {
      ...state.parcelFilters,
      ...filters,
    };
  });

export const parcelAreasProgress = (processedParcels: number) =>
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

export const codeListsLoaded = (codeLists: Partial<State['codeLists']>) =>
  set((state) => {
    state.codeLists = {
      ...state.codeLists,
      ...codeLists,
    };
  });
