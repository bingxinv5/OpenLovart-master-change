from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect
from graphify.export import to_html, to_json
from graphify.extract import extract
from graphify.report import generate


def _community_labels(graph, communities: dict[int, list[str]]) -> dict[int, str]:
    labels: dict[int, str] = {}
    for community_id, node_ids in communities.items():
        ranked = sorted(node_ids, key=lambda node_id: graph.degree(node_id), reverse=True)
        top_labels: list[str] = []
        seen: set[str] = set()
        for node_id in ranked:
            label = str(graph.nodes[node_id].get("label") or node_id).strip()
            if not label:
                continue
            normalized = label.casefold()
            if normalized in seen:
                continue
            seen.add(normalized)
            top_labels.append(label)
            if len(top_labels) == 2:
                break

        if top_labels:
            labels[community_id] = " / ".join(top_labels)
        else:
            labels[community_id] = f"Community {community_id}"
    return labels


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a local, code-first graphify graph without Claude Code or OpenClaw."
    )
    parser.add_argument("root", nargs="?", default=".", help="Project root to analyze")
    parser.add_argument("--out-dir", default="graphify-out", help="Output directory")
    parser.add_argument("--no-html", action="store_true", help="Skip graph.html export")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_dir = Path(args.out_dir)
    if not root.exists():
        print(f"error: root path does not exist: {root}", file=sys.stderr)
        return 1

    detection = detect(root)
    files = detection.get("files", {})
    code_files = [root / Path(relative_path) for relative_path in files.get("code", [])]
    document_count = len(files.get("document", []))
    paper_count = len(files.get("paper", []))
    image_count = len(files.get("image", []))

    print(
        f"Corpus: {detection.get('total_files', 0)} files | code={len(code_files)} "
        f"docs={document_count} papers={paper_count} images={image_count}"
    )

    if not code_files:
        print("error: local mode only builds from code files, but no supported code files were found.", file=sys.stderr)
        return 1

    extraction = extract(code_files)
    if not extraction.get("nodes"):
        print("error: AST extraction produced no nodes.", file=sys.stderr)
        return 1

    graph = build_from_json(extraction)
    if graph.number_of_nodes() == 0:
        print("error: graph is empty after build.", file=sys.stderr)
        return 1

    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    labels = _community_labels(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    token_cost = {
        "input": extraction.get("input_tokens", 0),
        "output": extraction.get("output_tokens", 0),
    }
    questions = suggest_questions(graph, communities, labels)

    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        token_cost,
        str(root),
        suggested_questions=questions,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(out_dir / "graph.json"))

    analysis = {
        "mode": "local-code-only",
        "root": str(root),
        "communities": {str(key): value for key, value in communities.items()},
        "cohesion": {str(key): value for key, value in cohesion.items()},
        "labels": {str(key): value for key, value in labels.items()},
        "gods": gods,
        "surprises": surprises,
        "questions": questions,
        "skipped_non_code": {
            "documents": document_count,
            "papers": paper_count,
            "images": image_count,
        },
    }
    _write_json(out_dir / "local-analysis.json", analysis)
    _write_json(out_dir / "local-detect.json", detection)

    if args.no_html:
        print("HTML export skipped (--no-html)")
    elif graph.number_of_nodes() > 5000:
        print(f"HTML export skipped automatically: graph has {graph.number_of_nodes()} nodes")
    else:
        to_html(graph, communities, str(out_dir / "graph.html"), community_labels=labels)
        print(f"HTML: {out_dir / 'graph.html'}")

    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges, {len(communities)} communities")
    print(f"Report: {out_dir / 'GRAPH_REPORT.md'}")
    print(f"JSON: {out_dir / 'graph.json'}")
    if document_count or paper_count or image_count:
        print(
            "Note: local mode skipped semantic extraction for "
            f"docs={document_count}, papers={paper_count}, images={image_count}."
        )
    print("Next: use '.\\.venv\\Scripts\\graphify.exe query \"your question\"' from the project root.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())