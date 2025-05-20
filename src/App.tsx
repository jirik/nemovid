import 'ol/ol.css';
import './App.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { GeoJSON } from 'ol/format';
import { DragAndDrop } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import { register } from 'ol/proj/proj4';
import VectorSource from 'ol/source/Vector';
import { createDefaultStyle } from 'ol/style/flat';
import proj4 from 'proj4';
import { useEffect, useRef } from 'react';
import { assertIsDefined } from './assert.ts';
import {
  extentsToFeatures,
  getMainExtents,
  loadTileLayerFromWmtsCapabilities,
} from './olutil.ts';

proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
);
register(proj4);

const App = () => {
  const mapRef = useRef<OlMap | null>(null);
  const vectorLayerRef = useRef<WebGLVectorLayer | null>(null);
  const vectorExtentLayerRef = useRef<VectorLayer | null>(null);

  useEffect(() => {
    (async () => {
      if (mapRef.current) {
        if (!mapRef.current.getTarget()) {
          mapRef.current.setTarget('map');
        }
        return;
      }
      const vectorLayer = new WebGLVectorLayer({
        source: new VectorSource(),
        style: createDefaultStyle(),
      });
      vectorLayerRef.current = vectorLayer;

      const vectorExtentLayer = new VectorLayer({
        source: new VectorSource(),
      });
      vectorExtentLayerRef.current = vectorExtentLayer;

      const map = new OlMap({
        target: 'map',
        layers: [],
        view: new View({
          projection: 'EPSG:5514',
        }),
      });
      mapRef.current = map;

      const tileLayer = await loadTileLayerFromWmtsCapabilities({
        url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM/MapServer/WMTS?request=GetCapabilities',
        layer: 'ZTM',
        matrixSet: 'default028mm',
      });
      const tileLayerExtent = tileLayer.getExtent();
      assertIsDefined(tileLayerExtent);

      map.getView().fit(tileLayerExtent);

      map.addLayer(tileLayer);
      map.addLayer(vectorExtentLayer);
      map.addLayer(vectorLayer);
    })();
    return () => {
      if (mapRef.current?.getTarget()) {
        mapRef.current?.setTarget(undefined);
      }
    };
  }, []);

  useEffect(() => {
    assertIsDefined(mapRef.current);
    assertIsDefined(vectorLayerRef.current);
    assertIsDefined(vectorExtentLayerRef.current);
    const map = mapRef.current;
    const vectorLayer = vectorLayerRef.current;
    const vectorExtentLayer = vectorExtentLayerRef.current;
    const dnd = new DragAndDrop({
      formatConstructors: [GeoJSON],
    });
    dnd.on('addfeatures', (event) => {
      const vectorSource = vectorLayer.getSource();
      assertIsDefined(vectorSource);
      vectorSource.clear(true);
      vectorSource.addFeatures(event.features || []);

      const mainExtents = getMainExtents({
        features: vectorSource.getFeatures(),
      });
      const vectorExtentSource = vectorExtentLayer.getSource();
      assertIsDefined(vectorExtentSource);
      vectorExtentSource.clear(true);
      const extentFeatures = extentsToFeatures({ extents: mainExtents });
      vectorExtentSource.addFeatures(extentFeatures);

      const vectorExtent = vectorSource.getExtent();
      map.getView().fit(vectorExtent, {
        duration: 1000,
      });
    });
    map.addInteraction(dnd);
    return () => {
      map.removeInteraction(dnd);
    };
  }, []);

  return <div id="map" />;
};

export default App;
