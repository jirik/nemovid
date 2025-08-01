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
import InfoBar from './InfoBar.tsx';
import DragAndDrop from './MapDragAndDrop.ts';
import {
  codeListsLoaded,
  fileOpened,
  mapPointerMove,
  parcelCoverLoaded,
  parcelCoverProgress,
  parcelsLoaded,
  titleDeedsLoaded,
} from './actions.ts';
import { assertFeature, assertIsDefined } from './assert.ts';
import { MIN_MAIN_EXTENT_RADIUS_PX } from './constants.ts';
import {
  fetchCodeList,
  getParcelsByExtent,
  getTitleDeeds,
  parcelsGmlToFeatures,
  updateCodeListProp,
} from './cuzk.ts';
import {
  ParcelHasBuildingPropName,
  ParcelOfficialAreaM2PropName,
  assertMinExtentRadius,
  loadTileLayerFromWmtsCapabilities,
} from './olutil.ts';
import { postFiles } from './server/files';
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
import { getParcelStyle } from './style.ts';
import type { IncomingMessage, OutgoingMessage } from './worker.ts';

const theme = createTheme({
  /** Put your mantine theme override here */
});

proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
);
register(proj4);

type ContrnLayers = {
  fill: WebGLVectorLayer;
  stroke: WebGLVectorLayer;
};

const App = () => {
  const extentFeatures = useAppStore(getMainExtentFeatures);
  const areConstrnFeaturesLoaded = useAppStore(getAreConstrnFeaturesLoaded);
  const mainExtents = useAppStore(getMainExtents);
  const constrnFeatures = useAppStore((state) => state.constrnFeatures);
  const highlightedParcelId = useAppStore((state) => state.highlightedParcel);
  const parcels = useAppStore(getFilteredParcels).features;
  const covers = useAppStore(getCovers);
  const mapRef = useRef<OlMap | null>(null);
  const constrnLayersRef = useRef<ContrnLayers | null>(null);
  const constrnExtentLayerRef = useRef<VectorLayer | null>(null);
  const coverLayerRef = useRef<WebGLVectorLayer | null>(null);
  const parcelLayerRef = useRef<WebGLVectorLayer | null>(null);
  const codeListsRef = useRef<State['codeLists']>(null);
  const mapLayersRef = useAppStore((state) => state.mapLayers);

  useEffect(() => {
    (async () => {
      if (mapRef.current) {
        if (!mapRef.current.getTarget()) {
          mapRef.current.setTarget('map');
        }
        return;
      }

      const constrnStrokeColor = '#c513cd';

      const constrnSource = new VectorSource();
      const constrnFillLayer = new WebGLVectorLayer({
        properties: {
          id: 'constrnFill',
        },
        source: constrnSource,
        style: {
          'fill-color': 'rgba(255,255,255,0.4)',
        },
      });
      const constrnStrokeLayer = new WebGLVectorLayer({
        properties: {
          id: 'constrnStroke',
        },
        source: constrnSource,
        style: {
          'stroke-color': constrnStrokeColor,
          'stroke-width': 2,
        },
      });
      constrnLayersRef.current = {
        fill: constrnFillLayer,
        stroke: constrnStrokeLayer,
      };

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
        properties: {
          id: 'parcels',
        },
        source: new VectorSource(),
        style: getParcelStyle(),
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
        properties: {
          id: 'covers',
        },
        source: new VectorSource(),
        style: [
          {
            filter: ['==', ['var', 'highlightedParcelId'], ['get', 'parcelId']],
            style: {
              'stroke-color': coverStrokeColor,
              'stroke-width': 4,
              'stroke-offset': 2,
              'fill-color': 'rgba(00,200,00,0.4)',
            },
          },
          {
            else: true,
            style: {
              'stroke-color': coverStrokeColor,
              'stroke-width': 1,
              'stroke-offset': 0.5,
              'fill-color': 'rgba(00,200,00,0.4)',
            },
          },
        ],
        variables: {
          highlightedParcelId: '',
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
      map.addLayer(constrnExtentLayer);
      map.addLayer(constrnFillLayer);
      map.addLayer(parcelLayer);
      map.addLayer(coverLayer);
      map.addLayer(constrnStrokeLayer);

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
    assertIsDefined(constrnLayersRef.current);
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
        const dxfResp = await postFiles({
          body: { files: [file] },
          query: { label: 'dxf' },
          client: filesClient,
        });
        assertIsDefined(dxfResp.data);
        const dxfUrl = dxfResp.data.files[0].url;

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
      const constrnFeatures = geojsonFormat.readFeatures(geojsonString);
      for (const [idx, feature] of constrnFeatures.entries()) {
        feature.setId(idx + 1);
      }
      fileOpened({ name: event.file.name, features: constrnFeatures });
    });
    map.addInteraction(dnd);
    return () => {
      map.removeInteraction(dnd);
    };
  }, []);

  useEffect(() => {
    assertIsDefined(mapRef.current);
    assertIsDefined(constrnLayersRef.current);
    assertIsDefined(constrnExtentLayerRef.current);
    assertIsDefined(parcelLayerRef.current);
    assertIsDefined(coverLayerRef.current);
    const map = mapRef.current;
    const constrnLayers = constrnLayersRef.current;
    const constrnExtentLayer = constrnExtentLayerRef.current;
    const parcelLayer = parcelLayerRef.current;
    const coverLayer = coverLayerRef.current;
    const constrnSource = constrnLayers.fill.getSource();
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
      assertIsDefined(constrnLayersRef.current);
      const constrnLayers = constrnLayersRef.current;
      const constrnSource = constrnLayers.fill.getSource();
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
            const parcelId = inspireId.split('.')[1];
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
              const officialArea = Number.parseInt(
                parcel.get('areaValue')._content_,
              );
              parcel.set(ParcelOfficialAreaM2PropName, officialArea, true);
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
        const worker = new Worker(new URL('./worker.ts', import.meta.url), {
          type: 'module',
        });

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
          } else if (msg.type === 'parcelCoverProgress') {
            const { processedParcels } = msg;
            parcelCoverProgress(processedParcels);
          } else {
            parcelCoverLoaded({ parcelCover: msg.parcelCover });
          }
        };

        worker.postMessage(message);
      } else {
        parcelsLoaded({ parcels: [] });
        parcelCoverLoaded({ parcelCover: {} });
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
    assertIsDefined(parcelLayerRef.current);
    const map = mapRef.current;
    const parcelLayer = parcelLayerRef.current;

    map.on('pointermove', (evt) => {
      if (evt.dragging) {
        return;
      }
      const pixel = evt.pixel;
      const parcel = map.forEachFeatureAtPixel(pixel, (feature) => feature, {
        layerFilter: (l) => l === parcelLayer,
      });
      if (parcel) {
        assertFeature(parcel);
      }
      mapPointerMove({
        highlightedParcel: parcel,
      });
    });
  }, []);

  useEffect(() => {
    assertIsDefined(parcelLayerRef.current);
    const parcelLayer = parcelLayerRef.current;
    parcelLayer.updateStyleVariables({
      highlightedId: highlightedParcelId == null ? '' : highlightedParcelId,
    });
  }, [highlightedParcelId]);

  useEffect(() => {
    assertIsDefined(coverLayerRef.current);
    const coverLayer = coverLayerRef.current;
    coverLayer.updateStyleVariables({
      highlightedParcelId:
        highlightedParcelId == null ? '' : highlightedParcelId,
    });
  }, [highlightedParcelId]);

  useEffect(() => {
    assertIsDefined(coverLayerRef.current);
    assertIsDefined(parcelLayerRef.current);
    assertIsDefined(constrnLayersRef.current);
    assertIsDefined(mapRef.current);
    const map = mapRef.current;
    const mapLayers = map.getLayers().getArray();
    for (const [id, layer] of Object.entries(mapLayersRef)) {
      const olLayer = mapLayers.find((l) => l.get('id') === id);
      if (olLayer && olLayer.getVisible() !== layer.visible) {
        olLayer.setVisible(layer.visible);
      }
    }
  }, [mapLayersRef]);

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
