import type { Draft } from 'immer';
import type { Feature } from 'ol';
import type { ExpressionValue } from 'ol/expr/expression';
import type { FlatStyleLike } from 'ol/style/flat';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { MIN_FEATURE_EXTENT_RADIUS } from '../constants.ts';
import { assertIsDefined } from './assert.ts';
import {
  type CodeList,
  type CodeListItem,
  NullItem,
  getGlFilters,
  getGlVars,
} from './codeList.ts';
import { sortParcelByLabel } from './cuzk.ts';
import * as olUtil from './olutil.ts';
import {
  ParcelCoveredAreaM2PropName,
  ParcelCoveredAreaPercPropName,
  ParcelHasBuildingPropName,
  extentsToFeatures,
  filterParcels,
} from './olutil.ts';
import * as ts from './typescriptUtil.ts';

export type ParcelFilters = {
  maxCoveredAreaM2: number;
  maxCoveredAreaPerc: number;
  hasBuilding: boolean | null;
  landUse: { [code: string]: boolean } | null;
  landType: { [code: string]: boolean } | null;
};

export interface State {
  fileName: string | null;
  features: Feature[] | null;
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
  codeLists: {
    landUse: CodeList | null;
    landType: CodeList | null;
  };
}

export const defaultFilters: ParcelFilters = {
  maxCoveredAreaM2: 1_000_000_000,
  maxCoveredAreaPerc: 100,
  hasBuilding: null,
  landUse: null,
  landType: null,
};

const initialState: State = {
  fileName: null,
  features: null,
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
  parcelFilters: structuredClone(defaultFilters),
  codeLists: {
    landUse: null,
    landType: null,
  },
};

type Setter = {
  set: (setter: (state: Draft<State>) => void) => void;
};

export const useAppStore = create<State & Setter>()(
  immer((set) => ({ ...initialState, set: (state) => set(state) })),
);

const createAppSelector = createSelector.withTypes<State>();

export const getMainExtents = createAppSelector(
  [(state) => state.features],
  (features) => {
    if (!features) {
      return null;
    }
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
    if (!mainExtents) {
      return null;
    }
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
  landUse: CodeListItem;
  landType: CodeListItem;
  hasBuilding: boolean;
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

export const UnknownSimpleTitleDeed: Omit<
  SimpleTitleDeed,
  'zoning' | 'parcels' | 'owners' | 'id'
> = {
  number: -1,
};

export type SimpleParcel = Omit<
  Parcel,
  'zoning' | 'titleDeed' | 'landUse' | 'landType'
> & {
  zoning: string;
  titleDeed: number | null;
  landUse: string;
  landType: string;
};

export type SimpleOwner = Omit<Owner, 'titleDeeds'>;

export const UnknownSimpleOwner: Omit<SimpleOwner, 'titleDeeds'> = {
  id: -1,
  label: 'Neznámý vlastník (pravděpodobně nedávno změněná parcela)',
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
    (state) => state.codeLists,
  ],
  (
    simpleZonings,
    filteredParcels,
    simpleTitleDeeds,
    simpleOwners,
    codeLists,
  ) => {
    const simpleParcels = filteredParcels;
    if (simpleZonings == null || simpleParcels == null) {
      return null;
    }
    const allOwners: Record<string, Owner> = {};
    const zonings = Object.values(simpleZonings || {}).reduce(
      (prev: Record<string, Zoning>, simpleZoning) => {
        const zoningSimpleParcels = simpleZoning.parcels
          .filter((pid) => pid in simpleParcels)
          .map((pid) => simpleParcels[pid]);
        const zoningSimpleTitleDeeds: SimpleTitleDeed[] = [];
        for (const simpleTitleDeed of Object.values(simpleTitleDeeds || {})) {
          if (
            simpleTitleDeed.zoning === simpleZoning.id &&
            simpleTitleDeed.parcels.find((pid) => pid in simpleParcels)
          ) {
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
            landUse:
              codeLists.landUse == null
                ? NullItem
                : codeLists.landUse.values[simpleParcel.landUse],
            landType:
              codeLists.landType == null
                ? NullItem
                : codeLists.landType.values[simpleParcel.landType],
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
            const owners: Owner[] = simpleOwners
              ? simpleTitleDeed.owners.map((ownerId) => {
                  if (!(ownerId in allOwners)) {
                    allOwners[ownerId] = {
                      ...simpleOwners[ownerId],
                      titleDeeds: [],
                    };
                  }
                  return allOwners[ownerId];
                })
              : [];
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
      zoning.parcels.sort(sortParcelByLabel);
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

export const getOwners = createAppSelector([getZonings], (zonings) => {
  if (zonings == null) {
    return null;
  }
  const ownersDict: Record<string, Owner> = {};
  for (const zoning of Object.values(zonings)) {
    for (const titleDeed of Object.values(zoning.titleDeeds)) {
      for (const owner of Object.values(titleDeed.owners)) {
        if (!(owner.id in ownersDict)) {
          ownersDict[owner.id] = owner;
        }
      }
    }
  }
  return Object.values(ownersDict);
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

export const getAreFeaturesLoaded = createAppSelector(
  [(state) => state.features],
  (features): boolean => {
    return features != null;
  },
);

export const getCodeLists = createAppSelector(
  [(state) => state.parcels, (state) => state.codeLists],
  (simpleParcels, codeLists): State['codeLists'] => {
    if (simpleParcels == null) {
      return structuredClone(initialState.codeLists);
    }
    return ts.fromEntries(
      ts.entries(codeLists).map(([codeListKey, fullCodeList]) => {
        let codeList: CodeList | null = null;
        if (fullCodeList != null) {
          codeList = {
            id: fullCodeList.id,
            label: fullCodeList.label,
            values: {},
          };
          for (const code of Object.keys(fullCodeList.values)) {
            if (
              Object.values(simpleParcels).some(
                (parcel) => parcel[codeListKey] === code,
              )
            ) {
              codeList.values[code] = fullCodeList.values[code];
            }
          }
        }
        return [codeListKey, codeList] as ts.Entry<State['codeLists']>;
      }),
    );
  },
);

export type ParcelStats = {
  maxCoveredAreaM2: number | null;
};

export const getParcelGlVars = createAppSelector(
  [(state) => state.parcelFilters, (state) => state.highlightedParcel],
  (
    parcelFilters,
    highlightedParcel,
  ): { [varName: string]: number | boolean } => {
    const landUseGlVars = getGlVars({
      filter: parcelFilters.landUse,
      varPrefix: 'landUse_',
    });
    const landTypeGlVars = getGlVars({
      filter: parcelFilters.landType,
      varPrefix: 'landType_',
    });
    const result = {
      ...landUseGlVars,
      ...landTypeGlVars,
      highlightedId: highlightedParcel || -1,
      maxCoveredAreaM2: parcelFilters.maxCoveredAreaM2,
      maxCoveredAreaPerc: parcelFilters.maxCoveredAreaPerc,
      hasBuilding:
        parcelFilters.hasBuilding === null ? -1 : parcelFilters.hasBuilding,
    };
    return result;
  },
);

export const getParcelGlStyle = createAppSelector(
  [(state) => state.codeLists],
  (codeLists): FlatStyleLike => {
    const landUseGlFilters = getGlFilters({
      codeList: codeLists.landUse,
      varPrefix: 'landUse_',
      propName: 'landUse',
    });
    const landTypeGlFilters = getGlFilters({
      codeList: codeLists.landType,
      varPrefix: 'landType_',
      propName: 'landType',
    });

    const parcelFilters: ExpressionValue = [
      ['<=', ['get', ParcelCoveredAreaM2PropName], ['var', 'maxCoveredAreaM2']],
      [
        '<=',
        ['get', ParcelCoveredAreaPercPropName],
        ['var', 'maxCoveredAreaPerc'],
      ],
      [
        'any',
        ['==', ['var', 'hasBuilding'], -1],
        ['==', ['var', 'hasBuilding'], ['get', ParcelHasBuildingPropName]],
      ],
      ...landUseGlFilters,
      ...landTypeGlFilters,
    ];

    return [
      {
        filter: [
          'all',
          ['==', ['var', 'highlightedId'], ['id']],
          ...parcelFilters,
        ],
        style: {
          'stroke-color': '#ffff00',
          'stroke-width': 4,
          'fill-color': 'rgba(255,255,000,0.4)',
        },
      },
      {
        else: true,
        filter: ['all', ...parcelFilters],
        style: {
          'stroke-color': '#ffff00',
          'stroke-width': 1,
          'fill-color': 'rgba(255,255,000,0.4)',
        },
      },
    ];
  },
);
