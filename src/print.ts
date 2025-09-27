import { jsPDF } from 'jspdf';
import type OlMap from 'ol/Map.js';
import type OlInteraction from 'ol/interaction/Interaction';
import { assertIsDefined } from './assert.ts';

export const printMap = async ({ map }: { map: OlMap }) => {
  return new Promise((resolve) => {
    const mapEl = map.getTargetElement();
    assertIsDefined(mapEl);
    const viewportEl = map.getViewport();
    const prevMapVisibility = viewportEl.style.visibility;
    viewportEl.style.visibility = 'hidden';
    const switchedInteractions: OlInteraction[] = [];
    for (const interaction of map.getInteractions().getArray()) {
      if (interaction.getActive()) {
        interaction.setActive(false);
        switchedInteractions.push(interaction);
      }
    }

    document.body.style.cursor = 'progress';

    const resolution = Number(300);
    const dim = [297, 210];
    const size = map.getSize();
    assertIsDefined(size);
    let pageOrientation: 'landscape' | 'portrait' = 'landscape';
    if (size[0] < size[1]) {
      dim.reverse();
      pageOrientation = 'portrait';
    }
    const width = Math.round((dim[0] * resolution) / 25.4);
    const height = Math.round((dim[1] * resolution) / 25.4);
    const viewResolution = map.getView().getResolution();
    assertIsDefined(viewResolution);

    map.once('rendercomplete', () => {
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = width;
      mapCanvas.height = height;
      const mapContext = mapCanvas.getContext('2d');
      assertIsDefined(mapContext);
      mapContext.fillStyle = 'white';
      mapContext.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
      const canvases = document.querySelectorAll('.ol-layers canvas');
      Array.prototype.forEach.call(canvases, (canvas) => {
        if (canvas.width > 0) {
          const opacity = canvas.parentNode.style.opacity;
          mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
          const transform = canvas.style.transform;
          if (transform) {
            // Get the transform parameters from the style's transform matrix
            const matrix = transform
              .match(/^matrix\(([^\(]*)\)$/)[1]
              .split(',')
              .map(Number);
            // Apply the transform to the export map context
            CanvasRenderingContext2D.prototype.setTransform.apply(
              mapContext,
              matrix,
            );
          }
          mapContext.drawImage(canvas, 0, 0);
        }
      });
      mapContext.globalAlpha = 1;
      mapContext.setTransform(1, 0, 0, 1, 0, 0);
      const pdf = new jsPDF(pageOrientation, undefined, 'A4');
      pdf.addImage(
        mapCanvas.toDataURL('image/jpeg'),
        'JPEG',
        0,
        0,
        dim[0],
        dim[1],
      );
      pdf.save('map.pdf');
      // Reset original map size
      map.setSize(size);
      map.getView().setResolution(viewResolution);
      document.body.style.cursor = 'auto';
      for (const interaction of switchedInteractions) {
        interaction.setActive(true);
      }
      viewportEl.style.visibility = prevMapVisibility;
      mapEl.classList.remove('loading');
      resolve(undefined);
    });

    mapEl.classList.add('loading');
    // Set print size
    const printSize = [width, height];
    map.setSize(printSize);
    const scaling = Math.min(width / size[0], height / size[1]);
    map.getView().setResolution(viewResolution / scaling);
  });
};
