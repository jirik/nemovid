import type { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
} from 'ol/format/GeoJSON';
import WFS from 'ol/format/WFS';
import { assertIsDefined } from './assert.ts';
import settings from './settings.ts';
import type { Owner, TitleDeed, Zoning } from './store.ts';
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

export const loadParcelInfos = async ({ parcels }: { parcels: Feature[] }) => {
  assertIsDefined(settings.parcelRestUrlTemplate);
  const parcelIdsString = parcels.map(getParcelKnId).join(',');
  const infoUrl = fillTemplate(settings.parcelRestUrlTemplate, {
    parcelIdsString,
  });
  const resp = await fetch(infoUrl);
  const parcelCollection: GeoJSONFeatureCollection =
    (await resp.json()) as GeoJSONFeatureCollection;
  const parcelFeatures: GeoJSONFeature[] =
    parcelCollection.features as GeoJSONFeature[];
  for (const parcel of parcels) {
    const parcelKnId = getParcelKnId(parcel);
    const parcelFeature = parcelFeatures.find(
      (f) => f.properties.par_id === parcelKnId,
    );
    assertIsDefined(parcelFeature);
    const zoning = getParcelZoning(parcel);
    const owners = parseOwners(parcelFeature.properties.vlastnici, {
      contextUrl: settings.parcelRestUrlTemplate,
    });
    console.assert(owners.length > 0);
    const titleDeedNumber = parcelFeature.properties.lv as number;
    console.assert(typeof titleDeedNumber === 'number');
    if (!(titleDeedNumber in zoning.titleDeeds)) {
      zoning.titleDeeds[titleDeedNumber] = {
        number: titleDeedNumber,
        owners,
        zoning,
      };
    }
    parcel.set(ParcelTitleDeedPropName, zoning.titleDeeds[titleDeedNumber], true);
  }
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

export const getParcelTitleDeed = (parcel: Feature): TitleDeed | null => {
  return parcel.get(ParcelTitleDeedPropName) || null;
};

export const getParcelZoning = (parcel: Feature): Zoning => {
  const zoning: Zoning = parcel.get(ParcelZoningPropName);
  assertIsDefined(zoning);
  return zoning;
};

export const getParcelId = (parcel: Feature): string => {
  return parcel.getId() as string;
};

export const getParcelKnId = (parcel: Feature): number => {
  return Number.parseInt(getParcelId(parcel).split('.')[1]);
};

export const getParcelLabel = (parcel: Feature): string => {
  const label = parcel.get('label');
  console.assert(typeof label === 'string');
  return label;
};

export const ParcelTitleDeedPropName = 'statkarParcelTitleDeed';
export const ParcelZoningPropName = 'statkarParcelZoning';
