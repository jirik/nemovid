export const fillTemplate = (
  str: string,
  values: Record<string, string | number>,
) => {
  return str.replace(
    /\${(.*?)}/g,
    (_match: string, varName: string): string => {
      console.assert(varName in values);
      return values[varName].toString();
    },
  );
};
