import 'ol/ol.css';
import './App.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { GeoJSON } from 'ol/format';
import { DragAndDrop } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import { register } from 'ol/proj/proj4';
import VectorSource from 'ol/source/Vector';
import proj4 from 'proj4';
import { useEffect, useRef } from 'react';
import { assertIsDefined } from './assert.ts';
import { loadTileLayerFromWmtsCapabilities } from './olutil.ts';

proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.8333333333333 +alpha=30.2881397527778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs',
);
register(proj4);

const App = () => {
  const mapRef = useRef<OlMap | null>(null);
  const vectorLayerRef = useRef<VectorLayer | null>(null);

  useEffect(() => {
    (async () => {
      if (mapRef.current) {
        if (!mapRef.current.getTarget()) {
          mapRef.current.setTarget('map');
        }
        return;
      }
      const vectorLayer = new VectorLayer({
        source: new VectorSource(),
      });
      vectorLayerRef.current = vectorLayer;

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
    const map = mapRef.current;
    const vectorLayer = vectorLayerRef.current;
    const dnd = new DragAndDrop({
      formatConstructors: [GeoJSON],
    });
    dnd.on('addfeatures', (event) => {
      const vectorSource = vectorLayer.getSource();
      assertIsDefined(vectorSource);
      vectorSource.clear(true);
      vectorSource.addFeatures(event.features || []);
    });
    map.addInteraction(dnd);
    return () => {
      map.removeInteraction(dnd);
    };
  }, []);

  return <div id="map" />;
};

export default App;
