import type { ExpressionValue } from 'ol/expr/expression';
import type { CodeList } from './cuzk.ts';

export const getFilter = ({ codeList }: { codeList: CodeList | null }) => {
  return codeList
    ? Object.keys(codeList.values).reduce(
        (prev: { [code: string]: boolean }, code) => {
          prev[code] = true;
          return prev;
        },
        {},
      )
    : null;
};

export const getGlVars = ({
  filter,
  varPrefix,
}: { filter: { [code: string]: boolean } | null; varPrefix: string }): {
  [varName: string]: number;
} => {
  return filter
    ? Object.entries(filter).reduce(
        (prev: { [varName: string]: number }, [code, isChecked]) => {
          const varName = `${varPrefix}${code}`;
          prev[varName] = isChecked ? 1 : 0;
          return prev;
        },
        {},
      )
    : {};
};

export const getGlFilters = ({
  codeList,
  propName,
  varPrefix,
}: {
  codeList: CodeList | null;
  propName: string;
  varPrefix: string;
}): ExpressionValue[][] => {
  const codes = Object.keys(codeList?.values || {});
  return codes.length > 0
    ? [
        [
          'any',
          ...codes.reduce((prev: ExpressionValue[], code) => {
            prev.push([
              'all',
              ['==', ['get', propName], code],
              ['==', ['var', `${varPrefix}${code}`], 1],
            ]);
            return prev;
          }, []),
        ],
      ]
    : [];
};
