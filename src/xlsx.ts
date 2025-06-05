import { ValueType, Workbook, type Worksheet } from 'exceljs';
import type { Zoning } from './store.ts';

export const getWorkbook = ({ zonings }: { zonings: Zoning[] }): Workbook => {
  const workbook = new Workbook();
  addParcelSheet(zonings, { workbook });
  addTitleDeedSheet(zonings, { workbook });
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
  adjustWidths(sheet);
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
  adjustWidths(sheet);
  return sheet;
};

const addTitleDeedSheet = (
  zonings: Zoning[],
  { workbook }: { workbook: Workbook },
) => {
  const sheet = workbook.addWorksheet('Listy vlastnictví', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Název KÚ', key: 'zoningTitle' },
    { header: 'ID LV', key: 'id' },
    { header: 'Číslo LV', key: 'number' },
    { header: 'Parcely', key: 'parcels' },
  ];
  const rows: Record<string, string | number | undefined>[] = zonings.reduce(
    (prev: Record<string, string | number | undefined>[], zoning) => {
      for (const titleDeed of Object.values(zoning.titleDeeds).sort(
        (a, b) => a.number - b.number,
      )) {
        prev.push({
          zoningTitle: zoning.title,
          id: titleDeed.id.toString(),
          number: titleDeed.number.toString(),
          parcels: titleDeed.parcels.map((parcel) => parcel.label).join(', '),
        });
      }
      return prev;
    },
    [],
  );
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  adjustWidths(sheet);
  return sheet;
};

const adjustWidths = (sheet: Worksheet) => {
  for (let c = 1; c <= sheet.columnCount; c++) {
    const col = sheet.getColumn(c);
    let maxWidth = 0;
    col.eachCell((cell) => {
      if (cell.type === ValueType.String) {
        maxWidth = Math.max(maxWidth, (cell.value as string).length);
      } else if (cell.type === ValueType.Number) {
        maxWidth = Math.max(maxWidth, (cell.value as number).toString().length);
      } else {
        console.error('Unknown cell type', cell.type, cell.value);
      }
    });
    col.width = Math.min(Math.ceil(maxWidth * 1.2), 20);
  }
};
