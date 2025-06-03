import { type ReactNode, useCallback } from 'react';
import styles from './InfoBar.module.css';
import { SliderInput } from './SliderInput.tsx';
import { assertIsDefined } from './assert.ts';
import { getParcelKnId, getParcelLabel, getParcelTitleDeed } from './cuzk.ts';
import settings from './settings.ts';
import {
  type Zoning,
  getAreaFiltersState,
  getParcelStats,
  getParcelsByZoning,
  useAppStore,
} from './store.ts';
import { fillTemplate } from './template.ts';

const ZoningSection = ({ zoning }: { zoning: Zoning }) => {
  // to refresh if parcel infos are loaded
  useAppStore((state) => state.parcelInfosTimestamp);
  return (
    <div className={styles.section}>
      <h3>Katastrální území {zoning.title}</h3>
      <div>Celkem parcel: {Object.values(zoning.parcels).length}</div>
      <ul>
        {zoning.parcels.map((parcel) => {
          const parcelKnId = getParcelKnId(parcel);
          const parcelLabel = getParcelLabel(parcel);
          const titleDeed = getParcelTitleDeed(parcel);
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
            if (settings.titleDeedInfoUrlTemplate != null) {
              const titleDeedId = titleDeed.id;
              const titleDeedUrl = fillTemplate(
                settings.titleDeedInfoUrlTemplate,
                { titleDeedId },
              );
              titleDeedJsx = [
                ', ',
                <a key="link" href={titleDeedUrl}>
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
                      return [
                        idx > 0 && ', ',
                        <a key={owner.url} href={owner.url}>
                          {owner.label}
                        </a>,
                      ];
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
  const parcels = useAppStore((state) => state.parcels);
  const parcelsByZoning = useAppStore(getParcelsByZoning);
  return (
    <>
      <div className={styles.section}>
        <h3>Dotčené parcely</h3>
        <div>
          {parcels == null
            ? 'Načítá se ...'
            : `Celkem parcel: ${Object.values(parcels).length}`}
        </div>
      </div>
      {Object.values(parcelsByZoning).map((zoning) => {
        return <ZoningSection key={zoning.id} zoning={zoning} />;
      })}
    </>
  );
};

const FilterSection = () => {
  const areaFiltersState = useAppStore(getAreaFiltersState);
  const parcelStats = useAppStore(getParcelStats);
  const parcelFilters = useAppStore((state) => state.parcelFilters);
  const parcelFiltersChanged = useAppStore(
    (state) => state.parcelFiltersChanged,
  );
  const processedParcels = useAppStore((state) => state.processedParcels);
  const parcels = useAppStore((state) => state.parcels);

  const maxCoveredAreaM2Cb = useCallback(
    (value: number | string) => {
      parcelFiltersChanged({
        maxCoveredAreaM2:
          typeof value === 'string' ? Number.parseInt(value) : value,
      });
    },
    [parcelFiltersChanged],
  );
  const maxCoveredAreaPercCb = useCallback(
    (value: number | string) => {
      parcelFiltersChanged({
        maxCoveredAreaPerc:
          typeof value === 'string' ? Number.parseInt(value) : value,
      });
    },
    [parcelFiltersChanged],
  );
  let content: React.ReactElement | null;
  if (areaFiltersState == null) {
    assertIsDefined(parcels);
    content = (
      <div>
        Počítám velikosti překryvů ... {processedParcels || 0}/
        {Object.values(parcels).length} parcel zpracováno
      </div>
    );
  } else {
    assertIsDefined(parcelStats.maxCoveredAreaM2);
    content = (
      <>
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
      </>
    );
  }
  return (
    <div className={styles.section}>
      <h3>Filtry parcel</h3>
      {content}
    </div>
  );
};

const InfoBar = () => {
  const fileName = useAppStore((state) => state.fileName);
  const areaFiltersState = useAppStore(getAreaFiltersState);

  return (
    <div id="infoBar" className={styles.container}>
      {!fileName ? (
        <div className={styles.section}>
          <h3>Vítejte</h3>
          <div>
            Začněte tím, že soubor *.geojson přetáhnete nad mapu (drag & drop).
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <h3>Zobrazený soubor</h3>
          <div>{fileName}</div>
        </div>
      )}
      {areaFiltersState === false ? null : <FilterSection />}
      {fileName ? <ParcelsSection /> : null}
    </div>
  );
};

export default InfoBar;
