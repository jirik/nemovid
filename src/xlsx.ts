import { ValueType, Workbook, type Worksheet } from 'exceljs';
import { sortParcelByLabel } from './cuzk.ts';
import type { Owner, Parcel, ParcelAreas, TitleDeed, Zoning } from './store.ts';

export const getWorkbook = ({
  zonings,
  owners,
  parcelAreas,
}: {
  zonings: Zoning[];
  owners: Owner[];
  parcelAreas: { [parcelId: string]: ParcelAreas };
}): Workbook => {
  const workbook = new Workbook();
  addParcelSheet(zonings, parcelAreas, { workbook });
  addTitleDeedSheet(zonings, parcelAreas, { workbook });
  addOwnerSheet(owners, { workbook });
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
  parcelAreas: { [parcelId: string]: ParcelAreas },
  { workbook }: { workbook: Workbook },
) => {
  const sheet = workbook.addWorksheet('Parcely', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Název KÚ', key: 'zoningTitle' },
    { header: 'ID parcely', key: 'id' },
    { header: 'Číslo parcely', key: 'label' },
    { header: 'Rozloha parcely [m²]', key: 'officialAreaM2' },
    { header: 'Překryv parcely [m²]', key: 'coveredAreaM2' },
    { header: 'Míra překryvu [%]', key: 'coveredAreaPerc' },
    { header: 'LV', key: 'titleDeed' },
    { header: 'Vlastníci', key: 'owners' },
  ];
  const rows: Record<string, string | number | undefined>[] = zonings.reduce(
    (prev: Record<string, string | number | undefined>[], zoning) => {
      for (const parcel of zoning.parcels) {
        const areas = parcelAreas[parcel.id];
        prev.push({
          zoningTitle: zoning.title,
          id: parcel.id.toString(),
          label: parcel.label,
          officialAreaM2: areas.officialAreaM2,
          coveredAreaM2: areas.coveredAreaM2,
          coveredAreaPerc: areas.coveredAreaPerc,
          titleDeed: parcel.titleDeed?.number?.toString(),
          owners: (
            parcel.titleDeed?.owners?.map((owner) => owner.label) || []
          ).join(', '),
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
  parcelAreas: { [parcelId: string]: ParcelAreas },
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
    { header: 'Překryv parcel [m²]', key: 'coveredAreaM2' },
    { header: 'Vlastníci', key: 'owners' },
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
          coveredAreaM2: titleDeed.parcels
            .map((parcel) => parcelAreas[parcel.id].coveredAreaM2)
            .reduce((p, a) => p + a, 0),
          owners: (titleDeed.owners.map((owner) => owner.label) || []).join(
            ', ',
          ),
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

const addOwnerSheet = (
  owners: Owner[],
  { workbook }: { workbook: Workbook },
) => {
  const sheet = workbook.addWorksheet('Vlastníci', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Vlastník', key: 'ownerLabel' },
    { header: 'ID vlastníka', key: 'id' },
    { header: 'LV', key: 'titleDeeds' },
    { header: 'Parcely', key: 'parcels' },
  ];
  const sortedOwners = owners.toSorted((a, b) =>
    a.label.localeCompare(b.label),
  );
  const rows: Record<string, string | number | undefined>[] = sortedOwners.map(
    (owner) => {
      const titleDeedsByZoning: Record<string, TitleDeed[]> = {};
      const zonings: Record<string, Zoning> = {};
      for (const titleDeed of owner.titleDeeds) {
        const zoning = titleDeed.zoning;
        if (!(zoning.id in zonings)) {
          zonings[zoning.id] = zoning;
          titleDeedsByZoning[zoning.id] = [];
        }
        titleDeedsByZoning[zoning.id].push(titleDeed);
      }
      const zoningsList = Object.values(zonings).sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      return {
        ownerLabel: owner.label,
        id: owner.id.toString(),
        titleDeeds: zoningsList
          .map((zoning) => {
            const titleDeeds = titleDeedsByZoning[zoning.id].sort(
              (a, b) => a.number - b.number,
            );
            return `${zoning.title}: ${titleDeeds.map((td) => td.number).join(', ')}`;
          })
          .join('; '),
        parcels: zoningsList
          .map((zoning) => {
            const parcels = titleDeedsByZoning[zoning.id]
              .reduce((prev: Parcel[], td) => {
                prev.push(...td.parcels);
                return prev;
              }, [])
              .sort(sortParcelByLabel);
            return `${zoning.title}: ${parcels.map((p) => p.label).join(', ')}`;
          })
          .join('; '),
      };
    },
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
      } else if (cell.type === ValueType.Null) {
        // width is 0
      } else {
        console.error('Unknown cell type', cell.type, cell.value);
      }
    });
    col.width = Math.min(Math.ceil(maxWidth * 1.2), 20);
  }
};
