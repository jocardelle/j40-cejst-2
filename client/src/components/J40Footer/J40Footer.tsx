import {
  NavList,
} from '@trussworks/react-uswds';
import {useIntl} from 'gatsby-plugin-intl';
import React from 'react';

import {hyphenizeString} from '../../../cypress/integration/common/helpers';
import LinkTypeWrapper from '../LinkTypeWrapper';

// @ts-ignore
import {GITHUB_LINK, GITHUB_LINK_ES} from '../../constants';
import * as ABOUT_COPY from '../../data/copy/about';
import * as COMMON_COPY from '../../data/copy/common';
import brenleafart from '../../images/bren2.svg';

const J40Footer = () => {
  const intl = useIntl();

  const CONTRIBUTELINKS = [
    intl.formatMessage(COMMON_COPY.FOOTER.CONTRIBUTE),
    <LinkTypeWrapper
      linkText={intl.formatMessage(COMMON_COPY.FOOTER.GITHUB_LINK_TEXT)}
      internal={false}
      url={intl.locale === 'es' ? GITHUB_LINK_ES : GITHUB_LINK}
      openUrlNewTab={true}
      className={'footer-link-first-child'}
      key={'contactlink'}
      dataCy={hyphenizeString(COMMON_COPY.FOOTER.GITHUB_LINK_TEXT.defaultMessage)}
      tag={intl.formatMessage(ABOUT_COPY.GET_INVOLVED.JOIN_OSC_LINK_TAG)}
    />,
  ];

  // Footer container styles with increased margins
  const footerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    // margin: '0rem 0rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#f9f9f9',
  };

  // Custom logo section styles with flexbox
  const logoSectionStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '0',
    backgroundColor: 'transparent',
  };

  // Logo image styles
  const logoImgStyle = {
    marginRight: '1rem',
    height: '80px',
    width: 'auto',
  };

  // Title text styles
  const titleStyle = {
    margin: 0,
  };

  // Contribute section styles
  const contributeSectionStyle = {
    textAlign: 'right',
    padding: '1rem',
  };

  return (
    <footer className={'j40-footer'} style={footerStyle}>
      {/* Custom logo section with image left of text */}
      <div className="usa-footer__secondary-section" style={logoSectionStyle}>
        <img
          style={logoImgStyle}
          src={brenleafart}
          alt={intl.formatMessage(COMMON_COPY.FOOTER.LOGO_ALT)}
        />
        <div className={'j40-footer-ceq-font'} style={titleStyle}>
          {intl.formatMessage(COMMON_COPY.FOOTER.TITLE)}
        </div>
      </div>

      {/* CONTRIBUTE section - now on the right side */}
      <div style={contributeSectionStyle}>
        <NavSection links={CONTRIBUTELINKS} />
      </div>
    </footer>
  );
};

const NavSection = ({
  links,
}: {
  links: React.ReactNode[]
}): React.ReactElement => {
  const [primaryLinkOrHeading, ...secondaryLinks] = links;
  return (
    <section>
      <div className="j40-h4">{primaryLinkOrHeading}</div>
      <NavList type="footerSecondary" items={secondaryLinks} />
    </section>
  );
};

export default J40Footer;
