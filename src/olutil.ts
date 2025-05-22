import { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import * as olExtent from 'ol/extent';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import { fromExtent } from 'ol/geom/Polygon';
import TileLayer from 'ol/layer/Tile';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import { assertIsDefined } from './assert.ts';

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
  assertIsDefined(bboxDef);

  const bboxExtent = bboxDef?.extent as Extent;
  assertIsDefined(bboxExtent);

  const tileLayer = new TileLayer({
    opacity: 1,
    source: new WMTS(options),
    extent: bboxExtent,
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
    let newExtent = featureExtent
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
