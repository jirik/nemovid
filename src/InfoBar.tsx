import { useCallback } from 'react';
import styles from './InfoBar.module.css';
import { SliderInput } from './SliderInput.tsx';
import { assertIsDefined } from './assert.ts';
import {
  type Zoning,
  getAreaFiltersState,
  getParcelStats,
  getParcelsByZoning,
  useAppStore,
} from './store.ts';

const ZoningSection = ({ zoning }: { zoning: Zoning }) => {
  return (
    <div className={styles.section}>
      <h3>Katastrální území {zoning.title}</h3>
      <div>Celkem parcel: {Object.values(zoning.parcels).length}</div>
      <ul>
        {zoning.parcels.map((parcel) => {
          const parcelId = parcel.getId() as string;
          const parcelLabel = parcel.get('label') as string;
          return <li key={parcelId}>č. p. {parcelLabel}</li>;
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
    content = <div>Počítám velikosti překryvů ...</div>;
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
