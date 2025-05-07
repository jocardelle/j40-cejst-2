import React from 'react';

import * as styles from './HotspotInfo.module.scss';
// import * as EXPLORE_COPY from '../../data/copy/explore';
// import * as constants from '../../data/constants';

export interface IHotspotInfoProps {
  // temperatureClass: string,
  zScore: number;
  pValue: number;
}

const HotspotInfo = ({
  // temperatureClass,
  zScore,
  pValue,
}: IHotspotInfoProps) => {
  return (
    <ul className={styles.tractInfoContainer}>
      {/* <li>
        <span>Classification</span>
        <span>{` ${temperatureClass}`}</span>
      </li> */}
      <li>
        <span>Z-score</span>
        <span>{` ${zScore}`}</span>
      </li>
      <li>
        <span>P-value</span>
        <span>{` ${pValue}`}</span>
      </li>
    </ul>
  );
};

export default HotspotInfo;
