import 'ol/ol.css';
import './App.css';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import { useEffect } from 'react';

const App = () => {
  useEffect(() => {
    const map = new OlMap({
      target: 'map',
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: [0, 0],
        zoom: 3,
      }),
    });
    return () => {
      map.setTarget(undefined);
    }
  }, []);
  return <div id="map" />;
};

export default App;
