import React, {useMemo, useEffect} from 'react';
// useState , useEffect, useRef from react
import {Source, Layer} from 'react-map-gl';
// import Map, {MapRef} from 'react-map-gl'; // Import MapRef for the reference type
import {MapGeoJSONFeature} from 'maplibre-gl';

// Contexts:
import {useFlags} from '../../contexts/FlagContext';

import * as constants from '../../data/constants';
import * as COMMON_COPY from '../../data/copy/common';
import LayerToggleControl from '../LayerToggleControl/LayerToggleControl';
import {getInteractiveLayerIdsFunc} from '../LayerToggleControl/LayerToggleControl';

interface IMapTractLayers {
  selectedFeatureId: string | number;
  selectedFeature: MapGeoJSONFeature | undefined;
  visibleLayers: string[]; // <-- add this
  setVisibleLayers: React.Dispatch<React.SetStateAction<string[]>>; // <-- add this too
}

/**
 * This function will determine the URL for the map tiles. It will read in a string that will designate either
 * high or low tiles. It will allow to overide the URL to the pipeline staging tile URL via feature flag.
 * Lastly, it allows to set the tiles to be local or via the CDN as well.
 *
 * @param {string} tilesetName
 * @return {string}
 */

export const featureURLForTilesetName = (
    tilesetType: string,
    // tilesetSubtype: string,
    tilesetName: string,
): string => {
  const flags = useFlags();

  const pipelineStagingBaseURL =
    process.env.GATSBY_CDN_TILES_BASE_URL + `/data-pipeline-staging`;
  const XYZ_SUFFIX = '{z}/{x}/{y}.pbf';

  if ('stage_hash' in flags) {
    const regex = /^[0-9]{4}\/[a-f0-9]{40}$/;
    if (!regex.test(flags['stage_hash'])) {
      console.error(COMMON_COPY.CONSOLE_ERROR.STAGE_URL);
    }

    return `${pipelineStagingBaseURL}/${flags['stage_hash']}/data/score/tiles/${tilesetName}/${XYZ_SUFFIX}`;
  } else {
    const featureTileBaseURL = constants.TILE_BASE_URL;
    const featureTilePath = constants.TILE_PATH;
    const mapTilesPath = process.env.GATSBY_MAP_TILES_PATH;

    const pathParts = [
      featureTileBaseURL,
      featureTilePath,
      mapTilesPath,
      tilesetType,
      // tilesetSubtype,
      tilesetName,
      XYZ_SUFFIX,
    ]
        .filter(Boolean)
        .map((part) => part.replace(/^\/|\/$/g, '')) // trim leading/trailing slashes
        .join('/');

    return pathParts.startsWith('http') ? pathParts : `/${pathParts}`;
  }
};

/**
 * This component will return the appropriate source and layers for the census layer on the
 * map.
 *
 * There are two use cases here, eg, when the MapBox token is or isn't provided. When the token
 * is not provided, the open-source map will be rendered. When the open-source map is rendered
 * only the interactive layers are returned from this component. The reason being is that the
 * other layers are supplied by he getOSBaseMap function.
 *
 * @param {string | number} selectedFeatureId
 * @param {MapGeoJSONFeature | undefined} selectedFeature
 * @return {Style}
 */

const MapTractLayers = ({
  selectedFeatureId,
  visibleLayer,
  setVisibleLayer,
  setInteractiveLayerIds,
  getInteractiveLayerIds,
}: IMapTractLayers & {
  visibleLayer: string;
  setVisibleLayer: (layer: string) => void;
  setInteractiveLayerIds: (ids: string[]) => void;
  getInteractiveLayerIds: (layerId: string) => string[];
}) => {
  useEffect(() => {
    const initialInteractiveLayerIds = getInteractiveLayerIdsFunc(visibleLayer);
    setInteractiveLayerIds(initialInteractiveLayerIds);
  }, [visibleLayer, setInteractiveLayerIds, getInteractiveLayerIds]);

  // const filter = useMemo(() => {
  //   if (!selectedFeatureId) {
  //     return null;
  //   }
  //   return ['in', constants.GEOID_PROPERTY, selectedFeatureId];
  // }, [selectedFeatureId]);

  const filter = useMemo(
      () => ['in', constants.GEOID_PROPERTY, selectedFeatureId],
      [selectedFeatureId],
  );

  return (
    <>
      <LayerToggleControl
        layers={[
          {id: constants.ADD_BURDEN_LAYER_ID, name: 'Total Burdens'},
          {id: constants.ADD_INDICATOR_LAYER_ID, name: 'Total Indicators'},
          {id: constants.PSIM_BURDEN_LAYER_ID, name: 'Burden Hotspots'},
          {id: constants.PSIM_INDICATOR_LAYER_ID, name: 'Indicator Hotspots'},
          {id: constants.LEGACY_LAYER_ID, name: 'Legacy Tool'},
        ]}
        visibleLayer={visibleLayer}
        setLayerState={(layerId, interactiveLayerIds) => {
          setVisibleLayer(layerId);
          setInteractiveLayerIds(interactiveLayerIds);
        }}
      />

      {/* Sources and Layers */}
      {visibleLayer === constants.LEGACY_LAYER_ID && (
        <>
          {/* Default Low */}
          <Source
            id={constants.LOW_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('default/legacy', 'low')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
            minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
          >
            <Layer
              id={constants.LOW_ZOOM_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={[
                '>',
                constants.SCORE_PROPERTY_LOW,
                constants.SCORE_BOUNDARY_THRESHOLD,
              ]}
              type="fill"
              paint={{
                'fill-color': constants.PRIORITIZED_FEATURE_FILL_COLOR,
                'fill-opacity':
                  constants.LOW_ZOOM_PRIORITIZED_FEATURE_FILL_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
              minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
            />
          </Source>

          {/* Default High */}
          <Source
            id={constants.HIGH_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('default/legacy', 'high')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_HIGH}
            minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
          >
            {/* High zoom layer (static) - non-prioritized features only */}
            <Layer
              id={constants.HIGH_ZOOM_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={['==', constants.SCORE_PROPERTY_HIGH, false]}
              type="fill"
              paint={{
                'fill-opacity': constants.NON_PRIORITIZED_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - prioritized features only */}
            <Layer
              id={constants.PRIORITIZED_HIGH_ZOOM_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={['==', constants.SCORE_PROPERTY_HIGH, true]}
              type="fill"
              paint={{
                'fill-color': constants.PRIORITIZED_FEATURE_FILL_COLOR,
                'fill-opacity':
                  constants.HIGH_ZOOM_PRIORITIZED_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - grandfathered features only */}
            <Layer
              id={constants.GRANDFATHERED_HIGH_ZOOM_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={['==', constants.IS_GRANDFATHERED, true]}
              type="fill"
              paint={{
                'fill-color': constants.GRANDFATHERED_FEATURE_FILL_COLOR,
                'fill-opacity':
                  constants.HIGH_ZOOM_PRIORITIZED_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - controls the border between features */}
            <Layer
              id={constants.FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="line"
              paint={{
                'line-color': constants.FEATURE_BORDER_COLOR,
                'line-width': constants.FEATURE_BORDER_WIDTH,
                'line-opacity': constants.FEATURE_BORDER_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_FEATURE_BORDER}
              minzoom={constants.GLOBAL_MIN_ZOOM_FEATURE_BORDER}
            />
            <Layer
              id={constants.SELECTED_FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={filter} // This filter filters out all other features except the selected feature.
              type="line"
              paint={{
                'line-color': constants.SELECTED_FEATURE_BORDER_COLOR,
                'line-width': constants.SELECTED_FEATURE_BORDER_WIDTH,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />
          </Source>
        </>
      )}

      {visibleLayer === constants.PSIM_BURDEN_LAYER_ID && (
        <>
          {/* GI Star burden Low */}
          <Source
            id={constants.PSIM_BURDEN_LOW_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('gistar/burd', 'low')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
            minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
          >
            <Layer
              id={constants.PSIM_BURDEN_LOW_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'step',
                  ['get', constants.PSIM_BURDEN],
                  constants.PSIM_DEFAULT_COLOR,
                  -0.05,
                  constants.PSIM_COLD_COLOR,
                  -0.01,
                  constants.PSIM_VERY_COLD_COLOR,
                  -1e-12,
                  constants.PSIM_HOT_COLOR,
                  0.01,
                  constants.PSIM_VERY_HOT_COLOR,
                  0.05,
                  constants.PSIM_NA_COLOR,
                ],
                'fill-opacity': constants.LOW_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
              minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
            />
          </Source>

          {/* GI Star Burden High */}
          <Source
            id={constants.PSIM_BURDEN_HIGH_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('gistar/burd', 'high')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_HIGH}
            minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
          >
            <Layer
              id={constants.PSIM_BURDEN_HIGH_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={[
                '>',
                constants.TOTAL_POPULATION,
                constants.PSIM_POP_THRESHOLD,
              ]}
              type="fill"
              paint={{
                'fill-color': [
                  'step',
                  ['get', constants.PSIM_BURDEN],
                  constants.PSIM_DEFAULT_COLOR,
                  -0.05,
                  constants.PSIM_COLD_COLOR,
                  -0.01,
                  constants.PSIM_VERY_COLD_COLOR,
                  -1e-12,
                  constants.PSIM_HOT_COLOR,
                  0.01,
                  constants.PSIM_VERY_HOT_COLOR,
                  0.05,
                  constants.PSIM_NA_COLOR,
                ],
                'fill-opacity': constants.HIGH_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - controls the border between features */}
            <Layer
              id={constants.FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="line"
              paint={{
                'line-color': constants.PSIM_FEATURE_BORDER_COLOR,
                'line-width': constants.FEATURE_BORDER_WIDTH,
                'line-opacity': constants.FEATURE_BORDER_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_FEATURE_BORDER}
              minzoom={constants.GLOBAL_MIN_ZOOM_FEATURE_BORDER}
            />

            {/* High zoom layer (dynamic) - controls the border of selected features */}
            <Layer
              id={constants.PSIM_BURD_SELECTED_FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={filter} // This filter filters out all other features except the selected feature.
              type="line"
              paint={{
                'line-color': constants.PSIM_SELECTED_FEATURE_BORDER_COLOR,
                'line-width': constants.SELECTED_FEATURE_BORDER_WIDTH,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />
          </Source>
        </>
      )}

      {visibleLayer === constants.PSIM_INDICATOR_LAYER_ID && (
        <>
          {/* GI Star IND Low */}
          <Source
            id={constants.PSIM_INDICATOR_LOW_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('gistar/ind', 'low')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
            minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
          >
            <Layer
              id={constants.PSIM_INDICATOR_LOW_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'step',
                  ['get', constants.PSIM_INDICATOR],
                  constants.PSIM_DEFAULT_COLOR,
                  -0.05,
                  constants.PSIM_COLD_COLOR,
                  -0.01,
                  constants.PSIM_VERY_COLD_COLOR,
                  -1e-12,
                  constants.PSIM_HOT_COLOR,
                  0.01,
                  constants.PSIM_VERY_HOT_COLOR,
                  0.05,
                  constants.PSIM_NA_COLOR,
                ],
                'fill-opacity': constants.LOW_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
              minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
            />
          </Source>

          {/* GI Star High IND */}
          <Source
            id={constants.PSIM_INDICATOR_HIGH_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('gistar/ind', 'high')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_HIGH}
            minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
          >
            <Layer
              id={constants.PSIM_INDICATOR_HIGH_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={[
                '>',
                constants.TOTAL_POPULATION,
                constants.PSIM_POP_THRESHOLD,
              ]}
              type="fill"
              paint={{
                'fill-color': [
                  'step',
                  ['get', constants.PSIM_INDICATOR],
                  constants.PSIM_DEFAULT_COLOR,
                  -0.05,
                  constants.PSIM_COLD_COLOR,
                  -0.01,
                  constants.PSIM_VERY_COLD_COLOR,
                  -1e-12,
                  constants.PSIM_HOT_COLOR,
                  0.01,
                  constants.PSIM_VERY_HOT_COLOR,
                  0.05,
                  constants.PSIM_NA_COLOR,
                ],
                'fill-opacity': constants.HIGH_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - controls the border between features */}
            <Layer
              id={constants.FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="line"
              paint={{
                'line-color': constants.PSIM_FEATURE_BORDER_COLOR,
                'line-width': constants.FEATURE_BORDER_WIDTH,
                'line-opacity': constants.FEATURE_BORDER_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_FEATURE_BORDER}
              minzoom={constants.GLOBAL_MIN_ZOOM_FEATURE_BORDER}
            />

            <Layer
              id={constants.PSIM_IND_SELECTED_FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={filter} // This filter filters out all other features except the selected feature.
              type="line"
              paint={{
                'line-color': constants.PSIM_SELECTED_FEATURE_BORDER_COLOR,
                'line-width': constants.SELECTED_FEATURE_BORDER_WIDTH,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />
          </Source>
        </>
      )}

      {visibleLayer === constants.ADD_BURDEN_LAYER_ID && (
        <>
          {/* Additive BURD Low */}
          <Source
            id={constants.ADD_BURD_LOW_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('add/burd', 'low')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
            minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
          >
            <Layer
              id={constants.ADD_BURDEN_LOW_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', constants.ADD_BURD],
                  0,
                  constants.ADD_0_COLOR,
                  1,
                  constants.ADD_1_COLOR,
                  2,
                  constants.ADD_2_COLOR,
                  3,
                  constants.ADD_3_COLOR,
                  4,
                  constants.ADD_4_COLOR,
                  5,
                  constants.ADD_5_COLOR,
                  6,
                  constants.ADD_6_COLOR,
                  7,
                  constants.ADD_7_COLOR,
                ],
                'fill-opacity': constants.LOW_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
              minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
            />
          </Source>

          {/* Additive High */}
          <Source
            id={constants.ADD_BURD_HIGH_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('add/burd', 'high')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_HIGH}
            minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
          >
            <Layer
              id={constants.ADD_BURDEN_HIGH_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', constants.ADD_BURD],
                  0,
                  constants.ADD_0_COLOR,
                  1,
                  constants.ADD_1_COLOR,
                  2,
                  constants.ADD_2_COLOR,
                  3,
                  constants.ADD_3_COLOR,
                  4,
                  constants.ADD_4_COLOR,
                  5,
                  constants.ADD_5_COLOR,
                  6,
                  constants.ADD_6_COLOR,
                  7,
                  constants.ADD_7_COLOR,
                ],
                'fill-opacity': constants.HIGH_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - controls the border between features */}
            <Layer
              id={constants.FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="line"
              paint={{
                'line-color': constants.ADD_FEATURE_BORDER_COLOR,
                'line-width': constants.FEATURE_BORDER_WIDTH,
                'line-opacity': constants.FEATURE_BORDER_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_FEATURE_BORDER}
              minzoom={constants.GLOBAL_MIN_ZOOM_FEATURE_BORDER}
            />

            {/* High zoom ADDITIVE layer (dynamic) - border styling around the selected feature */}
            <Layer
              id={constants.ADD_BURD_SELECTED_FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={filter} // This filter filters out all other features except the selected feature.
              type="line"
              paint={{
                'line-color': constants.ADD_SELECTED_FEATURE_BORDER_COLOR,
                'line-width': constants.SELECTED_FEATURE_BORDER_WIDTH,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />
          </Source>
        </>
      )}

      {visibleLayer === constants.ADD_INDICATOR_LAYER_ID && (
        <>
          {/* Additive IND Low */}
          <Source
            id={constants.ADD_IND_LOW_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('add/ind', 'low')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
            minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
          >
            <Layer
              id={constants.ADD_INDICATOR_LOW_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', constants.ADD_IND],
                  0,
                  constants.ADD_0_COLOR,
                  2,
                  constants.ADD_1_COLOR,
                  4,
                  constants.ADD_2_COLOR,
                  6,
                  constants.ADD_3_COLOR,
                  8,
                  constants.ADD_4_COLOR,
                  10,
                  constants.ADD_5_COLOR,
                  12,
                  constants.ADD_6_COLOR,
                  14,
                  constants.ADD_7_COLOR,
                ],
                'fill-opacity': constants.LOW_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_LOW}
              minzoom={constants.GLOBAL_MIN_ZOOM_LOW}
            />
          </Source>

          {/* Additive High */}
          <Source
            id={constants.ADD_IND_HIGH_ZOOM_SOURCE_NAME}
            type="vector"
            promoteId={constants.GEOID_PROPERTY}
            tiles={[featureURLForTilesetName('add/ind', 'high')]}
            maxzoom={constants.GLOBAL_MAX_ZOOM_HIGH}
            minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
          >
            <Layer
              id={constants.ADD_INDICATOR_HIGH_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', constants.ADD_IND],
                  0,
                  constants.ADD_0_COLOR,
                  2,
                  constants.ADD_1_COLOR,
                  4,
                  constants.ADD_2_COLOR,
                  6,
                  constants.ADD_3_COLOR,
                  8,
                  constants.ADD_4_COLOR,
                  10,
                  constants.ADD_5_COLOR,
                  12,
                  constants.ADD_6_COLOR,
                  14,
                  constants.ADD_7_COLOR,
                ],
                'fill-opacity': constants.HIGH_ZOOM_PSIM_FEATURE_FILL_OPACITY,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />

            {/* High zoom layer (static) - controls the border between features */}
            <Layer
              id={constants.FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              type="line"
              paint={{
                'line-color': constants.ADD_FEATURE_BORDER_COLOR,
                'line-width': constants.FEATURE_BORDER_WIDTH,
                'line-opacity': constants.FEATURE_BORDER_OPACITY,
              }}
              maxzoom={constants.GLOBAL_MAX_ZOOM_FEATURE_BORDER}
              minzoom={constants.GLOBAL_MIN_ZOOM_FEATURE_BORDER}
            />

            {/* High zoom ADDITIVE layer (dynamic) - border styling around the selected feature */}
            <Layer
              id={constants.ADD_IND_SELECTED_FEATURE_BORDER_LAYER_ID}
              source-layer={constants.SCORE_SOURCE_LAYER}
              filter={filter} // This filter filters out all other features except the selected feature.
              type="line"
              paint={{
                'line-color': constants.ADD_SELECTED_FEATURE_BORDER_COLOR,
                'line-width': constants.SELECTED_FEATURE_BORDER_WIDTH,
              }}
              minzoom={constants.GLOBAL_MIN_ZOOM_HIGH}
            />
          </Source>
        </>
      )}
    </>
  );
};
export default MapTractLayers;
