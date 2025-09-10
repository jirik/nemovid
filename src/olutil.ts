import deepEqual from 'deep-equal';
import MaximumInscribedCircle from 'jsts/org/locationtech/jts/algorithm/construct/MaximumInscribedCircle.js';
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
import type { GeoJSONFeature } from 'ol/format/GeoJSON';
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
  type ParcelAreas,
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
    const parcelId: string = parcel.getId() as string;
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
    const parcelId: string = parcel.getId() as string;
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
    const parcelId: string = parcel.getId() as string;
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
    const coverGeojsonFeatures = [];
    for (
      let polygonIdx = 0;
      polygonIdx < parcelIntersection.getNumGeometries();
      polygonIdx++
    ) {
      const geom = parcelIntersection.getGeometryN(polygonIdx);
      // @ts-ignore (getGeometryType() is not exported by JSTS)
      const geometryType = geom.getGeometryType();
      if (geometryType === 'Polygon') {
        const mic = new MaximumInscribedCircle(geom, 0.01);
        const narrowness: number = mic.getRadiusLine().getLength();
        const polygonFeature: GeoJSONFeature = {
          type: 'Feature',
          geometry: geojsonWriter.write(geom),
          properties: {
            narrowness,
          },
        };
        coverGeojsonFeatures.push(polygonFeature);
      } else {
        console.warn(
          `Unexpected geometry type of intersections of parcel ${parcelId}: ${geometryType}`,
        );
      }
    }

    parcel.set(ParcelCoverPropName, coverGeojsonFeatures, true);
    yield parcelIdx + 1;
  }
}

export const ParcelOfficialAreaM2PropName = 'nemovidParcelAreaM2';
export const ParcelCoverPropName = 'nemovidParcelCover';
export const ParcelHasBuildingPropName = 'building';

export type ParcelCover = GeoJSONFeature[];

export const filterParcels = ({
  models,
  features,
  filters,
  coveredAreas,
}: {
  models: { [id: string]: SimpleParcel } | null;
  features: { [id: string]: Feature } | null;
  filters: ParcelFilters;
  coveredAreas: { [id: string]: ParcelAreas } | null;
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
    (filters.maxCoveredAreaM2 !== defaultFilters.maxCoveredAreaM2 ||
      filters.maxCoveredAreaPerc !== defaultFilters.maxCoveredAreaPerc ||
      filters.minCoveredAreaM2 !== defaultFilters.minCoveredAreaM2 ||
      filters.minCoveredAreaPerc !== defaultFilters.minCoveredAreaPerc) &&
    coveredAreas;
  const useLandUseFilter =
    filters.landUse != null &&
    !Object.values(filters.landUse).every((bool) => bool);
  const useLandTypeFilter =
    filters.landType != null &&
    !Object.values(filters.landType).every((bool) => bool);
  const filteredFeaturesList = Object.values(features).filter((feature) => {
    const parcelId = feature.getId() as string;
    const areaM2 = useAreaFilters ? coveredAreas[parcelId].coveredAreaM2 : 0;
    const areaPerc = useAreaFilters
      ? coveredAreas[parcelId].coveredAreaPerc
      : 0;
    const hasBuilding = feature.get(ParcelHasBuildingPropName) as boolean;
    const landUseCode = feature.get('landUse') as string;
    const landTypeCode = feature.get('landType') as string;
    return (
      (!coveredAreas || coveredAreas[parcelId].coveredAreaM2 > 0) &&
      (!useAreaFilters ||
        (filters.minCoveredAreaM2 <= areaM2 &&
          areaM2 <= filters.maxCoveredAreaM2 &&
          filters.minCoveredAreaPerc <= areaPerc &&
          areaPerc <= filters.maxCoveredAreaPerc)) &&
      (filters.hasBuilding === null || hasBuilding === filters.hasBuilding) &&
      (!useLandUseFilter || filters.landUse?.[landUseCode]) &&
      (!useLandTypeFilter || filters.landType?.[landTypeCode])
    );
  });
  const filteredFeatures = filteredFeaturesList.reduce(
    (prev: Record<string, Feature>, feature) => {
      prev[feature.getId() as string] = feature;
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
