import type { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
} from 'ol/format/GeoJSON';
import WFS from 'ol/format/WFS';
import { assertIsDefined } from './assert.ts';
import { type CodeList, NullItem } from './codeList.ts';
import settings from './settings.ts';
import type {
  Parcel,
  SimpleOwner,
  SimpleTitleDeed,
  SimpleZoning,
} from './store.ts';
import { fillTemplate } from './template.ts';

export const getParcelsByExtent = async ({ extent }: { extent: Extent }) => {
  const res = await fetch(
    `http://services.cuzk.cz/wfs/inspire-CPX-wfs.asp?service=wfs&version=2.0.0&request=getFeature&BBOX=${extent.join(',')}&srsName=urn:ogc:def:crs:EPSG::5514&typeNames=CadastralParcel`,
    // `https://services.cuzk.cz/wfs/inspire-CP-wfs.asp?service=wfs&version=2.0.0&request=getFeature&BBOX=${extent.join(',')}&srsName=urn:ogc:def:crs:EPSG::5514&typeNames=CadastralParcel`,
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

export const getTitleDeeds = async ({
  parcels,
}: { parcels: Feature[] }): Promise<{
  titleDeeds: Record<string, SimpleTitleDeed>;
  owners: Record<string, SimpleOwner>;
}> => {
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
  const allTitleDeeds: Record<string, SimpleTitleDeed> = {};
  const allOwners: Record<string, SimpleOwner> = {};
  for (const parcel of parcels) {
    const parcelId = parcel.getId() as number;
    const parcelFeature = parcelFeatures.find(
      (f) => f.properties.par_id === parcelId,
    );
    assertIsDefined(parcelFeature);
    const zoningId = getParcelZoning(parcel).id;
    const owners = parseOwners(parcelFeature.properties.vlastnici, {
      contextUrl: settings.parcelRestUrlTemplate,
      allOwners: allOwners,
    });
    console.assert(owners.length > 0);
    const titleDeedNumber = parcelFeature.properties.lv as number;
    console.assert(typeof titleDeedNumber === 'number');
    const titleDeedId = parcelFeature.properties.tel_id as number;
    console.assert(typeof titleDeedId === 'number');
    if (!(titleDeedId in allTitleDeeds)) {
      allTitleDeeds[titleDeedId] = {
        id: titleDeedId,
        number: titleDeedNumber,
        owners: owners.map((o) => o.id),
        zoning: zoningId,
        parcels: [],
      };
    }
    allTitleDeeds[titleDeedId].parcels.push(parcelId);
  }
  return {
    titleDeeds: allTitleDeeds,
    owners: allOwners,
  };
};

const parseOwners = (
  str: string,
  {
    contextUrl,
    allOwners,
  }: { contextUrl: string; allOwners: Record<string, SimpleOwner> },
): SimpleOwner[] => {
  const matches = [...str.matchAll(/href="(?<url>.*?)".*?>(?<label>.*?)<\//g)];
  return matches.map((match) => {
    const ownerLink = match.groups as Pick<SimpleOwner, 'label'> & {
      url: string;
    };
    const url = new URL(ownerLink.url, contextUrl);
    const id = url.searchParams.get('ID');
    assertIsDefined(id);
    if (!(id in allOwners)) {
      allOwners[id] = {
        id: Number.parseInt(id),
        label: ownerLink.label,
        titleDeeds: [],
      };
    }
    const result = allOwners[id];
    return result;
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

export const sortParcelByLabel = (a: Parcel, b: Parcel) => {
  const aParts = (a.label as string)
    .split(/\D+/)
    .map((s) => Number.parseInt(s));
  const bParts = (b.label as string)
    .split(/\D+/)
    .map((s) => Number.parseInt(s));
  return aParts[0] - bParts[0] || aParts[1] - bParts[1];
};

type CodeListResponse = {
  codelist: {
    id: string;
    label: {
      text: string;
    };
    containeditems: {
      value: {
        id: string;
        label: {
          text: string;
        };
      };
    }[];
  };
};

export const fetchCodeList = async (url: string) => {
  const resp = await fetch(url);
  const respJson: CodeListResponse = (await resp.json()) as CodeListResponse;
  const listId = respJson.codelist.id;
  const values = respJson.codelist.containeditems.reduce(
    (prev: CodeList['values'], item) => {
      const code = getItemCodeFromId({
        itemId: item.value.id,
        codeListId: listId,
      });
      prev[code] = {
        id: item.value.id,
        code,
        label: item.value.label.text,
      };
      return prev;
    },
    {},
  );
  console.assert(!(NullItem.code in values));
  values[NullItem.code] = {
    ...NullItem,
    id: `${listId}${NullItem.code}`,
  };
  const result: CodeList = {
    id: listId,
    label: respJson.codelist.label.text,
    values: values,
  };
  return result;
};

const getItemCodeFromId = (
  opts:
    | { itemId: string; codeListId: string }
    | { itemId: string; codeList: CodeList },
) => {
  const { itemId } = opts;
  const codeListId = 'codeListId' in opts ? opts.codeListId : opts.codeList.id;
  console.assert(itemId.startsWith(codeListId));
  const code = itemId.substring(codeListId.length);
  if ('codeList' in opts) {
    console.assert(code in opts.codeList.values);
  }
  return code;
};

export const updateCodeListProp = ({
  feature,
  propName,
  codeList,
}: { feature: Feature; propName: string; codeList: CodeList }) => {
  const valueObj = feature.get(propName) as
    | { 'xlink:href': string }
    | { nilReason: string };
  let itemCode: string = NullItem.code;
  if ('xlink:href' in valueObj) {
    const itemId = valueObj['xlink:href'].replace(
      'services.cuzk.cz',
      'services.cuzk.gov.cz',
    );
    itemCode = getItemCodeFromId({
      itemId: itemId,
      codeList,
    });
  }
  feature.set(propName, itemCode, true);
};
