import type { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
} from 'ol/format/GeoJSON';
import WFS from 'ol/format/WFS';
import { assertIsDefined } from './assert.ts';
import settings from './settings.ts';
import type { Owner, SimpleTitleDeed, SimpleZoning } from './store.ts';
import { fillTemplate } from './template.ts';

export const getParcelsByExtent = async ({ extent }: { extent: Extent }) => {
  const res = await fetch(
    // `http://services.cuzk.cz/wfs/inspire-CPX-wfs.asp?service=wfs&version=2.0.0&request=getFeature&BBOX=${extent.join(',')}&srsName=urn:ogc:def:crs:EPSG::5514&typeNames=CadastralParcel`,
    `https://services.cuzk.cz/wfs/inspire-CP-wfs.asp?service=wfs&version=2.0.0&request=getFeature&BBOX=${extent.join(',')}&srsName=urn:ogc:def:crs:EPSG::5514&typeNames=CadastralParcel`,
  );
  const resTxt = await res.text();
  const domParser = new window.DOMParser();
  const resXml = domParser.parseFromString(resTxt, 'text/xml');
  const numberMatched = resXml.documentElement.getAttribute('numberMatched');
  const numberReturned = resXml.documentElement.getAttribute('numberReturned');
  if (numberMatched !== numberReturned) {
    throw Error(
      `Počet nalezených (${numberMatched}) a vrácených (${numberReturned}) objektů se liší.`,
    );
  }
  return resXml;
};

export const parcelsGmlToFeatures = ({ gml }: { gml: Document }): Feature[] => {
  const wfsFormat = new WFS({ version: '2.0.0' });
  const features = wfsFormat.readFeatures(gml);
  for (const feature of features) {
    feature.setGeometryName('geometry');
  }
  return features;
};

export const getTitleDeeds = async ({ parcels }: { parcels: Feature[] }) => {
  assertIsDefined(settings.parcelRestUrlTemplate);
  const parcelIdsString = parcels.map((p) => p.getId()).join(',');
  const infoUrl = fillTemplate(settings.parcelRestUrlTemplate, {
    parcelIdsString,
  });
  const resp = await fetch(infoUrl);
  const parcelCollection: GeoJSONFeatureCollection =
    (await resp.json()) as GeoJSONFeatureCollection;
  const parcelFeatures: GeoJSONFeature[] =
    parcelCollection.features as GeoJSONFeature[];
  const result: Record<string, SimpleTitleDeed> = {};
  for (const parcel of parcels) {
    const parcelId = parcel.getId() as number;
    const parcelFeature = parcelFeatures.find(
      (f) => f.properties.par_id === parcelId,
    );
    assertIsDefined(parcelFeature);
    const zoningId = getParcelZoning(parcel).id;
    const owners = parseOwners(parcelFeature.properties.vlastnici, {
      contextUrl: settings.parcelRestUrlTemplate,
    });
    console.assert(owners.length > 0);
    const titleDeedNumber = parcelFeature.properties.lv as number;
    console.assert(typeof titleDeedNumber === 'number');
    const titleDeedId = parcelFeature.properties.tel_id as number;
    console.assert(typeof titleDeedId === 'number');
    if (!(titleDeedId in result)) {
      result[titleDeedId] = {
        id: titleDeedId,
        number: titleDeedNumber,
        owners,
        zoning: zoningId,
        parcels: [],
      };
    }
    result[titleDeedId].parcels.push(parcelId);
  }
  return result;
};

const parseOwners = (
  str: string,
  { contextUrl }: { contextUrl: string },
): Owner[] => {
  const matches = [...str.matchAll(/href="(?<url>.*?)".*?>(?<label>.*?)<\//g)];
  return matches.map((match) => {
    const owner: Owner = match.groups as Owner;
    return {
      ...owner,
      url: new URL(owner.url, contextUrl).href,
    };
  });
};

export const getParcelLabel = (parcel: Feature): string => {
  const label = parcel.get('label');
  console.assert(typeof label === 'string');
  return label;
};

export const getParcelZoning = (
  parcel: Feature,
): Omit<SimpleZoning, 'titleDeeds' | 'parcels'> => {
  const url = parcel.get('zoning')['xlink:href'] as string;
  const title = parcel.get('zoning')['xlink:title'] as string;
  const id: string = URL.parse(url)?.searchParams.get('Id') as string;
  assertIsDefined(id);
  return {
    id,
    title,
  };
};
