export const getExtension = (filename: string): string => {
  return `.${filename.toLowerCase().split('.').pop()}`;
};
