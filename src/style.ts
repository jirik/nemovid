import type { FlatStyleLike, Rule } from 'ol/style/flat';
import settings from './settings.ts';

export const getParcelStyle = (): FlatStyleLike => {
  console.assert('default' in settings.ownerGroups);
  const ownerGroups = Object.values(settings.ownerGroups);
  const result: FlatStyleLike = [];
  const highlightedStrokeWidth = 4;
  const strokeWidth = 1;
  const fillOpacity = 0.7;
  for (const ownerGroup of ownerGroups) {
    if (ownerGroup.groupId === 'default') {
      continue;
    }
    const strokeColor = `rgba(${ownerGroup.color.join(',')}, 1)`;
    const fillColor = `rgba(${ownerGroup.color.join(',')}, ${fillOpacity})`;
    const firstRule: Rule = {
      else: true,
      filter: [
        'all',
        ['==', ['var', 'highlightedId'], ['id']],
        ['==', ['get', 'ownerGroup'], ownerGroup.groupId],
      ],
      style: {
        'stroke-color': strokeColor,
        'stroke-width': highlightedStrokeWidth,
        'stroke-offset': -highlightedStrokeWidth / 2,
        'fill-color': fillColor,
      },
    };
    result.push(firstRule, {
      else: true,
      filter: ['==', ['get', 'ownerGroup'], ownerGroup.groupId],
      style: {
        'stroke-color': strokeColor,
        'stroke-width': strokeWidth,
        'stroke-offset': -strokeWidth / 2,
        'fill-color': fillColor,
      },
    });
  }

  const ownerGroup = settings.ownerGroups.default;
  const strokeColor = `rgba(${ownerGroup.color.join(',')}, 1)`;
  const fillColor = `rgba(${ownerGroup.color.join(',')}, ${fillOpacity})`;
  const firstRule: Rule = {
    else: true,
    filter: ['==', ['var', 'highlightedId'], ['id']],
    style: {
      'stroke-color': strokeColor,
      'stroke-width': highlightedStrokeWidth,
      'stroke-offset': -highlightedStrokeWidth / 2,
      'fill-color': fillColor,
    },
  };
  result.push(firstRule, {
    else: true,
    style: {
      'stroke-color': strokeColor,
      'stroke-width': strokeWidth,
      'stroke-offset': -strokeWidth / 2,
      'fill-color': fillColor,
    },
  });
  return result;
};
