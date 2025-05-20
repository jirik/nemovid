import 'ol/ol.css';
import './App.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { useEffect, useRef } from 'react';
import { assertIsDefined } from './assert.ts';
import { loadTileLayerFromWmtsCapabilities } from './olutil.ts';

const App = () => {
  const mapRef = useRef<OlMap | null>(null);

  useEffect(() => {
    (async () => {
      if (mapRef.current) {
        if (!mapRef.current.getTarget()) {
          mapRef.current.setTarget('map');
        }
        return;
      }
      const map = new OlMap({
        target: 'map',
        layers: [],
        view: new View({
          center: [0, 0],
          zoom: 3,
          minZoom: 3,
        }),
      });
      mapRef.current = map;

      const tileLayer = await loadTileLayerFromWmtsCapabilities({
        url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM_WM/MapServer/WMTS?request=GetCapabilities',
        layer: 'ZTM_WM',
        matrixSet: 'GoogleMapsCompatible',
        bboxCrs: 'urn:ogc:def:crs:EPSG::3857',
      });
      const layerExtent = tileLayer.getExtent();
      assertIsDefined(layerExtent);
      map.getView().fit(layerExtent);
      map.addLayer(
        new TileLayer({
          source: new OSM(),
        }),
      );
      map.addLayer(tileLayer);
    })();
    return () => {
      if (mapRef.current?.getTarget()) {
        mapRef.current?.setTarget(undefined);
      }
    };
  }, []);
  return <div id="map" />;
};

export default App;
