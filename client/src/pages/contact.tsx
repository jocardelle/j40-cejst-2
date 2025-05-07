import * as React from 'react';
import {Grid} from '@trussworks/react-uswds';
import * as styles from './newStyles.module.scss';

import J40MainGridContainer from '../components/J40MainGridContainer';
import Layout from '../components/layout';
import ObservableTest from '../components/ObservableTest';
import IndicatorDemGraph from '../components/IndicatorDemGraph';

interface IContactPageProps {
  location: Location;
}

export const onRenderBody = ({setHeadComponents}) => {
  setHeadComponents([
    <link
      key="lexend-font"
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Lexend&display=swap"
    />,
  ]);
};

const ContactPage = ({location}: IContactPageProps) => {
  return (
    <Layout location={location} title={'Observable'}>
      <J40MainGridContainer fullWidth>
        <div style={{maxWidth: '90%', margin: '0 auto', padding: '0 1rem'}}>
          <section className={'page-heading'}>
            <h1>Testing Observable Plots</h1>
          </section>

          <Grid row gap={6}>
            {/* First column */}
            <Grid desktop={{col: 6}} col={12}>
              <div id="chart-container-1" className={styles.plotWrapper}>
                <ObservableTest></ObservableTest>
              </div>
            </Grid>

            {/* Second Column */}
            <Grid desktop={{col: 6}} col={12}>
              <div id="chart-container-2" className={styles.plotWrapper}>
                <IndicatorDemGraph></IndicatorDemGraph>
              </div>
            </Grid>
          </Grid>
        </div>
      </J40MainGridContainer>
    </Layout>
  );
};

export default ContactPage;
