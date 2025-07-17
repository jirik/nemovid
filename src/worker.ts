import { GeoJSON } from 'ol/format';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
} from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import {
  type ParcelCover,
  ParcelCoverPropName,
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
      type: 'parcelCoverProgress';
      processedParcels: number;
    }
  | {
      type: 'parcelCover';
      parcelCover: Record<string, ParcelCover>;
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
      type: 'parcelCoverProgress',
      processedParcels,
    } satisfies OutgoingMessage);
    processedParcels = progress.next().value;
  }
  const parcelCover = coveredParcels.reduce(
    (prev: Record<string, ParcelCover>, parcel) => {
      const id = parcel.getId() as string;
      prev[id] = parcel.get(ParcelCoverPropName) as GeoJSONFeature[];
      return prev;
    },
    {},
  );

  self.postMessage({
    type: 'parcelCover',
    parcelCover,
  } satisfies OutgoingMessage);
};
