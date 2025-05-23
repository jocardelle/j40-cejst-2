import concurrent.futures
import importlib
import time
import typing
import os

from functools import reduce

from data_pipeline.etl.score.etl_score import ScoreETL
from data_pipeline.etl.score.etl_score_geo import GeoScoreETL
from data_pipeline.etl.score.etl_score_geo_gistar_burd import GeoScoreGIStarBurdETL
from data_pipeline.etl.score.etl_score_geo_gistar_ind import GeoScoreGIStarIndETL
from data_pipeline.etl.score.etl_score_geo_add_burd import GeoScoreAddBurdETL
from data_pipeline.etl.score.etl_score_geo_add_ind import GeoScoreAddIndETL
from data_pipeline.etl.score.etl_score_post import PostScoreETL
from data_pipeline.utils import get_module_logger
from data_pipeline.etl.base import ExtractTransformLoad
from data_pipeline.etl.datasource import DataSource

from . import constants

logger = get_module_logger(__name__)


def _get_datasets_to_run(dataset_to_run: str) -> typing.List[dict]:
    """Returns a list of appropriate datasets to run given input args

    Args:
        dataset_to_run (str): Run a specific ETL process. If missing, runs all processes (optional)

    Returns:
        None
    """
    dataset_list = constants.DATASET_LIST
    etls_to_search = dataset_list + [constants.CENSUS_INFO]

    if dataset_to_run:
        dataset_element = next(
            (item for item in etls_to_search if item["name"] == dataset_to_run),
            None,
        )
        if not dataset_element:
            raise ValueError("Invalid dataset name")
        else:
            # reset the list to just the dataset
            dataset_list = [dataset_element]

    return dataset_list


def _get_dataset(dataset: dict) -> ExtractTransformLoad:
    """Instantiates a dataset object from a dictionary description of that object's class"""
    etl_module = importlib.import_module(
        f"data_pipeline.etl.sources.{dataset['module_dir']}.etl"
    )
    etl_class = getattr(etl_module, dataset["class_name"])
    etl_instance = etl_class()

    return etl_instance


def _run_one_dataset(dataset: dict, use_cache: bool = False) -> None:
    """Runs one etl process."""

    start_time = time.time()

    logger.info(f"Running ETL for {dataset['name']}")
    etl_instance = _get_dataset(dataset)

    # run extract
    logger.debug(f"Extracting {dataset['name']}")
    etl_instance.extract(use_cache)

    # run transform
    logger.debug(f"Transforming {dataset['name']}")
    etl_instance.transform()

    # run load
    logger.debug(f"Loading {dataset['name']}")
    etl_instance.load()

    # run validate
    logger.debug(f"Validating {dataset['name']}")
    etl_instance.validate()

    # cleanup
    logger.debug(f"Cleaning up {dataset['name']}")
    etl_instance.cleanup()

    logger.info(f"Finished ETL for dataset {dataset['name']}")
    logger.debug(
        f"Execution time for ETL for dataset {dataset['name']} was {time.time() - start_time}s"
    )


def etl_runner(
    dataset_to_run: str = None,
    use_cache: bool = False,
    no_concurrency: bool = False,
) -> None:
    """Runs all etl processes or a specific one

    Args:
        dataset_to_run (str): Run a specific ETL process. If missing, runs all processes (optional)
        use_cache (bool): Use the cached data sources – if they exist – rather than downloading them all from scratch

    Returns:
        None
    """
    dataset_list = _get_datasets_to_run(dataset_to_run)

    # Because we are memory constrained on our infrastructure,
    # we split datasets into those that are not memory intensive
    # (is_memory_intensive == False) and thereby can be safely
    # run in parallel, and those that require more RAM and thus
    # should be run sequentially. The is_memory_intensive_flag is
    # set manually in constants.py based on experience running
    # the pipeline
    concurrent_datasets = [
        dataset
        for dataset in dataset_list
        if not dataset["is_memory_intensive"]
    ]
    high_memory_datasets = [
        dataset for dataset in dataset_list if dataset["is_memory_intensive"]
    ]

    max_workers = 1 if no_concurrency else os.cpu_count()
    if concurrent_datasets:
        logger.info(f"Running concurrent ETL jobs on {max_workers} thread(s)")
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=max_workers
        ) as executor:
            futures = {
                executor.submit(
                    _run_one_dataset, dataset=dataset, use_cache=use_cache
                )
                for dataset in concurrent_datasets
            }

            for fut in concurrent.futures.as_completed(futures):
                # Calling result will raise an exception if one occurred.
                # Otherwise, the exceptions are silently ignored.
                fut.result()

    # Note: these high-memory datasets also usually require the Census GeoJSON to be
    # generated, and one of them requires the Tribal GeoJSON to be generated.
    if high_memory_datasets:
        logger.info("Running high-memory ETL jobs")
        for dataset in high_memory_datasets:
            _run_one_dataset(dataset=dataset, use_cache=use_cache)


def get_data_sources(dataset_to_run: str = None) -> [DataSource]:

    dataset_list = _get_datasets_to_run(dataset_to_run)

    sources = []

    for dataset in dataset_list:
        etl_instance = _get_dataset(dataset)
        sources.append(etl_instance.get_data_sources())

    sources = reduce(
        list.__add__, sources
    )  # flatten the list of lists into a single list

    return sources


def extract_data_sources(
    dataset_to_run: str = None, use_cache: bool = False
) -> None:

    dataset_list = _get_datasets_to_run(dataset_to_run)

    for dataset in dataset_list:
        etl_instance = _get_dataset(dataset)
        logger.info(
            f"Extracting data set for {etl_instance.__class__.__name__}"
        )
        etl_instance.extract(use_cache)


def clear_data_source_cache(dataset_to_run: str = None) -> None:

    dataset_list = _get_datasets_to_run(dataset_to_run)

    for dataset in dataset_list:
        etl_instance = _get_dataset(dataset)
        logger.info(
            f"Clearing data set cache for {etl_instance.__class__.__name__}"
        )
        etl_instance.clear_data_source_cache()


def score_generate() -> None:
    """Generates the score and saves it on the local data directory

    Args:
        None

    Returns:
        None
    """

    # Score Gen
    start_time = time.time()
    score_gen = ScoreETL()
    score_gen.extract()
    score_gen.transform()
    score_gen.load()
    logger.debug(
        f"Execution time for Score Generation was {time.time() - start_time}s"
    )


def score_post(data_source: str = "local") -> None:
    """Posts the score files to the local directory

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """
    # Post Score Processing
    start_time = time.time()
    score_post = PostScoreETL(data_source=data_source)
    score_post.extract()
    score_post.transform()
    score_post.load()
    score_post.cleanup()
    logger.debug(
        f"Execution time for Score Post was {time.time() - start_time}s"
    )


def score_geo(data_source: str = "local") -> None:
    """Generates the geojson files with score data baked in

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """

    # Score Geo
    start_time = time.time()
    score_geo = GeoScoreETL(data_source=data_source)
    score_geo.extract()
    score_geo.transform()
    score_geo.load()
    logger.debug(
        f"Execution time for Score Geo was {time.time() - start_time}s"
    )


def score_geo_gistar_burd(data_source: str = "local") -> None:
    """Generates the geojson files with score data baked in

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """

    # Score Geo
    start_time = time.time()
    score_geo_gistar_burd= GeoScoreGIStarBurdETL(data_source=data_source)
    score_geo_gistar_burd.extract()
    score_geo_gistar_burd.transform()
    score_geo_gistar_burd.load()
    logger.debug(
        f"Execution time for Score Geo GI star burden was {time.time() - start_time}s"
    )

def score_geo_gistar_ind(data_source: str = "local") -> None:
    """Generates the geojson files with score data baked in

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """

    # Score Geo
    start_time = time.time()
    score_geo_gistar_ind= GeoScoreGIStarIndETL(data_source=data_source)
    score_geo_gistar_ind.extract()
    score_geo_gistar_ind.transform()
    score_geo_gistar_ind.load()
    logger.debug(
        f"Execution time for Score Geo GI star Indicator was {time.time() - start_time}s"
    )

def score_geo_add_burd(data_source: str = "local") -> None:
    """Generates the geojson files with score data baked in

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """

    # Score Geo
    start_time = time.time()
    score_geo_add_burd = GeoScoreAddBurdETL(data_source=data_source)
    score_geo_add_burd.extract()
    score_geo_add_burd.transform()
    score_geo_add_burd.load()
    logger.debug(
        f"Execution time for Score Geo Additive Burdens was {time.time() - start_time}s"
    )

def score_geo_add_ind(data_source: str = "local") -> None:
    """Generates the geojson files with score data baked in

    Args:
        data_source (str): Source for the census data (optional)
                           Options:
                           - local (default): fetch census data from the local data directory
                           - aws: fetch census from AWS S3 J40 data repository

    Returns:
        None
    """

    # Score Geo
    start_time = time.time()
    score_geo_add_ind = GeoScoreAddIndETL(data_source=data_source)
    score_geo_add_ind.extract()
    score_geo_add_ind.transform()
    score_geo_add_ind.load()
    logger.debug(
        f"Execution time for Score Geo Additive Indicators was {time.time() - start_time}s"
    )


def _find_dataset_index(dataset_list, key, value):
    for i, element in enumerate(dataset_list):
        if element[key] == value:
            return i
    return -1
