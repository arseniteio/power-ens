#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "add-license-notices.py")
APACHE = os.path.join(HERE, "apache-2.0.txt")
ROOT = "opensearch-dashboards/powerEns/"

failures = []


def check(name, condition, detail=""):
    print(
        "{}  {}{}".format(
            "OK    " if condition else "FAIL  ",
            name,
            "" if condition else "  -> " + detail,
        )
    )
    if not condition:
        failures.append(name)


def make_zip(path, packages):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            ROOT + "package.json", json.dumps({"name": "powerEns", "version": "1.0.0"})
        )
        for directory, manifest, files in packages:
            base = ROOT + "node_modules/" + directory + "/"
            archive.writestr(base + "package.json", json.dumps(manifest))
            for name, text in files.items():
                archive.writestr(base + name, text)


def run(zip_path, license_path):
    return subprocess.run(
        [sys.executable, SCRIPT, zip_path, license_path, APACHE],
        capture_output=True,
        text=True,
    )


def read(zip_path, name):
    with zipfile.ZipFile(zip_path) as archive:
        return archive.read(ROOT + name).decode()


def main():
    with tempfile.TemporaryDirectory() as tmp:
        license_path = os.path.join(tmp, "LICENSE")
        with open(license_path, "w") as handle:
            handle.write("GNU AFFERO GENERAL PUBLIC LICENSE\n")

        shipped = os.path.join(tmp, "shipped.zip")
        make_zip(
            shipped,
            [
                (
                    "pako",
                    {"name": "pako", "version": "1.0.11", "license": "(MIT AND Zlib)"},
                    {"LICENSE": "pako license text"},
                ),
                ("dfa", {"name": "dfa", "version": "1.2.0", "license": "MIT"}, {}),
                (
                    "sax",
                    {"name": "sax", "version": "1.6.1", "license": "BlueOak-1.0.0"},
                    {"LICENSE.md": "blue oak text"},
                ),
                ("sax/lib", {"main": "sax.js"}, {}),
            ],
        )
        result = run(shipped, license_path)
        check("adds both files to the zip", result.returncode == 0, result.stderr)
        notices = read(shipped, "THIRD_PARTY_NOTICES")
        check(
            "copies the plugin license",
            read(shipped, "LICENSE") == "GNU AFFERO GENERAL PUBLIC LICENSE\n",
        )
        check(
            "lists each package with version and declared license",
            "pako@1.0.11 ((MIT AND Zlib))" in notices
            and "sax@1.6.1 (BlueOak-1.0.0)" in notices,
            notices[:400],
        )
        check(
            "includes the package license text",
            "pako license text" in notices and "blue oak text" in notices,
        )
        check(
            "writes MIT with the author for a known package without a license file",
            "dfa@1.2.0 (MIT)" in notices and "Copyright (c) Devon Govett" in notices,
        )
        check(
            "skips manifests without a name and version",
            "sax.js" not in notices and "undefined" not in notices,
        )
        check(
            "adds the Roboto notice with the Apache license",
            "Roboto font" in notices
            and "Apache License" in notices
            and "Version 2.0, January 2004" in notices,
        )

        again = run(shipped, license_path)
        check(
            "refuses a zip that already holds the files",
            again.returncode == 1 and "already holds" in again.stderr,
            again.stderr,
        )

        unknown = os.path.join(tmp, "unknown.zip")
        make_zip(
            unknown,
            [
                (
                    "mystery",
                    {"name": "mystery", "version": "0.1.0", "license": "MIT"},
                    {},
                )
            ],
        )
        result = run(unknown, license_path)
        check(
            "stops on a package with no license text",
            result.returncode == 1 and "mystery@0.1.0" in result.stderr,
            result.stderr,
        )
        with zipfile.ZipFile(unknown) as archive:
            check(
                "leaves the zip untouched when it stops",
                ROOT + "LICENSE" not in archive.namelist(),
            )

    print()
    if failures:
        print("{} test(s) failed: {}".format(len(failures), ", ".join(failures)))
        return 1
    print("all tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
