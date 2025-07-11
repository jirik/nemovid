export type CodeListItem = {
  id: string; // unique globally
  code: string; // unique within the code list
  label: string;
};
export type CodeList = {
  id: string;
  label: string;
  values: Record<string, CodeListItem>;
};
export const NullItem = Object.freeze({
  id: 'null',
  code: 'null',
  label: 'neznámá hodnota (null)',
});
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
