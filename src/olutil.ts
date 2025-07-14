import deepEqual from 'deep-equal';
import type JstsGeometry from 'jsts/org/locationtech/jts/geom/Geometry.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import type IntersectionMatrix from 'jsts/org/locationtech/jts/geom/IntersectionMatrix.js';
import JstsPolygon from 'jsts/org/locationtech/jts/geom/Polygon.js';
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js';
import OL3Parser from 'jsts/org/locationtech/jts/io/OL3Parser.js';
import JstsBufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import JstsOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import JstsRelatedOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js';
import JstsIsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import * as olExtent from 'ol/extent';
import type { GeoJSONGeometry } from 'ol/format/GeoJSON';
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

export const getParcelsByConstrnExtent = ({
  parcels,
  constrnSource,
}: {
  parcels: Feature[];
  constrnSource: VectorSource;
}): {
  parcelsByExtent: Feature[];
  constrnsByParcel: Record<string, Feature[]>;
} => {
  const constrnsByParcel: Record<string, Feature[]> = {};

  const parcelsByExtent = parcels.filter((parcel) => {
    const parcelGeom = parcel.getGeometry();
    assertIsDefined(parcelGeom);
    const parcelId: number = parcel.getId() as number;
    const foundConstrns = constrnSource.getFeaturesInExtent(
      parcelGeom.getExtent(),
    );
    if (foundConstrns.length > 0) {
      constrnsByParcel[parcelId] = foundConstrns;
    }
    return foundConstrns.length > 0;
  });
  return {
    parcelsByExtent,
    constrnsByParcel,
  };
};

export const getIntersectedParcels = ({
  parcelsByExtent,
  constrnsByParcel,
}: {
  parcelsByExtent: Feature[];
  constrnsByParcel: Record<string, Feature[]>;
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

  const constrnJstsGeoms: Record<string, JstsGeometry> = {};

  const parcelsByGeom = parcelsByExtent.filter((parcel) => {
    const parcelJstsGeom = parser.read(parcel.getGeometry());
    console.assert(parcelJstsGeom instanceof JstsPolygon);
    const parcelId: number = parcel.getId() as number;
    const parcelConstrnsByExtent = constrnsByParcel[parcelId];
    const intersects = parcelConstrnsByExtent.some((constrn) => {
      const constrnId = constrn.getId() as number;
      if (!(constrnId in constrnJstsGeoms)) {
        const geom = parser.read(constrn.getGeometry());
        const geomIsValid = JstsIsValidOp.isValid(geom);
        console.assert(
          geomIsValid,
          'Expected valid geometry, but found',
          geom,
          constrn,
        );
        constrnJstsGeoms[constrnId] = geomIsValid
          ? geom
          : JstsBufferOp.bufferOp(geom, 0);
      }
      const constrnJstsGeom = constrnJstsGeoms[constrnId];
      try {
        const matrix: IntersectionMatrix = JstsRelatedOp.relate(
          parcelJstsGeom,
          constrnJstsGeom,
        );
        return matrix.matches('T********'); // area intersects
      } catch (e) {
        console.error(
          `Some problem when intersecting ${parcelId} x ${constrnId}`,
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
  constrnsByParcel,
}: {
  parcels: Feature[];
  constrnsByParcel: Record<string, Feature[]>;
}): Generator<number> {
  const geometryFactory = new GeometryFactory();
  const parser = new OL3Parser(geometryFactory, undefined);
  const geojsonWriter = new GeoJSONWriter();
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

  const constrnsJstsGeoms: Record<string, JstsGeometry> = {};

  for (const [parcelIdx, parcel] of parcels.entries()) {
    const parcelJstsGeom = parser.read(parcel.getGeometry());
    console.assert(parcelJstsGeom instanceof JstsPolygon);
    const parcelId: number = parcel.getId() as number;
    const parcelConstrnsByExtent = constrnsByParcel[parcelId];
    const parcelIntersections: JstsGeometry[] = [];
    for (const constrn of parcelConstrnsByExtent) {
      const constrnId = constrn.getId() as number;
      if (!(constrnId in constrnsJstsGeoms)) {
        const geom = parser.read(constrn.getGeometry());
        const geomIsValid = JstsIsValidOp.isValid(geom);
        console.assert(
          geomIsValid,
          'Expected valid geometry, but found',
          geom,
          constrn,
        );
        constrnsJstsGeoms[constrnId] = geomIsValid
          ? geom
          : JstsBufferOp.bufferOp(geom, 0);
      }
      const constrnJstsGeom = constrnsJstsGeoms[constrnId];
      try {
        const intersects: boolean = JstsRelatedOp.intersects(
          parcelJstsGeom,
          constrnJstsGeom,
        );
        if (intersects) {
          parcelIntersections.push(
            JstsOverlayOp.intersection(parcelJstsGeom, constrnJstsGeom),
          );
        }
      } catch (e) {
        console.error(
          `Some problem when intersecting ${parcelId} x ${constrnId}`,
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
      } catch (_e) {
        const bufferDist = 0.00001;
        console.warn(
          `Some problem when unioning intersections of parcel ${parcelId}, increasing buffer to ${bufferDist}`,
        );
        const buferredIsection = JstsBufferOp.bufferOp(isection, bufferDist);
        parcelIntersection = JstsOverlayOp.union(
          JstsBufferOp.bufferOp(parcelIntersection, 0),
          buferredIsection,
        );
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
    const coverGeojson: GeoJSONGeometry =
      geojsonWriter.write(parcelIntersection);
    parcel.set(ParcelCoverPropName, coverGeojson, true);
    yield parcelIdx + 1;
  }
}

export const ParcelOfficialAreaM2PropName = 'nemovidParcelAreaM2';
export const ParcelCoveredAreaM2PropName = 'nemovidParcelCoverM2';
export const ParcelCoveredAreaPercPropName = 'nemovidParcelCoverPerc';
export const ParcelCoverPropName = 'nemovidParcelCover';
export const ParcelHasBuildingPropName = 'building';

export type ParcelAreas = {
  coveredAreaM2: number;
  coveredAreaPerc: number;
  cover: GeoJSONGeometry;
};

export const filterParcels = ({
  models,
  features,
  filters,
}: {
  models: { [id: string]: SimpleParcel } | null;
  features: { [id: string]: Feature } | null;
  filters: ParcelFilters;
}): {
  models: { [id: string]: SimpleParcel } | null;
  features: { [id: string]: Feature } | null;
} => {
  if (
    models == null ||
    features == null ||
    deepEqual(filters, defaultFilters)
  ) {
    return {
      models,
      features,
    };
  }
  const useAreaFilters =
    filters.maxCoveredAreaM2 !== defaultFilters.maxCoveredAreaM2 ||
    filters.maxCoveredAreaPerc !== defaultFilters.maxCoveredAreaPerc;
  const useLandUseFilter =
    filters.landUse != null &&
    !Object.values(filters.landUse).every((bool) => bool);
  const useLandTypeFilter =
    filters.landType != null &&
    !Object.values(filters.landType).every((bool) => bool);
  const filteredFeaturesList = Object.values(features).filter((feature) => {
    const areaM2 = feature.get(ParcelCoveredAreaM2PropName) as number;
    const areaPerc = feature.get(ParcelCoveredAreaPercPropName) as number;
    const hasBuilding = feature.get(ParcelHasBuildingPropName) as boolean;
    const landUseCode = feature.get('landUse') as string;
    const landTypeCode = feature.get('landType') as string;
    return (
      (!useAreaFilters ||
        (areaM2 <= filters.maxCoveredAreaM2 &&
          areaPerc <= filters.maxCoveredAreaPerc)) &&
      (filters.hasBuilding === null || hasBuilding === filters.hasBuilding) &&
      (!useLandUseFilter || filters.landUse?.[landUseCode]) &&
      (!useLandTypeFilter || filters.landType?.[landTypeCode])
    );
  });
  const filteredFeatures = filteredFeaturesList.reduce(
    (prev: Record<string, Feature>, feature) => {
      prev[feature.getId() as number] = feature;
      return prev;
    },
    {},
  );
  const filteredModels: Record<string, SimpleParcel> = Object.values(
    models,
  ).reduce((prev: Record<string, SimpleParcel>, model) => {
    if (model.id in filteredFeatures) {
      prev[model.id] = model;
    }
    return prev;
  }, {});
  return {
    features: filteredFeatures,
    models: filteredModels,
  };
};
