import type { Feature } from 'ol';
import type { Extent } from 'ol/extent';
import WFS from 'ol/format/WFS';

export const getParcelsByExtent = async ({ extent }: { extent: Extent }) => {
  const res = await fetch(
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
