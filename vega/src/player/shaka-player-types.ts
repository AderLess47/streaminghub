/**
 * Die kleine Schnittstelle, die wir von Amazons Shaka-Wrapper brauchen.
 *
 * Der Wrapper selbst gehört Amazon und liegt nach dem Setup in
 * `src/shakaplayer/`; hier steht nur die Form, damit unser Code ohne ihn
 * typgeprüft werden kann. Absichtlich schmal: Was nicht gebraucht wird, wird
 * auch nicht angefasst.
 */

export type ShakaPlayerSettings = {
  secure: boolean;
  abrEnabled: boolean;
  abrMaxWidth?: number;
  abrMaxHeight?: number;
  startPosition?: number;
};

/**
 * Inhaltsobjekt des Wrappers. `container` und `type` wertet er aus, deshalb
 * sind sie gesetzt – ohne sie bricht `load()` im Wrapper ab.
 */
export type ShakaContent = {
  uri: string;
  secure: "true" | "false";
  drm_scheme: string;
  drm_license_uri: string;
  type?: "HLS" | "DASH";
  container?: string;
  start_position?: number;
  disableNativization?: boolean;
};

export type ShakaPlayerInstance = {
  /** Der eigentliche Shaka-Player; `configure` kommt aus der Shaka-API. */
  player?: { configure(path: string, value: unknown): void } | null;
  load(content: ShakaContent, autoplay: boolean): void | Promise<void>;
  unload(): void | Promise<void>;
};

// `any` ist Absicht: Der Wrapper typisiert das Element als `HTMLMediaElement`,
// bekommt von Amazon-Docs aber ein `VideoPlayer`-Objekt. Zur Laufzeit ist genau
// das richtig; die Typen der beiden Pakete passen nur nicht zueinander.
export type ShakaPlayerConstructor = new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediaElement: any,
  settings: ShakaPlayerSettings,
) => ShakaPlayerInstance;
