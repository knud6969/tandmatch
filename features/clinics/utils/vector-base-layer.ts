import L from "leaflet";
import { setWorkerUrl } from "maplibre-gl";
import { MaplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from "@/features/clinics/utils/map";

// Baggrundskortet (clinics 6.6): OpenFreeMap-vektorfliser tegnet af MapLibre GL i Leaflets flisepanel. Kun i browseren
// (clinic-map.tsx indlæses uden SSR).

// MapLibre finder ellers sin worker relativt til den bundtede fil, som ikke findes. Bundleren udgiver workerfilen som et
// asset på egen oprindelse (CSP worker-src 'self').
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

// Lagets interne felter, som rettelsen nedenfor bruger (fra @maplibre/maplibre-gl-leaflet 0.1.4).
type LayerInternals = {
  _map: L.Map | null;
  _glMap: { _actualCanvas: HTMLElement; once: (event: string, fn: () => void) => void; jumpTo: (o: object) => void } | null;
  _resizeContainer: () => void;
  _zoomEnd: () => void;
};

// Pakken tegner om i en animationsramme efter en størrelses- eller zoomændring. Fjernes kortet imens (fx ved skift til en
// profil), fejlede den med "Cannot read properties of null (reading 'getZoom')". Samme kode, men den stopper, når laget
// ikke længere er på et kort.
const SafeMaplibreGL: typeof MaplibreGL = MaplibreGL.extend({
  _transitionEnd(this: LayerInternals) {
    L.Util.requestAnimFrame(() => {
      const map = this._map;
      const gl = this._glMap;
      if (!map || !gl) return;
      const zoom = map.getZoom();
      const center = map.getCenter();
      const offset = map.latLngToContainerPoint(map.getBounds().getNorthWest());
      this._resizeContainer();
      L.DomUtil.setTransform(gl._actualCanvas, offset, 1);
      gl.once("moveend", () => {
        if (this._map && this._glMap) this._zoomEnd();
      });
      gl.jumpTo({ center, zoom: zoom - 1 });
    });
  },
});

export function createVectorBaseLayer(): L.Layer {
  return new SafeMaplibreGL({ style: MAP_STYLE_URL, attributionControl: { customAttribution: MAP_ATTRIBUTION } });
}
