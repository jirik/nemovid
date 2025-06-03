import deepEqual from 'deep-equal';
import type JstsGeometry from 'jsts/org/locationtech/jts/geom/Geometry.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import JstsPolygon from 'jsts/org/locationtech/jts/geom/Polygon.js';
import OL3Parser from 'jsts/org/locationtech/jts/io/OL3Parser.js';
import JstsBufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import JstsOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import JstsRelatedOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js';
import JstsIsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import * as olExtent from 'ol/extent';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import {
  GeometryCollection,
  LineString,
  LinearRing,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
} from 'ol/geom';
import { fromExtent } from 'ol/geom/Polygon';
import TileLayer from 'ol/layer/Tile';
import type VectorSource from 'ol/source/Vector';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import { assertIsDefined } from './assert.ts';
import {
  type ParcelFilters,
  type SimpleParcel,
  defaultFilters,
} from './store.ts';

export const loadTileLayerFromWmtsCapabilities = async ({
  url,
  layer,
  matrixSet,
}: {
  url: string;
  layer: string;
  matrixSet: string;
}): Promise<TileLayer<WMTS>> => {
  const parser = new WMTSCapabilities();

  const capResp = await fetch(url);
  const capString = await capResp.text();
  const result = parser.read(capString);

  const options = optionsFromCapabilities(result, {
    layer: layer,
    matrixSet: matrixSet,
  });
  assertIsDefined(options);

  // biome-ignore lint/suspicious/noExplicitAny: it can be any type
  const layerDef = result?.Contents?.Layer?.find((layerDef: any) => {
    return layerDef?.Identifier === layer;
  });
  assertIsDefined(layerDef);

  const matrixSetDef = result?.Contents?.TileMatrixSet?.find(
    // biome-ignore lint/suspicious/noExplicitAny: it can be any type
    (matrixSetDef: any) => {
      return matrixSetDef?.Identifier === matrixSet;
    },
  );
  assertIsDefined(matrixSetDef);

  const bboxCrs = matrixSetDef?.SupportedCRS as string;

  // biome-ignore lint/suspicious/noExplicitAny: it can be any type
  const bboxDef = layerDef?.BoundingBox?.find((bboxDef: any) => {
    return bboxDef?.crs === bboxCrs;
  });

  const bboxExtent = bboxDef?.extent as Extent;

  const tileLayer = new TileLayer({
    opacity: 1,
    source: new WMTS(options),
    extent: bboxExtent || undefined,
  });
  return tileLayer;
};

export const getMainExtents = ({
  features,
  minExtentRadius,
}: { features: Feature[]; minExtentRadius: number }): Extent[] => {
  const mainExtents: Extent[] = [];

  for (const feature of features) {
    const featureExtent = feature.getGeometry()?.getExtent();
    let newExtent =
      featureExtent && !olExtent.isEmpty(featureExtent)
        ? assertMinExtentRadius({
            extent: featureExtent.concat(),
            minExtentRadius,
          })
        : undefined;
    while (newExtent) {
      const overlappedExtentIdx = mainExtents.findIndex((ext) => {
        // @ts-ignore
        return newExtent !== ext && olExtent.intersects(newExtent, ext);
      });
      if (overlappedExtentIdx >= 0) {
        const overlappedExtent = mainExtents[overlappedExtentIdx];
        if (olExtent.containsExtent(overlappedExtent, newExtent)) {
          newExtent = undefined;
        } else {
          mainExtents.splice(overlappedExtentIdx, 1);
          newExtent = olExtent.extend(overlappedExtent, newExtent);
        }
      } else {
        mainExtents.push(newExtent);
        newExtent = undefined;
      }
    }
  }
  return mainExtents;
};

export const extentsToFeatures = ({
  extents,
}: { extents: Extent[] }): Feature[] => {
  return extents.map((extent) => {
    const polygon = fromExtent(extent);
    const feature = new Feature({
      geometry: polygon,
    });
    return feature;
  });
};

export const assertMinExtentRadius = ({
  extent,
  minExtentRadius,
}: { extent: Extent; minExtentRadius: number }): Extent => {
  const minExtent = olExtent.buffer(
    olExtent.boundingExtent([olExtent.getCenter(extent)]),
    minExtentRadius,
  );

  if (!olExtent.containsExtent(extent, minExtent)) {
    olExtent.extend(extent, minExtent);
  }
  return extent;
};

export const getParcelsByFeatureExtent = ({
  parcels,
  featureSource,
}: {
  parcels: Feature[];
  featureSource: VectorSource;
}): {
  parcelsByExtent: Feature[];
  featuresByParcel: Record<string, Feature[]>;
} => {
  const featuresByParcel: Record<string, Feature[]> = {};

  const parcelsByExtent = parcels.filter((parcel) => {
    const parcelGeom = parcel.getGeometry();
    assertIsDefined(parcelGeom);
    const parcelId: number = parcel.getId() as number;
    const foundFeatures = featureSource.getFeaturesInExtent(
      parcelGeom.getExtent(),
    );
    if (foundFeatures.length > 0) {
      featuresByParcel[parcelId] = foundFeatures;
    }
    return foundFeatures.length > 0;
  });
  return {
    parcelsByExtent,
    featuresByParcel,
  };
};

export const getIntersectedParcels = ({
  parcelsByExtent,
  featuresByParcel,
}: {
  parcelsByExtent: Feature[];
  featuresByParcel: Record<string, Feature[]>;
}): Feature[] => {
  const geometryFactory = new GeometryFactory();
  const parser = new OL3Parser(geometryFactory, undefined);
  parser.inject(
    Point,
    LineString,
    LinearRing,
    Polygon,
    MultiPoint,
    MultiLineString,
    MultiPolygon,
    GeometryCollection,
  );

  const featureJstsGeoms: Record<string, JstsGeometry> = {};

  const parcelsByGeom = parcelsByExtent.filter((parcel) => {
    const parcelJstsGeom = parser.read(parcel.getGeometry());
    console.assert(parcelJstsGeom instanceof JstsPolygon);
    const parcelId: number = parcel.getId() as number;
    const parcelFeaturesByExtent = featuresByParcel[parcelId];
    const intersects = parcelFeaturesByExtent.some((feature) => {
      const featureId = feature.getId() as number;
      if (!(featureId in featureJstsGeoms)) {
        const geom = parser.read(feature.getGeometry());
        const geomIsValid = JstsIsValidOp.isValid(geom);
        console.assert(
          geomIsValid,
          'Expected valid geometry, but found',
          geom,
          feature,
        );
        featureJstsGeoms[featureId] = geomIsValid
          ? geom
          : JstsBufferOp.bufferOp(geom, 0);
      }
      const featureJstsGeom = featureJstsGeoms[featureId];
      try {
        return JstsRelatedOp.intersects(parcelJstsGeom, featureJstsGeom);
      } catch (e) {
        console.error(
          `Some problem when intersecting ${parcelId} x ${featureId}`,
        );
        console.error(e);
      }
    });
    return intersects;
  });

  return parcelsByGeom;
};

export function* setParcelIntersections({
  parcels,
  featuresByParcel,
}: {
  parcels: Feature[];
  featuresByParcel: Record<string, Feature[]>;
}): Generator<number> {
  const geometryFactory = new GeometryFactory();
  const parser = new OL3Parser(geometryFactory, undefined);
  parser.inject(
    Point,
    LineString,
    LinearRing,
    Polygon,
    MultiPoint,
    MultiLineString,
    MultiPolygon,
    GeometryCollection,
  );

  const featuresJstsGeoms: Record<string, JstsGeometry> = {};

  for (const [parcelIdx, parcel] of parcels.entries()) {
    const parcelJstsGeom = parser.read(parcel.getGeometry());
    console.assert(parcelJstsGeom instanceof JstsPolygon);
    const parcelId: number = parcel.getId() as number;
    const parcelFeaturesByExtent = featuresByParcel[parcelId];
    const parcelIntersections: JstsGeometry[] = [];
    for (const feature of parcelFeaturesByExtent) {
      const featureId = feature.getId() as number;
      if (!(featureId in featuresJstsGeoms)) {
        const geom = parser.read(feature.getGeometry());
        const geomIsValid = JstsIsValidOp.isValid(geom);
        console.assert(
          geomIsValid,
          'Expected valid geometry, but found',
          geom,
          feature,
        );
        featuresJstsGeoms[featureId] = geomIsValid
          ? geom
          : JstsBufferOp.bufferOp(geom, 0);
      }
      const featureJstsGeom = featuresJstsGeoms[featureId];
      try {
        const intersects: boolean = JstsRelatedOp.intersects(
          parcelJstsGeom,
          featureJstsGeom,
        );
        if (intersects) {
          parcelIntersections.push(
            JstsOverlayOp.intersection(parcelJstsGeom, featureJstsGeom),
          );
        }
      } catch (e) {
        console.error(
          `Some problem when intersecting ${parcelId} x ${featureId}`,
        );
        console.error(e);
      }
    }

    let parcelIntersection: JstsGeometry | null = null;
    for (const isection of parcelIntersections) {
      try {
        parcelIntersection = parcelIntersection
          ? JstsOverlayOp.union(parcelIntersection, isection)
          : isection;
      } catch (e) {
        console.error(`Some problem when unioning intersection ${parcelId}`);
        console.error(e);
      }
    }
    assertIsDefined(parcelIntersection);
    const officialArea = Number.parseInt(parcel.get('areaValue')._content_);
    const coveredArea = Math.ceil(
      Math.min(parcelIntersection.getArea(), officialArea),
    );
    const coveredAreaRatio = Math.ceil((coveredArea / officialArea) * 100);
    parcel.set(ParcelOfficialAreaM2PropName, officialArea, true);
    parcel.set(ParcelCoveredAreaM2PropName, coveredArea, true);
    parcel.set(ParcelCoveredAreaPercPropName, coveredAreaRatio, true);

    yield parcelIdx + 1;
  }
}

export const ParcelOfficialAreaM2PropName = 'statkarParcelAreaM2';
export const ParcelCoveredAreaM2PropName = 'statkarParcelCoverM2';
export const ParcelCoveredAreaPercPropName = 'statkarParcelCoverPerc';

export type ParcelAreas = {
  coveredAreaM2: number;
  coveredAreaPerc: number;
};

export const filterParcels = ({
  models,
  features,
  filters,
}: {
  models: Record<string, SimpleParcel> | null;
  features: Record<string, Feature> | null;
  filters: ParcelFilters;
}): Record<string, SimpleParcel> | null => {
  if (
    models == null ||
    features == null ||
    deepEqual(filters, defaultFilters)
  ) {
    return models;
  }
  const filteredFeaturesList = Object.values(features).filter((feature) => {
    const areaM2 = feature.get(ParcelCoveredAreaM2PropName) as number;
    const areaPerc = feature.get(ParcelCoveredAreaPercPropName) as number;
    return (
      areaM2 <= filters.maxCoveredAreaM2 &&
      areaPerc <= filters.maxCoveredAreaPerc
    );
  });
  const filteredFeatures = filteredFeaturesList.reduce(
    (prev: Record<string, Feature>, feature) => {
      prev[feature.getId() as number] = feature;
      return prev;
    },
    {},
  );
  const result: Record<string, SimpleParcel> = Object.values(models).reduce(
    (prev: Record<string, SimpleParcel>, model) => {
      if (model.id in filteredFeatures) {
        prev[model.id] = model;
      }
      return prev;
    },
    {},
  );
  return result;
};
