import '@mantine/core/styles.css';
import 'ol/ol.css';
import './App.css';
import { MantineProvider, createTheme } from '@mantine/core';
import type { Feature } from 'ol';
import type { FeatureLike } from 'ol/Feature';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import * as olExtent from 'ol/extent';
import { GeoJSON } from 'ol/format';
import type { GeoJSONFeatureCollection } from 'ol/format/GeoJSON';
import type { Geometry } from 'ol/geom';
import { fromExtent } from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import { register } from 'ol/proj/proj4';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style } from 'ol/style';
import proj4 from 'proj4';
import { useEffect, useRef } from 'react';
import { MIN_MAIN_EXTENT_RADIUS_PX } from '../constants.ts';
import InfoBar from './InfoBar.tsx';
import DragAndDrop from './MapDragAndDrop.ts';
import {
  codeListsLoaded,
  fileOpened,
  mapPointerMove,
  parcelAreasLoaded,
  parcelAreasProgress,
  parcelsLoaded,
  titleDeedsLoaded,
} from './actions.ts';
import { assertFeature, assertIsDefined } from './assert.ts';
import {
  fetchCodeList,
  getParcelsByExtent,
  getTitleDeeds,
  parcelsGmlToFeatures,
  updateCodeListProp,
} from './cuzk.ts';
import {
  ParcelHasBuildingPropName,
  assertMinExtentRadius,
  loadTileLayerFromWmtsCapabilities,
} from './olutil.ts';
import { postFile } from './server/files';
import { createClient as createFilesClient } from './server/files/client';
import { dxfToGeojson } from './server/ogr2ogr';
import { createClient as createOgr2ogrClient } from './server/ogr2ogr/client';
import { fixGeometries } from './server/qgis';
import { createClient as createQgisClient } from './server/qgis/client';
import settings from './settings.ts';
import {
  type State,
  getAreConstrnFeaturesLoaded,
  getCovers,
  getFilteredParcels,
  getMainExtentFeatures,
  getMainExtents,
  useAppStore,
} from './store.ts';
import type { IncomingMessage, OutgoingMessage } from './worker.ts';

const theme = createTheme({
  /** Put your mantine theme override here */
});

proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
);
register(proj4);

const App = () => {
  const extentFeatures = useAppStore(getMainExtentFeatures);
  const areConstrnFeaturesLoaded = useAppStore(getAreConstrnFeaturesLoaded);
  const mainExtents = useAppStore(getMainExtents);
  const constrnFeatures = useAppStore((state) => state.constrnFeatures);
  const highlightedCoverId = useAppStore((state) => state.highlightedCover);
  const highlightedParcelId = useAppStore((state) => state.highlightedParcel);
  const parcels = useAppStore(getFilteredParcels).features;
  const covers = useAppStore(getCovers);
  const mapRef = useRef<OlMap | null>(null);
  const constrnLayerRef = useRef<WebGLVectorLayer | null>(null);
  const constrnExtentLayerRef = useRef<VectorLayer | null>(null);
  const coverLayerRef = useRef<WebGLVectorLayer | null>(null);
  const parcelLayerRef = useRef<WebGLVectorLayer | null>(null);
  const codeListsRef = useRef<State['codeLists']>(null);

  useEffect(() => {
    (async () => {
      if (mapRef.current) {
        if (!mapRef.current.getTarget()) {
          mapRef.current.setTarget('map');
        }
        return;
      }

      const constrnStrokeColor = '#c513cd';

      const constrnLayer = new WebGLVectorLayer({
        source: new VectorSource(),
        style: {
          'stroke-color': constrnStrokeColor,
          'stroke-width': 1,
          'fill-color': 'rgba(255,255,255,0.4)',
        },
      });
      constrnLayerRef.current = constrnLayer;

      const extentStyle = [
        new Style({
          stroke: new Stroke({
            color: '#ffffffaa',
            width: 5,
          }),
          zIndex: 1,
        }),
        new Style({
          stroke: new Stroke({
            color: constrnStrokeColor,
            width: 2,
            lineDash: [5, 5],
          }),
          zIndex: 2,
        }),
      ];

      const parcelLayer = new WebGLVectorLayer({
        source: new VectorSource(),
        style: [
          {
            filter: ['==', ['var', 'highlightedId'], ['id']],
            style: {
              'stroke-color': '#ffff00',
              'stroke-width': 4,
              'fill-color': 'rgba(255,255,000,0.4)',
            },
          },
          {
            else: true,
            style: {
              'stroke-color': '#ffff00',
              'stroke-width': 1,
              'fill-color': 'rgba(255,255,000,0.4)',
            },
          },
        ],
        variables: {
          highlightedId: -1,
        },
      });
      parcelLayerRef.current = parcelLayer;

      const constrnExtentLayer = new VectorLayer({
        source: new VectorSource(),
        style: extentStyle,
        updateWhileAnimating: true,
        updateWhileInteracting: true,
      });
      constrnExtentLayerRef.current = constrnExtentLayer;

      const coverStrokeColor = '#00aa00';

      const coverLayer = new WebGLVectorLayer({
        source: new VectorSource(),
        style: [
          {
            filter: ['==', ['var', 'highlightedId'], ['id']],
            style: {
              'stroke-color': coverStrokeColor,
              'stroke-width': 4,
              'fill-color': 'rgba(00,200,00,0.4)',
            },
          },
          {
            else: true,
            style: {
              'stroke-color': coverStrokeColor,
              'stroke-width': 1,
              'fill-color': 'rgba(00,200,00,0.4)',
            },
          },
        ],
        variables: {
          highlightedId: -1,
        },
      });
      coverLayerRef.current = coverLayer;

      const map = new OlMap({
        target: 'map',
        layers: [],
        view: new View({
          projection: 'EPSG:5514',
        }),
      });
      mapRef.current = map;

      const tileLayer = await loadTileLayerFromWmtsCapabilities({
        url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/WMTS?request=GetCapabilities',
        layer: 'ORTOFOTO',
        // url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM/MapServer/WMTS?request=GetCapabilities',
        // layer: 'ZTM',
        matrixSet: 'default028mm',
      });
      const tileLayer2 = await loadTileLayerFromWmtsCapabilities({
        url: 'https://services.cuzk.cz/wmts/local-km-wmts-jtsk.asp?request=GetCapabilities&service=WMTS',
        layer: 'KN_I',
        matrixSet: 'KN_I',
      });
      const tileLayerExtent = tileLayer.getExtent();
      assertIsDefined(tileLayerExtent);

      map.getView().fit(tileLayerExtent);

      map.addLayer(tileLayer);
      map.addLayer(tileLayer2);
      map.addLayer(parcelLayer);
      map.addLayer(constrnExtentLayer);
      map.addLayer(constrnLayer);
      map.addLayer(coverLayer);

      map.getView().on('change:resolution', (evt) => {
        const view = evt.target as View;
        const resolution = view.getResolution();
        assertIsDefined(resolution);
        const geometryFn = (feature: FeatureLike): Geometry | undefined => {
          const geom = feature.getGeometry();
          const extent = geom?.getExtent();
          assertIsDefined(extent);
          const minExtentRadius = MIN_MAIN_EXTENT_RADIUS_PX * resolution;
          const newExtent = assertMinExtentRadius({
            extent: extent.concat(),
            minExtentRadius,
          });
          return fromExtent(newExtent);
        };
        for (const style of extentStyle) {
          style.setGeometry(geometryFn);
        }
      });
    })();
    return () => {
      if (mapRef.current?.getTarget()) {
        mapRef.current?.setTarget(undefined);
      }
    };
  }, []);

  useEffect(() => {
    assertIsDefined(mapRef.current);
    assertIsDefined(constrnLayerRef.current);
    assertIsDefined(constrnExtentLayerRef.current);
    const map = mapRef.current;
    const dnd = new DragAndDrop();
    dnd.on('addfile', async (event) => {
      const file = event.file;
      const filename = file.name.toLowerCase();
      let geojsonString: string | undefined;
      if (filename.endsWith('.geojson')) {
        geojsonString = await file.text();
      } else if (filename.endsWith('.dxf')) {
        fileOpened({ name: event.file.name, features: null });
        const filesClient = createFilesClient({
          baseUrl: settings.publicUrl,
        });
        const dxfResp = await postFile({ body: { file }, client: filesClient });
        assertIsDefined(dxfResp.data);
        const dxfUrl = dxfResp.data.url;

        const ogr2ogrClient = createOgr2ogrClient({
          baseUrl: settings.publicUrl,
        });
        const unsafeGeojsonResp = await dxfToGeojson({
          body: { file_url: dxfUrl },
          client: ogr2ogrClient,
        });
        assertIsDefined(unsafeGeojsonResp.data);
        const unsafeGeojsonUrl = unsafeGeojsonResp.data.file_url;

        const qgisClient = createQgisClient({
          baseUrl: settings.publicUrl,
        });
        const geojsonUrlResp = await fixGeometries({
          body: { file_url: unsafeGeojsonUrl },
          client: qgisClient,
        });
        assertIsDefined(geojsonUrlResp.data);
        const geojsonUrl = geojsonUrlResp.data.file_url;

        await new Promise((r) => setTimeout(r, 2000));
        geojsonString = await fetch(geojsonUrl).then((r) => r.text());
      }
      const geojsonFormat = new GeoJSON({
        dataProjection: 'EPSG:5514',
      });
      const newFeatures = geojsonFormat.readFeatures(geojsonString);
      for (const [idx, feature] of newFeatures.entries()) {
        feature.setId(idx + 1);
      }
      fileOpened({ name: event.file.name, features: newFeatures });
    });
    map.addInteraction(dnd);
    return () => {
      map.removeInteraction(dnd);
    };
  }, []);

  useEffect(() => {
    assertIsDefined(mapRef.current);
    assertIsDefined(constrnLayerRef.current);
    assertIsDefined(constrnExtentLayerRef.current);
    assertIsDefined(parcelLayerRef.current);
    assertIsDefined(coverLayerRef.current);
    const map = mapRef.current;
    const constrnLayer = constrnLayerRef.current;
    const constrnExtentLayer = constrnExtentLayerRef.current;
    const parcelLayer = parcelLayerRef.current;
    const coverLayer = coverLayerRef.current;
    const constrnSource = constrnLayer.getSource();
    assertIsDefined(constrnSource);
    const constrnExtentSource = constrnExtentLayer.getSource();
    assertIsDefined(constrnExtentSource);
    const parcelSource = parcelLayer.getSource();
    assertIsDefined(parcelSource);
    const coverSource = coverLayer.getSource();
    assertIsDefined(coverSource);

    // clear features
    constrnSource.clear(true);
    constrnExtentSource.clear(true);
    parcelSource.clear();
    coverSource.clear();
    map.renderSync();
    if (!constrnFeatures || !extentFeatures) {
      return;
    }

    // show features
    constrnSource.addFeatures(constrnFeatures);

    // show feature extents
    constrnExtentSource.addFeatures(extentFeatures);

    // zoom
    const constrnExtent = constrnExtentSource.getExtent();
    if (!olExtent.isEmpty(constrnExtent)) {
      map.getView().fit(constrnExtent, {
        duration: 2000,
        padding: [
          MIN_MAIN_EXTENT_RADIUS_PX * 2,
          MIN_MAIN_EXTENT_RADIUS_PX * 2,
          MIN_MAIN_EXTENT_RADIUS_PX * 2,
          MIN_MAIN_EXTENT_RADIUS_PX * 2,
        ],
      });
    }
  }, [constrnFeatures, extentFeatures]);

  useEffect(() => {
    (async () => {
      if (!areConstrnFeaturesLoaded) {
        return;
      }
      assertIsDefined(constrnLayerRef.current);
      const constrnLayer = constrnLayerRef.current;
      const constrnSource = constrnLayer.getSource();
      assertIsDefined(constrnSource);
      assertIsDefined(mainExtents);
      if (mainExtents.length > 0) {
        if (codeListsRef.current == null) {
          const landUseCodeList = await fetchCodeList(
            'https://services.cuzk.gov.cz/registry/codelist/LandUseValue/LandUseValue.json',
          );
          const landTypeCodeList = await fetchCodeList(
            'https://services.cuzk.gov.cz/registry/codelist/LandTypeValue/LandTypeValue.json',
          );
          codeListsRef.current = {
            landUse: landUseCodeList,
            landType: landTypeCodeList,
          };
          codeListsLoaded(codeListsRef.current);
        }
        const codeLists = codeListsRef.current;
        assertIsDefined(codeLists);
        const results = await Promise.all(
          mainExtents.map((e) => getParcelsByExtent({ extent: e })),
        );
        const parcelGroups = results.map((res) =>
          parcelsGmlToFeatures({ gml: res }),
        );
        const parcelsDict: Record<string, Feature> = {};
        for (const parcelGroup of parcelGroups) {
          for (const parcel of parcelGroup) {
            const inspireId = parcel.getId() as string;
            console.assert(typeof inspireId === 'string');
            const parcelId = Number.parseInt(inspireId.split('.')[1]);
            console.assert(typeof parcelId === 'number');
            parcel.setId(parcelId);
            if (!(parcelId in parcelsDict)) {
              parcelsDict[parcelId] = parcel;
              assertIsDefined(codeLists.landUse);
              updateCodeListProp({
                feature: parcel,
                codeList: codeLists.landUse,
                propName: 'landUse',
              });
              assertIsDefined(codeLists.landType);
              updateCodeListProp({
                feature: parcel,
                codeList: codeLists.landType,
                propName: 'landType',
              });
              const hasBuilding = !!parcel.get('building');
              parcel.set(ParcelHasBuildingPropName, hasBuilding, true);
              parcel.unset('referencePoint', true);
            }
          }
        }

        const format = new GeoJSON();
        const constrns: GeoJSONFeatureCollection = format.writeFeaturesObject(
          constrnSource.getFeatures(),
        );
        const parcels: GeoJSONFeatureCollection = format.writeFeaturesObject(
          Object.values(parcelsDict),
        );

        const message: IncomingMessage = {
          constrns,
          parcels,
        };
        const worker = new Worker(new URL('./worker.ts', import.meta.url));

        worker.onmessage = async (event) => {
          const msg = event.data as OutgoingMessage;
          if (msg.type === 'coveredParcels') {
            const parcels = format.readFeatures(msg.parcels);
            parcelsLoaded({ parcels });
            if (settings.parcelRestUrlTemplate != null) {
              getTitleDeeds({ parcels }).then(({ titleDeeds, owners }) => {
                titleDeedsLoaded({ titleDeeds, owners });
              });
            }
          } else if (msg.type === 'parcelAreasProgress') {
            const { processedParcels } = msg;
            parcelAreasProgress(processedParcels);
          } else {
            parcelAreasLoaded({ parcelAreas: msg.parcelAreas });
          }
        };

        worker.postMessage(message);
      } else {
        parcelsLoaded({ parcels: [] });
        parcelAreasLoaded({ parcelAreas: {} });
      }
    })();
  }, [areConstrnFeaturesLoaded, mainExtents]);

  useEffect(() => {
    assertIsDefined(parcelLayerRef.current);
    const parcelLayer = parcelLayerRef.current;
    const parcelSource = parcelLayer.getSource();
    assertIsDefined(parcelSource);
    parcelSource.clear(true);
    parcelSource.addFeatures(Object.values(parcels || {}));
  }, [parcels]);

  useEffect(() => {
    assertIsDefined(coverLayerRef.current);
    const coverLayer = coverLayerRef.current;
    const coverSource = coverLayer.getSource();
    assertIsDefined(coverSource);
    coverSource.clear(true);
    coverSource.addFeatures(covers);
  }, [covers]);

  useEffect(() => {
    assertIsDefined(mapRef.current);
    assertIsDefined(coverLayerRef.current);
    assertIsDefined(parcelLayerRef.current);
    const map = mapRef.current;
    const coverLayer = coverLayerRef.current;
    const parcelLayer = parcelLayerRef.current;

    map.on('pointermove', (evt) => {
      if (evt.dragging) {
        return;
      }
      const pixel = evt.pixel;
      const feature = map.forEachFeatureAtPixel(pixel, (feature) => feature, {
        layerFilter: (l) => l === coverLayer,
      });
      if (feature) {
        assertFeature(feature);
      }
      const parcel = map.forEachFeatureAtPixel(pixel, (feature) => feature, {
        layerFilter: (l) => l === parcelLayer,
      });
      if (parcel) {
        assertFeature(parcel);
      }
      mapPointerMove({
        highlightedParcel: parcel,
        highlightedCover: feature,
      });
    });
  }, []);

  useEffect(() => {
    assertIsDefined(parcelLayerRef.current);
    const parcelLayer = parcelLayerRef.current;
    parcelLayer.updateStyleVariables({
      highlightedId: highlightedParcelId == null ? -1 : highlightedParcelId,
    });
  }, [highlightedParcelId]);

  useEffect(() => {
    assertIsDefined(coverLayerRef.current);
    const coverLayer = coverLayerRef.current;
    coverLayer.updateStyleVariables({
      highlightedId: highlightedCoverId == null ? -1 : highlightedCoverId,
    });
  }, [highlightedCoverId]);
  return (
    <MantineProvider theme={theme}>
      <main>
        <div id="map" />
        <InfoBar />
      </main>
    </MantineProvider>
  );
};

export default App;
