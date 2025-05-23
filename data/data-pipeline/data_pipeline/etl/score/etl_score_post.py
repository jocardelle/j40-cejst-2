import json
from pathlib import Path

import numpy as np
from numpy import float64
import pandas as pd
import geopandas as gpd

from data_pipeline.content.schemas.download_schemas import CodebookConfig
from data_pipeline.content.schemas.download_schemas import CSVConfig
from data_pipeline.content.schemas.download_schemas import ExcelConfig
from data_pipeline.etl.base import ExtractTransformLoad
from data_pipeline.etl.score.etl_utils import create_codebook
from data_pipeline.etl.score.etl_utils import floor_series
from data_pipeline.etl.sources.census.etl_utils import check_census_data_source
from data_pipeline.score import field_names
from data_pipeline.utils import column_list_from_yaml_object_fields
from data_pipeline.utils import get_module_logger
from data_pipeline.utils import load_dict_from_yaml_object_fields
from data_pipeline.utils import load_yaml_dict_from_file
from data_pipeline.utils import zip_files
from data_pipeline.etl.datasource import DataSource
from data_pipeline.etl.downloader import Downloader

from . import constants

logger = get_module_logger(__name__)

# Define the DAC variable
DISADVANTAGED_COMMUNITIES_FIELD = field_names.SCORE_N_COMMUNITIES


class PostScoreETL(ExtractTransformLoad):
    """
    A class used to instantiate an ETL object to retrieve and process data from
    datasets.
    """

    STATE_CODE_COLUMN = "State Code"

    def __init__(self, data_source: str = None):
        self.DATA_SOURCE = data_source
        self.input_counties_df: pd.DataFrame
        self.input_states_df: pd.DataFrame
        self.input_score_df: pd.DataFrame
        self.input_census_geo_df: gpd.GeoDataFrame

        self.output_score_county_state_merged_df: pd.DataFrame
        self.output_score_tiles_df: pd.DataFrame
        self.output_downloadable_df: pd.DataFrame
        self.output_tract_search_df: pd.DataFrame

        # Define some constants for the YAML file
        # TODO: Implement this as a marshmallow schema.
        # TODO: Ticket: https://github.com/usds/justice40-tool/issues/1327
        self.yaml_fields_type_percentage_label = "percentage"
        self.yaml_fields_type_loss_rate_percentage_label = (
            "loss_rate_percentage"
        )
        self.yaml_fields_type_float_label = "float"
        self.yaml_fields_type_string_label = "string"
        self.yaml_fields_type_boolean_label = "bool"
        self.yaml_fields_type_integer_label = "int64"
        self.yaml_excel_sheet_label = "label"
        self.yaml_global_config_rounding_num = "rounding_num"
        self.yaml_global_config_rounding_num_float = "float"
        self.yaml_global_config_sort_by_label = "sort_by_label"
        # End YAML definition constants

    def get_data_sources(self) -> [DataSource]:
        return (
            []
        )  # we have all prerequisite sources locally as a result of generating the score


    ## The data sources they're using here are:
    # - Counties
    # - States
    # - Score
    # - Census GeoJSON
    ## As far as I can tell, We have the states data, we have the score data frame that we gave it, and we have the us_geo.parquet that I assume is for the gsojson. We're missing the counties data, which would explain why we have ~13000 missing counties in the usa_counties final csv.

    def _extract_counties(self, county_path: Path) -> pd.DataFrame:
        logger.debug("Reading Counties CSV")
        return pd.read_csv(
            county_path,
            sep="\t",
            dtype={
                "GEOID": "string",
                "USPS": "string",
            },
            low_memory=False,
            encoding="latin-1",
        )

    def _extract_states(self, state_path: Path) -> pd.DataFrame:
        logger.debug("Reading States CSV")
        return pd.read_csv(
            state_path,
            dtype={"fips": "string", "state_abbreviation": "string"},
            usecols=["fips", "state_name", "state_abbreviation"],
        )

    def _extract_score(self, score_path: Path) -> pd.DataFrame:
        logger.debug("Reading Score")
        df = pd.read_parquet(score_path)

        # Convert total population to an int
        df["Total population"] = df["Total population"].astype(
            int, errors="ignore"
        )

        return df

    def _extract_census_geojson(self, geo_path: Path) -> gpd.GeoDataFrame:
        """
        Read in the Census Geo JSON data.

        Returns:
           gpd.GeoDataFrame: the census geo json data
        """
        logger.debug("Reading Census GeoJSON")
        data = gpd.read_parquet(geo_path)
        return data

    def extract(self, use_cached_data_sources: bool = False) -> None:

        super().extract(
            use_cached_data_sources
        )  # download and extract data sources

        # check census data
        check_census_data_source(
            census_data_path=self.DATA_PATH / "census",
            census_data_source=self.DATA_SOURCE,
        )

        # TODO would could probably add this to the data sources for this file
        Downloader.download_zip_file_from_url(
            constants.CENSUS_COUNTIES_ZIP_URL, constants.TMP_PATH
        )

        self.input_counties_df = self._extract_counties(
            constants.CENSUS_COUNTIES_FILE_NAME
        )
        self.input_states_df = self._extract_states(
            constants.DATA_CENSUS_CSV_STATE_FILE_PATH
        )
        self.input_score_df = self._extract_score(
            constants.DATA_SCORE_CSV_FULL_FILE_PATH
        )
        self.input_census_geo_df = self._extract_census_geojson(
            constants.DATA_CENSUS_GEOJSON_FILE_PATH
        )

    def _transform_counties(
        self, initial_counties_df: pd.DataFrame
    ) -> pd.DataFrame:
        """
        Necessary modifications to the counties dataframe
        """
        # Rename some of the columns to prepare for merge
        # USPS, GEOID, NAME 
        new_df = initial_counties_df[constants.CENSUS_COUNTIES_COLUMNS]

        new_df_copy = new_df.rename(
            columns={"USPS": "State Abbreviation", "NAME": "County Name"},
            inplace=False,
        )

        return new_df_copy

    def _transform_states(
        self, initial_states_df: pd.DataFrame
    ) -> pd.DataFrame:
        """
        Necessary modifications to the states dataframe
        """
        # remove unnecessary columns
        new_df = initial_states_df.rename(
            columns={
                "fips": self.STATE_CODE_COLUMN,
                "state_name": field_names.STATE_FIELD,
                "state_abbreviation": "State Abbreviation",
            }
        )
        return new_df

    def _transform_score(self, initial_score_df: pd.DataFrame) -> pd.DataFrame:
        """
        Not sure why they're adding GEOID to score df when they used it to merge in etl_score.py??

        Add the GEOID field to the score dataframe to do the merge with counties
        """
        # add GEOID column for counties
        # First convert to type str because our df had it as num
        initial_score_df[self.GEOID_TRACT_FIELD_NAME] = initial_score_df[self.GEOID_TRACT_FIELD_NAME].astype(str)
        # logger.debug(initial_score_df[self.GEOID_TRACT_FIELD_NAME].str.len().value_counts())

        initial_score_df["GEOID"] = initial_score_df[
            self.GEOID_TRACT_FIELD_NAME
        ].str[:5]
        # Pulling first 5 digits of the GEOID to match the counties df

        return initial_score_df

    def _create_score_data(
        self,
        counties_df: pd.DataFrame,
        states_df: pd.DataFrame,
        score_df: pd.DataFrame,
    ) -> pd.DataFrame:

        logger.debug("Merging county info with score info")
        score_county_merged = score_df.merge(
            # We drop state abbreviation so we don't get it twice
            counties_df[["GEOID", "County Name"]],
            on="GEOID",  # GEOID is the county ID
            how="left",
        )

        logger.debug(score_county_merged[self.GEOID_TRACT_FIELD_NAME].str.len().value_counts())

        logger.debug("Merging state info with county-score info")
        # Here, we need to join on a separate key, since there's no
        # entry for the island areas in the counties df (there are no
        # counties!) Thus, unless we join state separately from county,
        # when we join on GEOID, we lose information about the islands
        score_county_merged[self.STATE_CODE_COLUMN] = score_county_merged[
            self.GEOID_TRACT_FIELD_NAME
        ].str[:2]
        # TODO: For future reference, we could also refactor this code so that
        # the FIPS / State or Territory / County info gets created as an ETL
        # process and joined in etl_score, rather than added in post like this.
        # That would be a bit more consistent and automatically parallelized
        score_county_state_merged = score_county_merged.merge(
            states_df,
            left_on=self.STATE_CODE_COLUMN,
            right_on=self.STATE_CODE_COLUMN,
            how="left",
        )
        assert score_county_merged[
            self.GEOID_TRACT_FIELD_NAME
        ].is_unique, "Merging state/county data introduced duplicate rows"
        # set the score to the new df
        # logger.debug(f"Available columns in score_county_state_merged_df: {score_county_state_merged.columns}")
        return score_county_state_merged

    def _create_tile_data(
        self,
        score_county_state_merged_df: pd.DataFrame,
    ) -> pd.DataFrame:

        logger.debug("Rounding Decimals")
        # grab all the keys from tiles score columns
        tiles_score_column_titles = list(constants.TILES_SCORE_COLUMNS.keys())

        # filter the columns on full score
        score_tiles = score_county_state_merged_df[
            tiles_score_column_titles
        ].copy()

        # We may not want some states/territories on the map, so this will drop all
        # rows with those FIPS codes (first two digits of the census tract)
        logger.debug(
            f"Dropping specified FIPS codes from tile data: {constants.DROP_FIPS_CODES}"
        )
        # DROP_FIPS_CODE is currently empty
        tracts_to_drop = []
        for fips_code in constants.DROP_FIPS_CODES:
            tracts_to_drop += score_tiles[
                score_tiles[field_names.GEOID_TRACT_FIELD].str.startswith(
                    fips_code
                )
            ][field_names.GEOID_TRACT_FIELD].to_list()
        score_tiles = score_tiles[
            ~score_tiles[field_names.GEOID_TRACT_FIELD].isin(tracts_to_drop)
        ]
        float_cols = [
            col
            for col, col_dtype in score_tiles.dtypes.items()
            if col_dtype == np.dtype("float64")
        ]
        scale_factor = 10 ** constants.TILES_ROUND_NUM_DECIMALS
        score_tiles[float_cols] = (
            score_tiles[float_cols] * scale_factor
        ).apply(np.floor) / scale_factor

        logger.debug("Adding fields for island areas and Puerto Rico")
        # The below operation constructs variables for the front end.
        # Since the Island Areas, Puerto Rico, and the nation all have a different
        # set of available data, each has its own user experience.

        # First, we identify which user experience -- Puerto Rico, islands, or nation --
        # a row pertains to using the FIPS codes
        fips_code_series = score_tiles[field_names.GEOID_TRACT_FIELD].str[:2]
        score_tiles[constants.USER_INTERFACE_EXPERIENCE_FIELD_NAME] = np.where(
            fips_code_series.isin(constants.TILES_PUERTO_RICO_FIPS_CODE),
            constants.PUERTO_RICO_USER_EXPERIENCE,
            np.where(
                fips_code_series.isin(constants.TILES_ISLAND_AREA_FIPS_CODES),
                constants.ISLAND_AREAS_USER_EXPERIENCE,
                constants.NATION_USER_EXPERIENCE,
            ),
        )

        # Next, we determine how many thresholds the front end should show, entirely
        # based on the variable for user interface experience.
        score_tiles[constants.THRESHOLD_COUNT_TO_SHOW_FIELD_NAME] = score_tiles[
            constants.USER_INTERFACE_EXPERIENCE_FIELD_NAME
        ].map(
            {
                constants.PUERTO_RICO_USER_EXPERIENCE: constants.TILES_PUERTO_RICO_THRESHOLD_COUNT,
                constants.ISLAND_AREAS_USER_EXPERIENCE: constants.TILES_ISLAND_AREAS_THRESHOLD_COUNT,
                constants.NATION_USER_EXPERIENCE: constants.TILES_NATION_THRESHOLD_COUNT,
            }
        )

        # create indexes
        score_tiles = score_tiles.rename(
            columns=constants.TILES_SCORE_COLUMNS,
            inplace=False,
        )

        # logger.debug(score_tiles[field_names.GEOID_TRACT_FIELD].str.len().value_counts())
        # logger.debug(f"Available columns: {score_tiles.columns}")

        # write the json map to disk
        inverse_tiles_columns = {
            v: k for k, v in constants.TILES_SCORE_COLUMNS.items()
        }  # reverse dict
        index_file_path = constants.DATA_SCORE_JSON_INDEX_FILE_PATH
        index_file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(index_file_path, "w", encoding="utf-8") as fp:
            json.dump(inverse_tiles_columns, fp)

        return score_tiles

    def _create_downloadable_data(
        self, score_df: pd.DataFrame, fields_object: dict, config_object: dict
    ) -> pd.DataFrame:

        df = score_df[
            column_list_from_yaml_object_fields(
                yaml_object=fields_object,
                target_field="score_name",
            )
        ].copy(deep=True)

        column_type_dict = load_dict_from_yaml_object_fields(
            yaml_object=fields_object,
            object_key="score_name",
            object_value="format",
        )

        for column in df.columns:
            if (
                column_type_dict[column]
                == self.yaml_fields_type_percentage_label
            ):
                # Convert percentages from fractions between 0 and 1 to an integer
                # from 0 to 100.
                df_100 = df[column] * 100
                df_int = np.floor(
                    pd.to_numeric(df_100, errors="coerce")
                ).astype("Int64")
                df[column] = df_int

            elif (
                column_type_dict[column]
                == self.yaml_fields_type_loss_rate_percentage_label
            ):
                # Convert loss rates by multiplying by 100 (they are percents)
                # and then rounding appropriately.
                df_100 = df[column] * 100
                df[column] = floor_series(
                    series=df_100.astype(float64),
                    number_of_decimals=config_object[
                        self.yaml_global_config_rounding_num
                    ][self.yaml_fields_type_loss_rate_percentage_label],
                )

            elif column_type_dict[column] == self.yaml_fields_type_float_label:
                # Round the floats.
                df[column] = floor_series(
                    series=df[column].astype(float64),
                    number_of_decimals=config_object[
                        self.yaml_global_config_rounding_num
                    ][self.yaml_global_config_rounding_num_float],
                )

            elif column_type_dict[column] == self.yaml_fields_type_string_label:
                pass

            elif (
                column_type_dict[column] == self.yaml_fields_type_boolean_label
            ):
                pass

            elif (
                column_type_dict[column] == self.yaml_fields_type_integer_label
            ):
                pass

            else:
                raise ValueError(
                    f"Unrecognized type: `{column_type_dict[column]}`"
                )

        # rename fields
        column_rename_dict = load_dict_from_yaml_object_fields(
            yaml_object=fields_object,
            object_key="score_name",
            object_value="label",
        )
        renamed_df = df.rename(
            columns=column_rename_dict,
            inplace=False,
        )

        # sort if needed
        if config_object.get(self.yaml_global_config_sort_by_label):
            final_df = renamed_df.sort_values(
                config_object[self.yaml_global_config_sort_by_label]
            )
        else:
            final_df = renamed_df

        return final_df

    def _create_tract_search_data(
        self, census_geojson: gpd.GeoDataFrame
    ) -> pd.DataFrame:
        """
        Generate a dataframe with only the tract IDs and the center lat/lon of each tract.

        Returns:
            pd.DataFrame: a dataframe with the tract search data
        """
        logger.debug("Creating Census tract search data")
        columns_to_extract = ["GEOID10", "INTPTLAT10", "INTPTLON10"]
        return pd.DataFrame(census_geojson[columns_to_extract])

    def transform(self) -> None:
        self.output_tract_search_df = self._create_tract_search_data(
            self.input_census_geo_df
        )
        transformed_counties = self._transform_counties(self.input_counties_df)
        transformed_states = self._transform_states(self.input_states_df)
        transformed_score = self._transform_score(self.input_score_df)

        output_score_county_state_merged_df = self._create_score_data(
            transformed_counties,
            transformed_states,
            transformed_score,
        )

        self.output_score_tiles_df = self._create_tile_data(
            output_score_county_state_merged_df
        )
        self.output_score_county_state_merged_df = (
            output_score_county_state_merged_df
        )
        self.output_tract_search_df = self._create_tract_search_data(
            self.input_census_geo_df
        )

    def _load_score_csv_full(
        self, score_county_state_merged: pd.DataFrame, score_csv_path: Path
    ) -> None:
        logger.debug("Saving Full Score CSV with County Information")
        score_csv_path.parent.mkdir(parents=True, exist_ok=True)
        score_county_state_merged.to_csv(
            score_csv_path,
            index=False,
            encoding="utf-8-sig",  # windows compat https://stackoverflow.com/a/43684587
        )

    def _load_excel_from_df(
        self, excel_df: pd.DataFrame, excel_path: Path
    ) -> dict:
        """Creates excel file from score data using configs from yml file and returns
        contents of the yml file.

        First it reads the yaml dictionary from the excel.yml config and adjusts the
        format of the excel file.

        Then it produces the excel file from the score data.
        """

        # open excel yaml config
        excel_csv_config = load_yaml_dict_from_file(
            self.CONTENT_CONFIG / "excel.yml", ExcelConfig
        )

        # Define Excel Columns Column Width
        num_excel_cols_width = excel_csv_config["global_config"][
            "excel_config"
        ]["default_column_width"]

        # Create a Pandas Excel writer using XlsxWriter as the engine.
        with pd.ExcelWriter(  # pylint: disable=abstract-class-instantiated
            # (https://github.com/PyCQA/pylint/issues/3060)
            excel_path,
            engine="xlsxwriter",
        ) as writer:

            for sheet in excel_csv_config["sheets"]:
                excel_df = self._create_downloadable_data(
                    score_df=self.output_score_county_state_merged_df,
                    fields_object=sheet["fields"],
                    config_object=excel_csv_config["global_config"],
                )
                # Convert the dataframe to an XlsxWriter Excel object. We also turn off the
                # index column at the left of the output dataframe.
                excel_df.to_excel(
                    writer,
                    sheet_name=sheet[self.yaml_excel_sheet_label],
                    index=False,
                )

                # Get the xlsxwriter workbook and worksheet objects.
                workbook = writer.book
                worksheet = writer.sheets[sheet[self.yaml_excel_sheet_label]]

                # set header format
                header_format = workbook.add_format(
                    {"bold": True, "text_wrap": True, "valign": "bottom"}
                )

                # write headers
                for col_num, value in enumerate(excel_df.columns.array):
                    worksheet.write(0, col_num, value, header_format)

                num_cols = len(excel_df.columns)
                worksheet.set_column(0, num_cols - 1, num_excel_cols_width)

        return excel_csv_config

    def _load_tile_csv(
        self, score_tiles_df: pd.DataFrame, tile_score_path: Path
    ) -> None:
        logger.debug("Saving Tile Score CSV")
        tile_score_path.parent.mkdir(parents=True, exist_ok=True)
        score_tiles_df.to_csv(tile_score_path, index=False, encoding="utf-8")
        # assert self.output_score_tiles_df[field_names.GEOID_TRACT_FIELD].str.len().eq(11).all(), "Some GEOIDs are not 11 digits!"

    def _load_downloadable_zip(self, downloadable_info_path: Path) -> None:
        downloadable_info_path.mkdir(parents=True, exist_ok=True)
        csv_path = constants.SCORE_DOWNLOADABLE_CSV_FILE_PATH
        excel_path = constants.SCORE_DOWNLOADABLE_EXCEL_FILE_PATH
        codebook_path = constants.SCORE_DOWNLOADABLE_CODEBOOK_FILE_PATH
        readme_path = constants.SCORE_VERSIONING_README_FILE_PATH
        csv_zip_path = constants.SCORE_DOWNLOADABLE_CSV_ZIP_FILE_PATH
        xls_zip_path = constants.SCORE_DOWNLOADABLE_XLS_ZIP_FILE_PATH
        score_downloadable_pdf_file_path = (
            constants.SCORE_DOWNLOADABLE_PDF_FILE_PATH
        )
        score_downloadable_tsd_file_path = (
            constants.SCORE_DOWNLOADABLE_TSD_FILE_PATH
        )
        version_data_documentation_zip_path = (
            constants.SCORE_VERSIONING_DATA_DOCUMENTATION_ZIP_FILE_PATH
        )

        logger.debug("Writing downloadable excel")
        excel_config = self._load_excel_from_df(
            excel_df=self.output_score_county_state_merged_df,
            excel_path=excel_path,
        )

        logger.debug("Writing downloadable csv")
        # open yaml config
        downloadable_csv_config = load_yaml_dict_from_file(
            self.CONTENT_CONFIG / "csv.yml", CSVConfig
        )
        downloadable_df = self._create_downloadable_data(
            score_df=self.output_score_county_state_merged_df,
            fields_object=downloadable_csv_config["fields"],
            config_object=downloadable_csv_config["global_config"],
        )
        downloadable_df.to_csv(csv_path, index=False)

        logger.debug("Creating codebook for download zip")

        # consolidate all excel fields from the config yml. The codebook
        # code takes in a list of fields, but the excel config file
        # has a slightly different format to allow for sheets within the
        # workbook. This pulls all fields from all potential sheets into one
        # list of dictionaries that specify information on each field.
        excel_fields = []
        for sheet in excel_config["sheets"]:
            excel_fields.extend(sheet["fields"])

        # load supplemental codebook yml
        field_descriptions_for_codebook_config = load_yaml_dict_from_file(
            self.CONTENT_CONFIG / "field_descriptions_for_codebook.yml",
            CodebookConfig,
        )

        # create codebook
        codebook_df = create_codebook(
            downloadable_csv_config=downloadable_csv_config["fields"],
            excel_config=excel_fields,
            field_descriptions_for_codebook=field_descriptions_for_codebook_config[
                "fields"
            ],
        )
        assert codebook_df["csv_label"].equals(codebook_df["excel_label"]), (
            "CSV and Excel differ. If that's intentional, "
            "remove this assertion. Otherwise, fix it."
        )
        # Check the codebook to make sure it matches the download files
        assert not set(codebook_df["csv_label"].dropna()).difference(
            downloadable_df.columns
        ), "Codebook is missing columns from downloadable files"
        assert (
            len(
                downloadable_df.columns.difference(
                    set(codebook_df["csv_label"])
                )
            )
            == 0
        ), "Codebook has columns the downloadable files do not"

        # load codebook to disk
        codebook_df.to_csv(codebook_path, index=False)

        # zip assets
        logger.debug("Compressing csv files")
        files_to_compress = [csv_path, codebook_path, readme_path]
        zip_files(csv_zip_path, files_to_compress)

        logger.debug("Compressing xls files")
        files_to_compress = [excel_path, codebook_path, readme_path]
        zip_files(xls_zip_path, files_to_compress)

        # Per #1557
        # zip file that contains the .xls, .csv, .pdf, tech support document, checksum file
        logger.debug("Compressing data and documentation files")
        files_to_compress = [
            excel_path,
            csv_path,
            score_downloadable_pdf_file_path,
            score_downloadable_tsd_file_path,
            readme_path,
        ]
        zip_files(version_data_documentation_zip_path, files_to_compress)

    def _load_search_tract_data(self, output_path: Path):
        """Write the Census tract search data."""
        logger.debug("Writing Census tract search data")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # We use the records orientation to easily import the JSON in JS.
        self.output_tract_search_df.to_json(output_path, orient="records")

    def load(self) -> None:
        self._load_score_csv_full(
            self.output_score_county_state_merged_df,
            constants.FULL_SCORE_CSV_FULL_PLUS_COUNTIES_FILE_PATH,
        )
        self._load_tile_csv(
            self.output_score_tiles_df, constants.DATA_SCORE_CSV_TILES_FILE_PATH
        )
        self._load_search_tract_data(constants.SCORE_TRACT_SEARCH_FILE_PATH)
        self._load_downloadable_zip(constants.SCORE_DOWNLOADABLE_DIR)
