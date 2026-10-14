# Changelog

## 0.1.2

- Each model parameter starts at the model's default. Before, a toggle left untouched was sent as off, so a video model with sound on by default (Generate audio) made a silent clip.
- The model list loads as soon as the node is added. Before, it could fail with "Error fetching options" until the node was reopened.

## 0.1.1

Published from GitHub Actions with npm provenance. No code changes.

## 0.1.0

First release.

- Azurade node: Generation Create (waits for the result by default), Get and Get Many; File Upload; Account Get.
- Azurade Trigger: starts a workflow when a generation on the account finishes.
