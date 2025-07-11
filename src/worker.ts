import { GeoJSON } from 'ol/format';
import type { GeoJSONFeatureCollection } from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import {
  type ParcelAreas,
  ParcelCoveredAreaM2PropName,
  ParcelCoveredAreaPercPropName,
  getIntersectedParcels,
  getParcelsByConstrnExtent,
  setParcelIntersections,
} from './olutil.ts';

export type IncomingMessage = {
  constrns: GeoJSONFeatureCollection;
  parcels: GeoJSONFeatureCollection;
};

export type OutgoingMessage =
  | {
      type: 'coveredParcels';
      parcels: GeoJSONFeatureCollection;
    }
  | {
      type: 'parcelAreasProgress';
      processedParcels: number;
    }
  | {
      type: 'parcelAreas';
      parcelAreas: Record<string, ParcelAreas>;
    };

self.onmessage = async (event) => {
  const data: IncomingMessage = event.data;
  const format = new GeoJSON();
  const constrns = format.readFeatures(data.constrns);
  const parcels = format.readFeatures(data.parcels);

  const constrnSource = new VectorSource({
    features: constrns,
  });

  const { parcelsByExtent, constrnsByParcel } = getParcelsByConstrnExtent({
    parcels,
    constrnSource: constrnSource,
  });
  const coveredParcels = getIntersectedParcels({
    parcelsByExtent,
    constrnsByParcel,
  });

  const coveredParcelsGeojson: GeoJSONFeatureCollection =
    format.writeFeaturesObject(coveredParcels);

  self.postMessage({
    type: 'coveredParcels',
    parcels: coveredParcelsGeojson,
  } satisfies OutgoingMessage);

  const progress = setParcelIntersections({
    parcels: coveredParcels,
    constrnsByParcel: constrnsByParcel,
  });
  const numParcels = coveredParcels.length;
  let processedParcels = 0;
  while (processedParcels < numParcels) {
    self.postMessage({
      type: 'parcelAreasProgress',
      processedParcels,
    } satisfies OutgoingMessage);
    processedParcels = progress.next().value;
  }
  const parcelAreas = coveredParcels.reduce(
    (prev: Record<string, ParcelAreas>, parcel) => {
      const id = parcel.getId() as number;
      prev[id] = {
        coveredAreaM2: parcel.get(ParcelCoveredAreaM2PropName) as number,
        coveredAreaPerc: parcel.get(ParcelCoveredAreaPercPropName) as number,
      };
      return prev;
    },
    {},
  );

  self.postMessage({
    type: 'parcelAreas',
    parcelAreas,
  } satisfies OutgoingMessage);
};
