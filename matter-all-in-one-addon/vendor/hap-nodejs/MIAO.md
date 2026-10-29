# Pinned runtime distribution for Matter All-in-One

Source: Chrisalvir1/homekit-4k v0.6.30, commit 3a8142296e3769ce775d9d6f059d3801efe56a3a. Secure Video upstream provenance and crypto/CMAF patch descriptions are retained in PATCH.md.

Runtime JavaScript, declarations, source maps, crypto source, version and production dependencies are unchanged. Development dependencies, development/publishing scripts and allowScripts were removed from this distribution manifest so npm does not install the fork development toolchain inside the add-on. No postinstall patches are used. Apache-2.0 LICENSE and upstream copyright remain. Hash manifest records the imported files and the packaging-only manifest change. CMAF ingest is not enabled by the camera engine.
