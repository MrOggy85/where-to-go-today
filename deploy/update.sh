#!/bin/bash
# Rebuilds the image from the current working tree and restarts the app.
# The sidecar is left alone - it does not need to restart for an app change.
cd "$(dirname "$0")"
./build.sh && ./start.sh
