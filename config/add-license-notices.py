#!/usr/bin/env python3
import argparse
import json
import posixpath
import sys
import zipfile

PLUGIN_ROOT = "opensearch-dashboards/powerEns/"
MODULES = PLUGIN_ROOT + "node_modules/"
LICENSE_PREFIXES = ("license", "licence", "copying", "notice")

MIT_TEMPLATE = """MIT License

Copyright (c) {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

# These packages are published as MIT without a license file; the holder comes from their package.json author.
MIT_WITHOUT_LICENSE_FILE = {
    "@foliojs-fork/fontkit": "Devon Govett",
    "brotli": "Devon Govett",
    "dfa": "Devon Govett",
}

ROBOTO_NOTICE = """Roboto font, embedded in pdfmake/build/vfs_fonts.js
Copyright 2011 Google Inc. All Rights Reserved.
Licensed under the Apache License, Version 2.0, reproduced below.
"""


def package_dirs(names):
    return sorted(
        {
            posixpath.dirname(name)
            for name in names
            if name.startswith(MODULES) and posixpath.basename(name) == "package.json"
        }
    )


def license_files(names, package_dir):
    prefix = package_dir + "/"
    return sorted(
        name
        for name in names
        if posixpath.dirname(name) == package_dir
        and posixpath.basename(name).lower().startswith(LICENSE_PREFIXES)
        and name.startswith(prefix)
    )


def describe_license(manifest):
    declared = manifest.get("license") or manifest.get("licenses")
    if isinstance(declared, list):
        return " OR ".join(item.get("type", "?") for item in declared)
    if isinstance(declared, dict):
        return declared.get("type", "?")
    return declared or "see license text"


def package_notice(archive, names, package_dir):
    manifest = json.loads(archive.read(package_dir + "/package.json"))
    if "name" not in manifest or "version" not in manifest:
        return None

    name, version = manifest["name"], manifest["version"]
    header = "{}@{} ({})".format(name, version, describe_license(manifest))
    texts = [
        archive.read(path).decode("utf-8", "replace").strip()
        for path in license_files(names, package_dir)
    ]
    if texts:
        return header, "\n\n".join(texts)
    if name in MIT_WITHOUT_LICENSE_FILE:
        return header, MIT_TEMPLATE.format(
            holder=MIT_WITHOUT_LICENSE_FILE[name]
        ).strip()
    raise SystemExit(
        "{}: no license file and no known license text; add it before shipping".format(
            header
        )
    )


def build_notices(archive, apache_text):
    names = archive.namelist()
    notices = {}
    for package_dir in package_dirs(names):
        notice = package_notice(archive, names, package_dir)
        if notice:
            notices[notice[0]] = notice[1]

    sections = [
        "{}\n\n{}".format(header, text) for header, text in sorted(notices.items())
    ]
    sections.append("{}\n{}".format(ROBOTO_NOTICE, apache_text.strip()))
    rule = "\n\n" + "-" * 80 + "\n\n"
    intro = "Power ENS bundles the following third-party software.\n"
    return intro + rule + rule.join(sections) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Adds the license and third-party notices to a Power ENS plugin zip."
    )
    parser.add_argument("zip", help="plugin zip built by plugin_helpers")
    parser.add_argument("license", help="the repository LICENSE")
    parser.add_argument(
        "apache", help="text of the Apache License 2.0, for the Roboto font"
    )
    args = parser.parse_args()

    with open(args.license, encoding="utf-8") as handle:
        license_text = handle.read()
    with open(args.apache, encoding="utf-8") as handle:
        apache_text = handle.read()

    with zipfile.ZipFile(args.zip, "a", zipfile.ZIP_DEFLATED) as archive:
        targets = (PLUGIN_ROOT + "LICENSE", PLUGIN_ROOT + "THIRD_PARTY_NOTICES")
        present = [name for name in targets if name in archive.namelist()]
        if present:
            raise SystemExit(
                "{}: already holds {}".format(args.zip, ", ".join(present))
            )
        notices = build_notices(archive, apache_text)
        archive.writestr(targets[0], license_text)
        archive.writestr(targets[1], notices)

    print("{}: added LICENSE and THIRD_PARTY_NOTICES".format(args.zip))
    return 0


if __name__ == "__main__":
    sys.exit(main())
