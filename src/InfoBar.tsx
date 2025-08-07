import { Collapse, Switch } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { saveAs } from 'file-saver';
import { type ReactNode, useCallback } from 'react';
import React from 'react';
import { BooleanFilter } from './BooleanFilter.tsx';
import { CodeListFilter } from './CodeListFilter.tsx';
import styles from './InfoBar.module.css';
import { SliderInput } from './SliderInput.tsx';
import { mapLayersChange, parcelFiltersChanged } from './actions.ts';
import { assertIsDefined } from './assert.ts';
import settings from './settings.ts';
import {
  type MapLayer,
  type Zoning,
  getAreaFiltersState,
  getCodeLists,
  getMapLayers,
  getMapLegendOwnerGroups,
  getOwners,
  getParcelStats,
  getParcels,
  getZonings,
  useAppStore,
} from './store.ts';
import { fillTemplate } from './template.ts';
import { getWorkbook } from './xlsx.ts';

const ZoningSection = ({ zoning }: { zoning: Zoning }) => {
  // to refresh if parcel infos are loaded
  useAppStore((state) => state.parcelInfosTimestamp);
  return (
    <div className={styles.section}>
      <h3>Katastrální území {zoning.title}</h3>
      <div>Celkem parcel: {Object.values(zoning.parcels).length}</div>
      <ul>
        {zoning.parcels.map((parcel) => {
          const parcelKnId = parcel.id;
          const parcelLabel = parcel.label;
          const titleDeed = parcel.titleDeed;
          let parcelLabelJsx: ReactNode = <>č. p. {parcelLabel}</>;
          if (settings.parcelInfoUrlTemplate != null) {
            const parcelInfoUrl = fillTemplate(settings.parcelInfoUrlTemplate, {
              parcelKnId,
            });
            parcelLabelJsx = (
              <a href={parcelInfoUrl} target="blank">
                {parcelLabelJsx}
              </a>
            );
          }
          let titleDeedJsx: ReactNode | null = null;
          if (titleDeed != null) {
            titleDeedJsx = `, LV ${titleDeed.number}`;
            if (settings.titleDeedInfoUrlTemplate != null && titleDeed.id > 0) {
              const titleDeedId = titleDeed.id;
              const titleDeedUrl = fillTemplate(
                settings.titleDeedInfoUrlTemplate,
                { titleDeedId },
              );
              titleDeedJsx = [
                ', ',
                <a
                  key="link"
                  href={titleDeedUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  LV {titleDeed.number}
                </a>,
              ];
            }
          }
          return (
            <li key={parcelKnId}>
              {parcelLabelJsx}
              {titleDeedJsx}
              {titleDeed != null
                ? [
                    ', ',
                    titleDeed.owners.map((owner, idx) => {
                      let ownerJsx: ReactNode = owner.label;
                      if (
                        settings.ownerInfoUrlTemplate != null &&
                        owner.id > 0
                      ) {
                        const ownerUrl = fillTemplate(
                          settings.ownerInfoUrlTemplate,
                          { ownerId: owner.id },
                        );
                        ownerJsx = (
                          <a
                            key={owner.id}
                            href={ownerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {ownerJsx}
                          </a>
                        );
                      }
                      return [idx > 0 && ', ', ownerJsx];
                    }),
                  ]
                : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const ParcelsSection = () => {
  const parcels = useAppStore(getParcels);
  const zonings = useAppStore(getZonings);
  const owners = useAppStore(getOwners);

  let content: ReactNode = null;
  if (parcels == null) {
    content = <div>Načítá se ...</div>;
  } else {
    content = (
      <div>
        Celkem parcel: {Object.values(parcels).length}{' '}
        <button
          type="button"
          onClick={async () => {
            assertIsDefined(zonings);
            assertIsDefined(owners);
            const workbook = getWorkbook({
              zonings: Object.values(zonings),
              owners,
            });
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            saveAs(blob, 'parcely.xlsx');
          }}
        >
          Stáhnout parcely
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.section}>
        <h3>Dotčené parcely</h3>
        {content}
      </div>
      {Object.values(zonings || {}).map((zoning) => {
        return <ZoningSection key={zoning.id} zoning={zoning} />;
      })}
    </>
  );
};

const FilterSection = () => {
  const areaFiltersState = useAppStore(getAreaFiltersState);
  const parcelStats = useAppStore(getParcelStats);
  const parcelFilters = useAppStore((state) => state.parcelFilters);
  const processedParcels = useAppStore((state) => state.processedParcels);
  const parcels = useAppStore((state) => state.parcels);
  const codeLists = useAppStore(getCodeLists);
  const [opened, { toggle }] = useDisclosure(true);

  const maxCoveredAreaM2Cb = useCallback((value: number | string) => {
    parcelFiltersChanged({
      maxCoveredAreaM2:
        typeof value === 'string' ? Number.parseInt(value) : value,
    });
  }, []);
  const maxCoveredAreaPercCb = useCallback((value: number | string) => {
    parcelFiltersChanged({
      maxCoveredAreaPerc:
        typeof value === 'string' ? Number.parseInt(value) : value,
    });
  }, []);
  const hasBuildingCb = useCallback((value: boolean | null) => {
    parcelFiltersChanged({
      hasBuilding: value,
    });
  }, []);
  const landUseCb = useCallback((values: { [code: string]: boolean }) => {
    parcelFiltersChanged({
      landUse: values,
    });
  }, []);
  const landTypeCb = useCallback((values: { [code: string]: boolean }) => {
    parcelFiltersChanged({
      landType: values,
    });
  }, []);
  const content: React.ReactElement[] = [];
  let areaContent: React.ReactElement | null;
  if (areaFiltersState == null) {
    assertIsDefined(parcels);
    areaContent = (
      <div key="area">
        <h4>Míra překryvu</h4>
        Počítám velikosti překryvů ... {processedParcels || 0}/
        {Object.values(parcels).length} parcel zpracováno
      </div>
    );
  } else {
    assertIsDefined(parcelStats.maxCoveredAreaM2);
    areaContent = (
      <div key="area">
        <h4>Míra překryvu</h4>
        <SliderInput
          value={parcelFilters.maxCoveredAreaM2}
          maxValue={parcelStats.maxCoveredAreaM2}
          label="Maximální překrytí parcely v m2"
          onChange={maxCoveredAreaM2Cb}
        />
        <SliderInput
          value={parcelFilters.maxCoveredAreaPerc}
          maxValue={100}
          label="Maximální překrytí parcely v % rozlohy parcely"
          onChange={maxCoveredAreaPercCb}
        />
      </div>
    );
  }
  content.push(areaContent);
  content.push(
    <BooleanFilter
      key="hasBuilding"
      filter={parcelFilters.hasBuilding}
      label="S budovou / bez budovy"
      valueLabels={{
        true: 's budovou',
        false: 'bez budovy',
        any: 'všechny',
      }}
      onChange={hasBuildingCb}
    />,
  );
  if (codeLists.landType != null && parcelFilters.landType != null) {
    const codeList = codeLists.landType;
    content.push(
      <CodeListFilter
        key={codeList.id}
        list={codeList}
        filter={parcelFilters.landType}
        onChange={landTypeCb}
      />,
    );
  }
  if (codeLists.landUse != null && parcelFilters.landUse != null) {
    const codeList = codeLists.landUse;
    content.push(
      <CodeListFilter
        key={codeList.id}
        list={codeList}
        filter={parcelFilters.landUse}
        onChange={landUseCb}
      />,
    );
  }
  return (
    <div className={[styles.section, styles.filterSection].join(' ')}>
      <h3 onClick={toggle}>{opened ? '⊟' : '⊞'} Filtry parcel</h3>
      <Collapse in={opened}>{content}</Collapse>
    </div>
  );
};

const MapLayerVisibilitySwitch = ({
  mapLayerIds,
}: { mapLayerIds: string[] }) => {
  const mapLayers = useAppStore((state) => getMapLayers([state, mapLayerIds]));
  const visible = mapLayers.some((mapLayer) => mapLayer.visible);
  return (
    <Switch
      label="Viditelnost vrstvy"
      withThumbIndicator={false}
      checked={visible}
      onChange={(event) => {
        const visible = event.currentTarget.checked;
        mapLayersChange(
          mapLayers.reduce(
            (prev: { [id: string]: Partial<MapLayer> }, mapLayer) => {
              prev[mapLayer.id] = {
                visible,
              };
              return prev;
            },
            {},
          ),
        );
      }}
    />
  );
};

const MapLegend = React.memo(() => {
  const mapLegendOwnerGroups = useAppStore(getMapLegendOwnerGroups);
  const [opened, { toggle }] = useDisclosure(true);
  const content = (
    <>
      <div>
        <h4>Plánovaná výstavba</h4>
        <div className={styles.mapLegendItems}>
          <div
            className={styles.mapLegendPolygon}
            style={{
              backgroundColor: 'rgba(255,255,255,0.4)',
              borderColor: '#c513cd',
              borderWidth: 2,
            }}
          />
          <div>
            <div>Plánovaná výstavba</div>
            <MapLayerVisibilitySwitch
              mapLayerIds={['constrnFill', 'constrnStroke']}
            />
          </div>
          <div
            className={styles.mapLegendPolygon}
            style={{
              backgroundColor: 'rgba(00,200,00,0.4)',
              borderColor: '#00aa00',
              borderWidth: 1,
            }}
          />
          <div>
            <div>Překryv plánované výstavby s parcelou</div>
            <MapLayerVisibilitySwitch mapLayerIds={['covers']} />
          </div>
        </div>
      </div>
      <div>
        <h4>Parcely dle vlastníků</h4>
        <MapLayerVisibilitySwitch mapLayerIds={['parcels']} />
        <div className={styles.mapLegendItems}>
          {Object.values(mapLegendOwnerGroups).map((ownerGroup) => {
            return (
              <React.Fragment key={ownerGroup.groupId}>
                <div
                  className={styles.mapLegendPolygon}
                  style={{
                    backgroundColor: `rgba(${ownerGroup.color.join(',')}, 0.7)`,
                    borderColor: `rgba(${ownerGroup.color.join(',')}, 1)`,
                    borderWidth: 1,
                  }}
                />
                <div>{ownerGroup.label}</div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
  return (
    <div className={[styles.section, styles.mapLegend].join(' ')}>
      <h3 onClick={toggle}>{opened ? '⊟' : '⊞'} Legenda mapy</h3>
      <Collapse in={opened}>{content}</Collapse>
    </div>
  );
});

const InfoBar = () => {
  const fileName = useAppStore((state) => state.fileName);
  const areaFiltersState = useAppStore(getAreaFiltersState);
  const parcelFeatures = useAppStore((state) => state.parcelFeatures);

  return (
    <div id="infoBar" className={styles.container}>
      {!fileName ? (
        <div className={styles.section}>
          <h3>Vítejte</h3>
          <p>
            Aplikace najde parcely, které mají průnik s plánovanou výstavbou.
            Plánovanou výstavbu lze nahrát v jednom z následujících formátů:
          </p>
          <ul>
            <li>
              soubor DXF v souřadnicovém systému S-JTSK (EPSG:5514); nahrány
              budou pouze plošné prvky
            </li>
            <li>
              soubor GeoJSON s plošnými prvky (polygony, multipolygony) v
              souřadnicovém systému S-JTSK (EPSG:5514)
            </li>
          </ul>
          <p>
            Začněte tím, že soubor s plánovanou výstavbou přetáhnete nad mapu
            (drag & drop).
          </p>
        </div>
      ) : (
        <div className={styles.section}>
          <h3>Zobrazený soubor</h3>
          <div>{fileName}</div>
        </div>
      )}
      {parcelFeatures == null ? null : <MapLegend />}
      {areaFiltersState === false ? null : <FilterSection />}
      {fileName ? <ParcelsSection /> : null}
    </div>
  );
};

export default InfoBar;
