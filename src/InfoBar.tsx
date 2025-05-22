import styles from './InfoBar.module.css';
import { useAppStore } from './store.ts';

const InfoBar = () => {
  const fileName = useAppStore((state) => state.fileName);

  const fstSection = fileName ? (
    <>
      <h3>Zobrazený soubor</h3>
      <div>{fileName}</div>
    </>
  ) : (
    <>
      <h3>Vítejte</h3>
      <div>
        Začněte tím, že soubor *.geojson přetáhnete nad mapu (drag & drop).
      </div>
    </>
  );

  return (
    <div id="infoBar" className={styles.container}>
      <div className={styles.section}>{fstSection}</div>
    </div>
  );
};

export default InfoBar;
