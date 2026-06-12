import argparse
from dataclasses import dataclass
import fcntl
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
from typing import Optional, TextIO
import webbrowser

from anacronia.latent_map_embeddings import DINO_EMBEDDING_RECIPES, embed_latent_map_run
from anacronia.latent_map_atlas import generate_latent_map_thumbnail_atlas
from anacronia.latent_map_clusters import (
    GRAPH_COMMUNITY_PRESETS,
    HDBSCAN_PRESETS,
    build_graph_community_cluster_results,
    build_hdbscan_cluster_results,
)
from anacronia.latent_map_faiss import build_faiss_index, query_faiss_neighbors
from anacronia.latent_map_layout import build_latent_map_layout
from anacronia.latent_map_method_comparison import export_method_comparison
from anacronia.latent_map_result_exports import export_latent_map_results
from anacronia.latent_map_runs import initialize_latent_map_run
from anacronia.latent_map_scan import scan_latent_map_run
from anacronia.latent_map_viewer_export import export_viewer_data
from anacronia.met_ingest import rebuild_met_descriptors
from anacronia.ports import choose_port, is_port_available as socket_port_available
from anacronia.search_sets import MET_PROVIDER, SearchSet, create_or_continue_search_set
from anacronia.storage import initialize_storage


DEFAULT_UI_PORT = 18660
DEFAULT_API_PORT = 18670


def validate_supported_runtime(
    *,
    system: str = platform.system(),
    machine: str = platform.machine(),
) -> None:
    if system != "Darwin":
        raise RuntimeError("Anacronia MVP currently supports macOS on Apple Silicon only.")

    if machine not in {"arm64", "arm64e"}:
        raise RuntimeError("Anacronia MVP currently requires an Apple Silicon Mac, M1 or newer.")


@dataclass(frozen=True)
class ServicePlan:
    name: str
    command: list[str]
    cwd: Path
    environment: dict[str, str]
    setup_command: Optional[list[str]] = None


@dataclass(frozen=True)
class StartupPlan:
    ui_port: int
    api_port: int
    data_root: Path
    database_path: Path
    open_browser: bool
    ui_url: str
    message: str
    services: list[ServicePlan]


@dataclass
class DataRootRuntimeLock:
    path: Path
    handle: TextIO

    def close(self) -> None:
        fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        self.handle.close()


def acquire_data_root_runtime_lock(data_root: Path) -> DataRootRuntimeLock:
    data_root.mkdir(parents=True, exist_ok=True)
    lock_path = data_root / ".anacronia-runtime.lock"
    lock_handle = lock_path.open("a+")
    try:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        lock_handle.close()
        raise RuntimeError(
            "Anacronia is already running for this data folder. "
            "Use the existing browser window or close Anacronia before starting it again."
        ) from error

    lock_handle.seek(0)
    lock_handle.truncate()
    lock_handle.write(str(os.getpid()))
    lock_handle.flush()
    return DataRootRuntimeLock(path=lock_path, handle=lock_handle)


def build_startup_plan(
    *,
    no_open: bool,
    ui_port: Optional[int] = None,
    api_port: Optional[int] = None,
    is_port_available=socket_port_available,
    runtime_system: str = platform.system(),
    runtime_machine: str = platform.machine(),
    project_root: Optional[Path] = None,
    environment: Optional[dict[str, str]] = None,
) -> StartupPlan:
    validate_supported_runtime(system=runtime_system, machine=runtime_machine)

    selected_ui_port = (
        ui_port if ui_port is not None else choose_port(DEFAULT_UI_PORT, is_port_available=is_port_available)
    )
    selected_api_port = (
        api_port if api_port is not None else choose_port(DEFAULT_API_PORT, is_port_available=is_port_available)
    )
    ui_url = f"http://localhost:{selected_ui_port}"
    open_browser = not no_open
    message = f"Anacronia is available at {ui_url}"
    resolved_project_root = project_root if project_root is not None else Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=resolved_project_root, environment=environment)
    web_root = resolved_project_root / "web"
    next_bin = web_root / "node_modules" / "next" / "dist" / "bin" / "next"
    next_swc_path = storage.data_root / "temp" / "next-swc"
    service_environment = {
        "ANACRONIA_DATA_ROOT": str(storage.data_root),
    }

    services = [
        ServicePlan(
            name="FastAPI backend",
            command=[
                sys.executable,
                "-m",
                "uvicorn",
                "anacronia.api:create_app",
                "--host",
                "127.0.0.1",
                "--port",
                str(selected_api_port),
                "--log-level",
                "info",
                "--factory",
            ],
            cwd=resolved_project_root,
            environment=service_environment,
        ),
        ServicePlan(
            name="Python worker",
            command=[sys.executable, "-m", "anacronia.worker"],
            cwd=resolved_project_root,
            environment=service_environment,
        ),
        ServicePlan(
            name="Next.js UI",
            command=[
                "node",
                str(next_bin),
                "start",
                "--hostname",
                "127.0.0.1",
                "--port",
                str(selected_ui_port),
            ],
            cwd=web_root,
            environment={
                **service_environment,
                "ANACRONIA_API_PORT": str(selected_api_port),
                "ANACRONIA_UI_PORT": str(selected_ui_port),
                "NEXT_SWC_PATH": str(next_swc_path),
            },
            setup_command=["node", str(next_bin), "build"],
        ),
    ]

    return StartupPlan(
        ui_port=selected_ui_port,
        api_port=selected_api_port,
        data_root=storage.data_root,
        database_path=storage.database_path,
        open_browser=open_browser,
        ui_url=ui_url,
        message=message,
        services=services,
    )


def run_startup_plan(plan: StartupPlan) -> None:
    processes: list[subprocess.Popen[bytes]] = []
    runtime_lock: DataRootRuntimeLock | None = None
    try:
        runtime_lock = acquire_data_root_runtime_lock(plan.data_root)
        for service in plan.services:
            env = os.environ.copy()
            env.update(service.environment)
            if "NEXT_SWC_PATH" in env:
                Path(env["NEXT_SWC_PATH"]).mkdir(parents=True, exist_ok=True)
            if service.setup_command:
                subprocess.run(service.setup_command, cwd=service.cwd, env=env, check=True)
            processes.append(subprocess.Popen(service.command, cwd=service.cwd, env=env))

        print(plan.message, flush=True)
        if plan.open_browser:
            webbrowser.open(plan.ui_url)

        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("Stopping Anacronia...", flush=True)
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        if runtime_lock is not None:
            runtime_lock.close()


def serialize_search_set(search_set: SearchSet) -> dict[str, object]:
    return {
        "display_name": search_set.display_name,
        "slug": search_set.slug,
        "terms": [
            {
                "term": term.term,
                "active": term.active,
            }
            for term in search_set.terms
        ],
    }


def run_search_set_create(*, name: str, terms: str) -> None:
    project_root = Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=project_root)
    search_set = create_or_continue_search_set(
        database_path=storage.database_path,
        display_name=name,
        terms_text=terms,
        provider=MET_PROVIDER,
    )
    print(json.dumps(serialize_search_set(search_set)), flush=True)


def run_rebuild_descriptors() -> None:
    project_root = Path(__file__).resolve().parents[2]
    storage = initialize_storage(project_root=project_root)
    summary = rebuild_met_descriptors(database_path=storage.database_path)
    print(
        json.dumps(
            {
                "provider": summary.provider,
                "rebuilt_object_count": summary.rebuilt_object_count,
                "descriptor_count": summary.descriptor_count,
                "missing_raw_record_count": summary.missing_raw_record_count,
            }
        ),
        flush=True,
    )


def run_latent_map_init(
    *,
    source_folder: Path,
    runs_root: Path,
    run_name: str | None = None,
    allow_output_inside_source: bool = False,
) -> None:
    run = initialize_latent_map_run(
        source_folder=source_folder,
        runs_root=runs_root,
        run_name=run_name,
        allow_output_inside_source=allow_output_inside_source,
    )
    print(
        json.dumps(
            {
                "run_id": run.run_id,
                "run_dir": str(run.run_dir),
                "source_folder": str(run.source_folder),
                "config_path": str(run.config_path),
                "report_path": str(run.report_path),
            }
        ),
        flush=True,
    )


def run_latent_map_scan(*, run_dir: Path) -> None:
    summary = scan_latent_map_run(run_dir)
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "source_folder": str(summary.source_folder),
                "supported_file_count": summary.supported_file_count,
                "manifest_image_count": summary.manifest_image_count,
                "skipped_file_count": len(summary.skipped_files),
                "manifest_path": str(summary.manifest_path),
                "skipped_path": str(summary.skipped_path),
            }
        ),
        flush=True,
    )


def run_latent_map_embed(
    *,
    run_dir: Path,
    recipe_name: str,
    batch_size: int,
    limit: int | None,
    device: str = "auto",
    embedder=None,
) -> None:
    summary = embed_latent_map_run(
        run_dir=run_dir,
        recipe_name=recipe_name,
        batch_size=batch_size,
        limit=limit,
        device=device,
        embedder=embedder,
    )
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "recipe_name": summary.recipe_name,
                "model_id": summary.model_id,
                "device": summary.device,
                "vector_count": summary.vector_count,
                "vector_dim": summary.vector_dim,
                "embedding_path": str(summary.embedding_path),
                "metadata_path": str(summary.metadata_path),
                "elapsed_seconds": summary.elapsed_seconds,
            }
        ),
        flush=True,
    )


def run_latent_map_faiss_build(
    *,
    run_dir: Path,
    recipe_name: str,
    top_k: int,
) -> None:
    summary = build_faiss_index(
        run_dir=run_dir,
        recipe_name=recipe_name,
        top_k=top_k,
    )
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "recipe_name": summary.recipe_name,
                "index_kind": summary.index_kind,
                "vector_count": summary.vector_count,
                "vector_dim": summary.vector_dim,
                "index_path": str(summary.index_path),
                "id_map_path": str(summary.id_map_path),
                "neighbors_path": str(summary.neighbors_path),
            }
        ),
        flush=True,
    )


def run_latent_map_faiss_query(
    *,
    run_dir: Path,
    recipe_name: str,
    image_id: str,
    top_k: int,
    include_self: bool,
) -> None:
    neighbors = query_faiss_neighbors(
        run_dir=run_dir,
        recipe_name=recipe_name,
        image_id=image_id,
        top_k=top_k,
        include_self=include_self,
    )
    print(
        json.dumps(
            [
                {
                    "faiss_id": neighbor.faiss_id,
                    "image_id": neighbor.image_id,
                    "score": neighbor.score,
                    "source_path": neighbor.source_path,
                    "relative_path": neighbor.relative_path,
                }
                for neighbor in neighbors
            ]
        ),
        flush=True,
    )


def run_latent_map_layout(
    *,
    run_dir: Path,
    recipe_name: str,
    n_neighbors: int,
    min_dist: float,
    cluster_count: int,
    random_state: int,
    reducer=None,
    clusterer=None,
) -> None:
    summary = build_latent_map_layout(
        run_dir=run_dir,
        recipe_name=recipe_name,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        cluster_count=cluster_count,
        random_state=random_state,
        reducer=reducer,
        clusterer=clusterer,
    )
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "recipe_name": summary.recipe_name,
                "layout_id": summary.layout_id,
                "cluster_id": summary.cluster_id,
                "point_count": summary.point_count,
                "cluster_count": summary.cluster_count,
                "layout_path": str(summary.layout_path),
                "cluster_path": str(summary.cluster_path),
            }
        ),
        flush=True,
    )


def run_latent_map_hdbscan_build(
    *,
    run_dir: Path,
    recipe_name: str,
    preset: str | None = None,
) -> None:
    summaries = build_hdbscan_cluster_results(
        run_dir=run_dir,
        recipe_name=recipe_name,
        preset_slug=preset,
    )
    print(
        json.dumps(
            {
                "recipe_name": recipe_name,
                "cluster_results": [
                    {
                        "run_id": summary.run_id,
                        "cluster_id": summary.cluster_id,
                        "label": summary.label,
                        "method": summary.method,
                        "cluster_count": summary.cluster_count,
                        "unassigned_count": summary.unassigned_count,
                        "cluster_path": str(summary.cluster_path),
                    }
                    for summary in summaries
                ],
            }
        ),
        flush=True,
    )


def run_latent_map_graph_communities_build(
    *,
    run_dir: Path,
    recipe_name: str,
    preset: str | None = None,
) -> None:
    summaries = build_graph_community_cluster_results(
        run_dir=run_dir,
        recipe_name=recipe_name,
        preset_slug=preset,
    )
    print(
        json.dumps(
            {
                "recipe_name": recipe_name,
                "cluster_results": [
                    {
                        "run_id": summary.run_id,
                        "cluster_id": summary.cluster_id,
                        "label": summary.label,
                        "method": summary.method,
                        "cluster_count": summary.cluster_count,
                        "unassigned_count": summary.unassigned_count,
                        "cluster_path": str(summary.cluster_path),
                    }
                    for summary in summaries
                ],
            }
        ),
        flush=True,
    )


def run_latent_map_atlas(
    *,
    run_dir: Path,
    tile_size: int,
    atlas_size: int,
) -> None:
    summary = generate_latent_map_thumbnail_atlas(
        run_dir=run_dir,
        tile_size=tile_size,
        atlas_size=atlas_size,
    )
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "tile_size": summary.tile_size,
                "atlas_size": summary.atlas_size,
                "image_count": summary.image_count,
                "page_count": summary.page_count,
                "manifest_path": str(summary.manifest_path),
                "total_page_bytes": summary.total_page_bytes,
            }
        ),
        flush=True,
    )


def run_latent_map_viewer_export(
    *,
    run_dir: Path,
    recipe_name: str,
    layout_id: str | None = None,
    cluster_id: str | None = None,
    thumbnail_atlas_manifest_path: Path | None = None,
) -> None:
    summary = export_viewer_data(
        run_dir=run_dir,
        recipe_name=recipe_name,
        layout_id=layout_id,
        cluster_id=cluster_id,
        thumbnail_atlas_manifest_path=thumbnail_atlas_manifest_path,
    )
    output = {
        "run_id": summary.run_id,
        "recipe_name": summary.recipe_name,
        "layout_id": summary.layout_id,
        "cluster_id": summary.cluster_id,
        "point_count": summary.point_count,
        "viewer_data_path": str(summary.viewer_data_path),
        "neighbor_data_path": str(summary.neighbor_data_path),
        "map_payload_bytes": summary.map_payload_bytes,
        "neighbor_payload_bytes": summary.neighbor_payload_bytes,
    }
    if summary.thumbnail_atlas_manifest_path is not None:
        output["thumbnail_atlas_manifest_path"] = str(
            summary.thumbnail_atlas_manifest_path
        )
    print(json.dumps(output), flush=True)


def run_latent_map_method_comparison(*, run_dir: Path) -> None:
    summary = export_method_comparison(run_dir=run_dir)
    print(
        json.dumps(
            {
                "asset_kind": "latent-map-method-comparison",
                "run_id": summary.run_id,
                "comparison_path": str(summary.comparison_path),
                "embedding_count": summary.embedding_count,
                "layout_count": summary.layout_count,
                "cluster_count": summary.cluster_count,
                "hdbscan_status": summary.hdbscan_status,
            }
        ),
        flush=True,
    )


def run_latent_map_result_export(
    *,
    run_dir: Path,
    recipe_name: str,
    selected_image_ids: list[str] | None = None,
    selected_cluster_ids: list[str] | None = None,
    selected_neighbor_image_ids: list[str] | None = None,
    faiss_duplicate_threshold: float = 0.98,
) -> None:
    summary = export_latent_map_results(
        run_dir=run_dir,
        recipe_name=recipe_name,
        selected_image_ids=selected_image_ids or [],
        selected_cluster_ids=selected_cluster_ids or [],
        selected_neighbor_image_ids=selected_neighbor_image_ids or [],
        faiss_duplicate_threshold=faiss_duplicate_threshold,
    )
    print(
        json.dumps(
            {
                "run_id": summary.run_id,
                "recipe_name": summary.recipe_name,
                "layout_id": summary.layout_id,
                "cluster_id": summary.cluster_id,
                "result_path": str(summary.result_path),
                "exact_duplicate_group_count": summary.exact_duplicate_group_count,
                "faiss_candidate_count": summary.faiss_candidate_count,
                "selected_image_count": summary.selected_image_count,
                "selected_cluster_count": summary.selected_cluster_count,
                "selected_neighbor_anchor_count": summary.selected_neighbor_anchor_count,
            }
        ),
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="anacronia")
    parser.add_argument("--no-open", action="store_true", help="Print the local URL without opening a browser.")
    parser.add_argument("--ui-port", type=int, help="Port for the local Next.js UI.")
    parser.add_argument("--api-port", type=int, help="Port for the local FastAPI backend.")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("rebuild-descriptors")
    search_set_parser = subparsers.add_parser("search-set")
    search_set_subparsers = search_set_parser.add_subparsers(dest="search_set_command")
    search_set_create_parser = search_set_subparsers.add_parser("create")
    search_set_create_parser.add_argument("--name", required=True)
    search_set_create_parser.add_argument("--terms", required=True)
    latent_map_parser = subparsers.add_parser("latent-map")
    latent_map_subparsers = latent_map_parser.add_subparsers(dest="latent_map_command")
    latent_map_init_parser = latent_map_subparsers.add_parser("init")
    latent_map_init_parser.add_argument("--source-folder", required=True, type=Path)
    latent_map_init_parser.add_argument("--runs-root", required=True, type=Path)
    latent_map_init_parser.add_argument("--run-name")
    latent_map_init_parser.add_argument("--allow-output-inside-source", action="store_true")
    latent_map_scan_parser = latent_map_subparsers.add_parser("scan")
    latent_map_scan_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_embed_parser = latent_map_subparsers.add_parser("embed")
    latent_map_embed_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_embed_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_embed_parser.add_argument("--batch-size", type=int, default=8)
    latent_map_embed_parser.add_argument("--limit", type=int)
    latent_map_embed_parser.add_argument("--device", default="auto")
    latent_map_faiss_build_parser = latent_map_subparsers.add_parser("faiss-build")
    latent_map_faiss_build_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_faiss_build_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_faiss_build_parser.add_argument("--top-k", type=int, default=20)
    latent_map_faiss_query_parser = latent_map_subparsers.add_parser("faiss-query")
    latent_map_faiss_query_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_faiss_query_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_faiss_query_parser.add_argument("--image-id", required=True)
    latent_map_faiss_query_parser.add_argument("--top-k", type=int, default=20)
    latent_map_faiss_query_parser.add_argument("--include-self", action="store_true")
    latent_map_layout_parser = latent_map_subparsers.add_parser("layout")
    latent_map_layout_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_layout_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_layout_parser.add_argument("--n-neighbors", type=int, default=15)
    latent_map_layout_parser.add_argument("--min-dist", type=float, default=0.05)
    latent_map_layout_parser.add_argument("--cluster-count", type=int, default=12)
    latent_map_layout_parser.add_argument("--random-state", type=int, default=42)
    latent_map_hdbscan_parser = latent_map_subparsers.add_parser("hdbscan-build")
    latent_map_hdbscan_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_hdbscan_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_hdbscan_parser.add_argument(
        "--preset",
        choices=["all", *(preset.slug for preset in HDBSCAN_PRESETS)],
        default="all",
    )
    latent_map_graph_communities_parser = latent_map_subparsers.add_parser(
        "graph-communities-build"
    )
    latent_map_graph_communities_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_graph_communities_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_graph_communities_parser.add_argument(
        "--preset",
        choices=["all", *(preset.slug for preset in GRAPH_COMMUNITY_PRESETS)],
        default="all",
    )
    latent_map_atlas_parser = latent_map_subparsers.add_parser("atlas")
    latent_map_atlas_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_atlas_parser.add_argument(
        "--tile-size",
        choices=[32, 64, 96, 128],
        default=64,
        type=int,
    )
    latent_map_atlas_parser.add_argument("--atlas-size", type=int, default=2048)
    latent_map_viewer_export_parser = latent_map_subparsers.add_parser("viewer-export")
    latent_map_viewer_export_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_viewer_export_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_viewer_export_parser.add_argument(
        "--thumbnail-atlas-manifest",
        type=Path,
    )
    latent_map_viewer_export_parser.add_argument("--layout-id")
    latent_map_viewer_export_parser.add_argument("--cluster-id")
    latent_map_method_comparison_parser = latent_map_subparsers.add_parser(
        "method-comparison"
    )
    latent_map_method_comparison_parser.add_argument(
        "--run-dir",
        required=True,
        type=Path,
    )
    latent_map_result_export_parser = latent_map_subparsers.add_parser("result-export")
    latent_map_result_export_parser.add_argument("--run-dir", required=True, type=Path)
    latent_map_result_export_parser.add_argument(
        "--recipe",
        choices=sorted(DINO_EMBEDDING_RECIPES),
        default="dinov3_vits_256",
    )
    latent_map_result_export_parser.add_argument(
        "--selected-image-id",
        action="append",
        default=[],
        dest="selected_image_ids",
    )
    latent_map_result_export_parser.add_argument(
        "--cluster-id",
        action="append",
        default=[],
        dest="selected_cluster_ids",
    )
    latent_map_result_export_parser.add_argument(
        "--neighbor-image-id",
        action="append",
        default=[],
        dest="selected_neighbor_image_ids",
    )
    latent_map_result_export_parser.add_argument(
        "--faiss-duplicate-threshold",
        type=float,
        default=0.98,
    )
    args = parser.parse_args()

    if args.command == "search-set" and args.search_set_command == "create":
        run_search_set_create(name=args.name, terms=args.terms)
        return

    if args.command == "rebuild-descriptors":
        run_rebuild_descriptors()
        return

    if args.command == "latent-map" and args.latent_map_command == "init":
        run_latent_map_init(
            source_folder=args.source_folder,
            runs_root=args.runs_root,
            run_name=args.run_name,
            allow_output_inside_source=args.allow_output_inside_source,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "scan":
        run_latent_map_scan(run_dir=args.run_dir)
        return

    if args.command == "latent-map" and args.latent_map_command == "embed":
        run_latent_map_embed(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            batch_size=args.batch_size,
            limit=args.limit,
            device=args.device,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "faiss-build":
        run_latent_map_faiss_build(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            top_k=args.top_k,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "faiss-query":
        run_latent_map_faiss_query(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            image_id=args.image_id,
            top_k=args.top_k,
            include_self=args.include_self,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "layout":
        run_latent_map_layout(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            cluster_count=args.cluster_count,
            random_state=args.random_state,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "hdbscan-build":
        run_latent_map_hdbscan_build(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            preset=args.preset,
        )
        return

    if (
        args.command == "latent-map"
        and args.latent_map_command == "graph-communities-build"
    ):
        run_latent_map_graph_communities_build(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            preset=args.preset,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "atlas":
        run_latent_map_atlas(
            run_dir=args.run_dir,
            tile_size=args.tile_size,
            atlas_size=args.atlas_size,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "viewer-export":
        run_latent_map_viewer_export(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            layout_id=args.layout_id,
            cluster_id=args.cluster_id,
            thumbnail_atlas_manifest_path=args.thumbnail_atlas_manifest,
        )
        return

    if args.command == "latent-map" and args.latent_map_command == "method-comparison":
        run_latent_map_method_comparison(run_dir=args.run_dir)
        return

    if args.command == "latent-map" and args.latent_map_command == "result-export":
        run_latent_map_result_export(
            run_dir=args.run_dir,
            recipe_name=args.recipe,
            selected_image_ids=args.selected_image_ids,
            selected_cluster_ids=args.selected_cluster_ids,
            selected_neighbor_image_ids=args.selected_neighbor_image_ids,
            faiss_duplicate_threshold=args.faiss_duplicate_threshold,
        )
        return

    run_startup_plan(
        build_startup_plan(
            no_open=args.no_open,
            ui_port=args.ui_port,
            api_port=args.api_port,
        )
    )


if __name__ == "__main__":
    main()
