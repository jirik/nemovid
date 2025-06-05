import { Workbook } from 'exceljs';
import type { Zoning } from './store.ts';

export const getWorkbook = ({ zonings }: { zonings: Zoning[] }): Workbook => {
  const workbook = new Workbook();
  addParcelSheet(zonings, { workbook });
  addZoningSheet(zonings, { workbook });
  return workbook;
};

const addZoningSheet = (
  zonings: Zoning[],
  { workbook }: { workbook: Workbook },
) => {
  const sheet = workbook.addWorksheet('Katastrální území', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Číslo KÚ', key: 'id' },
    { header: 'Název KÚ', key: 'title' },
    { header: 'Počet LV', key: 'numTitleDeeds' },
    { header: 'Počet parcel', key: 'numParcels' },
  ];
  const rows: Record<string, string | number>[] = zonings.map((zoning) => {
    return {
      id: zoning.id,
      title: zoning.title,
      numTitleDeeds: Object.values(zoning.titleDeeds).length,
      numParcels: zoning.parcels.length,
    };
  });
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  return sheet;
};

const addParcelSheet = (
  zonings: Zoning[],
  { workbook }: { workbook: Workbook },
) => {
  const sheet = workbook.addWorksheet('Parcely', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Název KÚ', key: 'zoningTitle' },
    { header: 'ID parcely', key: 'id' },
    { header: 'Číslo parcely', key: 'label' },
    { header: 'LV', key: 'titleDeed' },
  ];
  const rows: Record<string, string | number | undefined>[] = zonings.reduce(
    (prev: Record<string, string | number | undefined>[], zoning) => {
      for (const parcel of zoning.parcels) {
        prev.push({
          zoningTitle: zoning.title,
          id: parcel.id.toString(),
          label: parcel.label,
          titleDeed: parcel.titleDeed?.number?.toString(),
        });
      }
      return prev;
    },
    [],
  );
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  return sheet;
};
