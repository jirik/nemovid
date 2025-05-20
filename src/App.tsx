import 'ol/ol.css';
import './App.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { get as getProjection } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
// import TileLayer from 'ol/layer/Tile.js';
// import OSM from 'ol/source/OSM.js';
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
          zoom: 3,
          projection: 'EPSG:5514',
        }),
      });
      mapRef.current = map;
      console.log(getProjection('EPSG:5514'));

      const tileLayer = await loadTileLayerFromWmtsCapabilities({
        url: 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ZTM/MapServer/WMTS?request=GetCapabilities',
        layer: 'ZTM',
        matrixSet: 'default028mm',
      });
      const layerExtent = tileLayer.getExtent();
      assertIsDefined(layerExtent);
      map.getView().fit(layerExtent);
      // map.addLayer(
      //   new TileLayer({
      //     source: new OSM(),
      //   }),
      // );
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
