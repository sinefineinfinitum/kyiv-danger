# Attack Probability Field (Kyiv)

A mathematical modeling tool for visualizing and analyzing air attack probabilities for buildings in Kyiv. This interactive 3D application simulates how different types of threats (drones, cruise missiles, and ballistic missiles) interact with urban geometry.

**Live Demo**: [https://sinefineinfinitum.github.io/kyiv-danger/](https://sinefineinfinitum.github.io/kyiv-danger/)

## Overview

The project provides a 3D visualization of Kyiv where users can simulate attack scenarios by specifying the quantity and direction of incoming threats. It calculates the exposure of building facades based on their orientation and shadowing from neighboring structures.

### Key Features
- **3D City Model**: Interactive 3D environment using Three.js with buildings loaded from OpenStreetMap.
- **Attack Simulation**: Support for three threat types with specific descent angles:
  - **Drones**: 10° angle
  - **Cruise Missiles**: 40° angle
  - **Ballistic Missiles**: 60° angle
- **Facade Analysis**: Detailed scoring of specific building facades (Openness × Tilt).
- **Directional Probability**: Dynamic diagrams showing threat exposure from different compass directions.
- **Threat Direction Map**: Leaflet map with switchable petal diagrams for combined or per-type threat directions.
- **Multi-language Support**: Available in Ukrainian (default), English, and Russian.

## Requirements

- A modern web browser with **WebGL 2.0** support (Chrome, Firefox, Edge, Safari).
- Local web server (for loading ES modules without CORS issues).

## Setup & Run

This is a static web application. Because it uses ES Modules and fetches data from external APIs, it must be served via a web server.

1. **Clone the repository**

2. **Run a local server**:
   ```bash
   npx serve .
   ```
   Or use Python: `python -m http.server 8000`

3. **Open in browser**: Navigate to `http://localhost:8000`

## Data Sources

- **Building geometry**: loaded from `data/buildings.json` (pre-downloaded OSM data for central Kyiv).
- **Additional areas**: fetched on demand from Overpass API when searching for addresses outside the initial area.
- **Address search**: powered by Nominatim (OpenStreetMap geocoding service).

## Project Structure

```
├── app.js                # UI, interactions, map, search
├── scene.js              # Three.js setup (renderer, camera, controls, lighting)
├── buildings.js          # OSM data loading, mesh creation, GPS conversion
├── danger.js             # Exposure computation, occlusion checks, scoring
├── direction-diagram.js  # SVG petal diagrams for threat directions
├── compass.js            # Compass widget for azimuth input
├── locale.js             # i18n strings (UA/EN/RU)
├── index.html            # Main page
├── map.html              # Standalone threat direction map page
├── style.css             # Styles
├── data/buildings.json   # Pre-downloaded OSM buildings for central Kyiv
```

## Technical Details

- **Language**: JavaScript (ES6+ modules).
- **3D Engine**: [Three.js](https://threejs.org/) (v0.160.0).
- **Maps**: [Leaflet](https://leafletjs.com/) (v1.9.4).
- **Dependencies**: loaded via CDN (unpkg.com) using import maps.

### Mathematical Model
- **Angle of Attack**: Threats descend at fixed angles relative to the horizon.
- **Exposure**: A facade is exposed if it faces the threat direction.
- **Occlusion**: Neighboring buildings block the facade; checked using 4 rays from facade patch corners.
- **Scoring**: Range 0.0 to 1.0, calculated as `share of open corners` × `facade tilt angle`.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
