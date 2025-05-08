import {useIntl} from 'gatsby-plugin-intl';
import * as React from 'react';
import {useWindowSize} from 'react-use';

import {Grid} from '@trussworks/react-uswds';
import AboutCard from '../components/AboutCard/AboutCard';
import AboutCardsContainer from '../components/AboutCard/AboutCardsContainer';
import J40MainGridContainer from '../components/J40MainGridContainer';
import Layout from '../components/layout';
import SubPageNav from '../components/SubPageNav';

import {GITHUB_LINK, GITHUB_LINK_ES} from '../constants';
import {PAGES_ENDPOINTS, USWDS_BREAKPOINTS} from '../data/constants';
import * as ABOUT_COPY from '../data/copy/about';

import aboutJ40Image from '../images/about-usmap.svg';

import githubIcon from // @ts-ignore
  '/node_modules/uswds/dist/img/usa-icons/github.svg';

interface IAboutPageProps {
  location: Location;
}

// markup
const AboutPage = ({location}: IAboutPageProps) => {
  const intl = useIntl();
  const {width} = useWindowSize();

  console.log(intl.locale);
  return (
    <Layout location={location} title={intl.formatMessage(ABOUT_COPY.PAGE.TITLE)}>

      <J40MainGridContainer>

        <section className={'page-heading'}>
          <h1 data-cy={'about-page-heading'}>{intl.formatMessage(ABOUT_COPY.PAGE.TITLE)}</h1>
        </section>

        <Grid row gap className={'j40-mb5-mt3'}>

          {/* First column */}
          <Grid col={12} tablet={{col: 8}}>
            <section>
              <p>
                {ABOUT_COPY.CONTENT.PARA1}
              </p>
              <p>
                {ABOUT_COPY.CONTENT.PARA2}
              </p>
            </section>
          </Grid>

          {/* Second column */}
          <Grid col={12} tablet={{col: 1}}>
            {/* Spacer column */}

          </Grid>

          {/* Third column */}
          <Grid col={12} tablet={{col: 3}}>
            {width > USWDS_BREAKPOINTS.DESKTOP ? (
              <>
                <SubPageNav
                  endPoints={[
                    PAGES_ENDPOINTS.ABOUT,
                    PAGES_ENDPOINTS.FAQS,
                  ]}
                />
                <img
                  src={aboutJ40Image}
                  alt="About J40"
                  className="about-image"
                  width="100%"
                  height="auto"
                  style={{maxWidth: '100%', marginTop: '2rem'}}
                />
              </>
            ) : (
              <img
                src={aboutJ40Image}
                alt="About J40"
                className="about-image"
                width="100%"
                height="auto"
                style={{maxWidth: '100%'}}
              />
            )}
          </Grid>
        </Grid>


      </J40MainGridContainer>

      <J40MainGridContainer
        fullWidth={true}
        blueBackground={true}>
        <J40MainGridContainer>
          <Grid col={12} tablet={{col: 8}} className='j40-mb5-mt3'>
            <h2>
              {intl.formatMessage(ABOUT_COPY.HOW_TO_USE_TOOL.TITLE)}
            </h2>
            <p>
              {ABOUT_COPY.CONTENT.HOW_TO_USE_PARA1}
            </p>
            <p>
              {intl.formatMessage(ABOUT_COPY.HOW_TO_USE_TOOL.PARA2)}
            </p>
            <p>
              {ABOUT_COPY.CONTENT.HOW_TO_USE_PARA3}
            </p>
          </Grid>
        </J40MainGridContainer>
      </J40MainGridContainer>

      <J40MainGridContainer>
        <h2>{intl.formatMessage(ABOUT_COPY.GET_INVOLVED.TITLE)}</h2>
        <AboutCardsContainer>

          <AboutCard
            size={'small'}
            imgSrc={githubIcon}
            header={intl.formatMessage(ABOUT_COPY.GET_INVOLVED.JOIN_OSC_HEADING)}
            linkText={intl.formatMessage(ABOUT_COPY.GET_INVOLVED.JOIN_OSC_LINK_TEXT)}
            linkTag={intl.formatMessage(ABOUT_COPY.GET_INVOLVED.JOIN_OSC_LINK_TAG)}
            url={intl.locale === 'es' ? GITHUB_LINK_ES : GITHUB_LINK}
            openUrlNewTab={true}
            internal={false}>
            <p>
              {intl.formatMessage(ABOUT_COPY.GET_INVOLVED.JOIN_OSC_INFO)}
            </p>
          </AboutCard>
        </AboutCardsContainer>

      </J40MainGridContainer>
      {/* Duplicated blue background section */}
      <div className="grid-container-desktop">
        <J40MainGridContainer
          fullWidth={true}
          blueBackground={true}>
          <J40MainGridContainer>
            <Grid col={12} tablet={{col: 8}} className='j40-mb5-mt3'>
              <h2>
                {intl.formatMessage(ABOUT_COPY.ACKNOwLEDGEMENTS.TITLE)}
              </h2>
              <p>
                {ABOUT_COPY.ACKNOWLEDGEMENTS_CONTENT.PARA1}
              </p>
            </Grid>
          </J40MainGridContainer>
        </J40MainGridContainer>
      </div>
    </Layout>);
};

export default AboutPage;
