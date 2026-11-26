# Truvue

A prototype website for the Truvue mini project: confidence-mapped 3D scene reconstruction from photos and videos.

## Run the website

1. Open this repository folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` and select **Open with Live Server**.

The page loads Three.js from jsDelivr, so the browser needs an internet connection for the 3D viewer.

## What the prototype does

- Provides a dashboard for a scene workspace.
- Lets you select or drag in images and videos (JPG, PNG, WEBP, and MP4).
- Shows the selected files in the scene input list.
- Builds an interactive, image-based depth-style point cloud from the first selected file. For video, it uses a frame near the beginning.
- Shows a simulated confidence color map and a source-color view. Drag the 3D view to rotate it and scroll to zoom.

Files are read locally in the browser; this prototype does not upload them to a server.

## Important limitation

The displayed geometry, confidence percentages, and confidence colors are illustrative demo output. The website is not yet connected to COLMAP, VGGT, the Truvue error-prediction model, or conformal calibration, so it does not produce a measured 3D reconstruction or validated confidence estimate.