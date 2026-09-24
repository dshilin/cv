"""Validate repository documentation without third-party dependencies or network."""

from datetime import date
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
REQUIRED = {"id", "status", "version", "owner", "approved_by", "last_reviewed", "scope"}
STATUSES = {"active", "draft", "in_review", "approved", "superseded", "archived"}


def without_code(text):
    result = []
    fence = None
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            marker = match.group(1)[0]
            if fence is None:
                fence = marker
            elif fence == marker:
                fence = None
            continue
        if fence is None:
            result.append(line)
    return "\n".join(result)


def metadata(text):
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing front matter")
    end = lines.index("---", 1)
    pairs = [line.split(":", 1) for line in lines[1:end] if line.strip()]
    if any(len(pair) != 2 for pair in pairs):
        raise ValueError("invalid front matter")
    fields = {key.strip(): value.strip() for key, value in pairs}
    if len(fields) != len(pairs):
        raise ValueError("duplicate metadata field")
    return fields


def anchors(text):
    result, counts = set(), {}
    for line in without_code(text).splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
        if match:
            title = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", match.group(1))
            slug = re.sub(r"[^\w\- ]", "", title.lower()).replace(" ", "-")
            count = counts.get(slug, 0)
            counts[slug] = count + 1
            result.add(slug if count == 0 else f"{slug}-{count}")
    result.update(re.findall(r'<a\s+(?:id|name)=[\"\']([^\"\']+)', text))
    return result


def main():
    errors = []
    ids = {}
    texts = {}
    files = sorted(DOCS.rglob("*.md")) + [ROOT / "AGENTS.md", ROOT / "README.md"]
    for path in files:
        label = path.relative_to(ROOT).as_posix()
        try:
            raw = path.read_bytes()
            text = raw.decode("utf-8")
            texts[path] = text
        except (OSError, UnicodeError) as exc:
            errors.append(f"{label}: {exc}")
            continue
        if raw.startswith(b"\xef\xbb\xbf") or b"\r" in raw:
            errors.append(f"{label}: expected UTF-8 without BOM and LF")
        if not raw.endswith(b"\n"):
            errors.append(f"{label}: missing final newline")
        body = without_code(text)
        if len(re.findall(r"^# .+", body, re.M)) != 1:
            errors.append(f"{label}: expected one H1")
        if path.parent == ROOT:
            continue
        try:
            fields = metadata(text)
            missing = REQUIRED - fields.keys()
            if missing or any(not fields.get(key) for key in REQUIRED):
                raise ValueError(f"missing/empty metadata: {sorted(missing)}")
            if fields["status"] not in STATUSES:
                raise ValueError("unknown status")
            if not re.fullmatch(r"[A-Z]+-\d{3}", fields["id"]):
                raise ValueError("invalid document ID")
            if fields["id"] in ids:
                raise ValueError(f"duplicate ID: {fields['id']}")
            ids[fields["id"]] = path
            if not re.fullmatch(r"\d+\.\d+", fields["version"]):
                raise ValueError("invalid version")
            date.fromisoformat(fields["last_reviewed"])
        except (ValueError, KeyError) as exc:
            errors.append(f"{label}: {exc}")

    registered = set()
    link_count = 0
    for path, text in texts.items():
        for match in re.finditer(r"!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+\"[^\"]*\")?\)", without_code(text)):
            destination = match.group(1).strip("<>")
            parsed = urlsplit(destination)
            if parsed.scheme or destination.startswith("//"):
                continue
            link_count += 1
            target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            try:
                target.relative_to(ROOT)
            except ValueError:
                errors.append(f"{path.name}: link outside project: {destination}")
                continue
            if not target.exists():
                errors.append(f"{path.name}: broken link: {destination}")
            elif parsed.fragment and target.suffix == ".md":
                target_text = texts.get(target, target.read_text(encoding="utf-8"))
                if unquote(parsed.fragment) not in anchors(target_text):
                    errors.append(f"{path.name}: missing anchor: {destination}")
            if path == DOCS / "README.md":
                registered.add(target)

    for path in sorted(DOCS.rglob("*.md")):
        if path not in registered:
            errors.append(f"not registered in docs/README.md: {path.relative_to(ROOT)}")
    for path in ROOT.glob("*.md"):
        if path.name not in {"README.md", "AGENTS.md"}:
            errors.append(f"document outside docs: {path.name}")
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        parts = path.relative_to(ROOT).parts
        if any(part.startswith(".") or part in {"node_modules", "venv", "__pycache__"} for part in parts):
            continue
        if path.suffix.lower() in {".docx", ".pdf", ".doc", ".odt", ".rtf"}:
            if len(parts) < 3 or parts[0] != "docs" or parts[1] not in {"archive", "exports"}:
                errors.append(f"non-Markdown document outside archive/exports: {path.relative_to(ROOT)}")
        if path.suffix.lower() == ".md" and path.parent != ROOT and DOCS not in path.parents:
            # README files beside implementation and installed skills may be legitimate.
            if path.name not in {"README.md", "AGENTS.md", "SKILL.md"}:
                errors.append(f"project document outside docs: {path.relative_to(ROOT)}")
    if errors:
        print("Documentation check FAILED:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Documentation check OK: {len(ids)} registered documents, {len(files)} Markdown files, {link_count} local links.")
    print("Scope: structure, metadata, encoding and local links; not product acceptance or external URLs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
