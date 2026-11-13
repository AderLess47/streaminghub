import type { ChannelDrm } from "../model/types";

/**
 * Übersetzt die DRM-Angaben eines Senders in die Felder, die Amazons
 * Shaka-Wrapper in `load(content, …)` erwartet.
 *
 * Ohne DRM bleiben beide Felder leer – der Wrapper trennt die
 * DRM-Konfiguration bewusst ab und ruft sonst keine DRM-Operationen auf.
 * `secure` bleibt hier `false`: Secure Buffers (Widevine L1) brauchen die
 * Manifest-Berechtigung `com.amazon.privilege.security.file-sharing` und einen
 * Gerätetest, beides ist noch nicht eingerichtet.
 */
export type DrmContentFields = {
  secure: "true" | "false";
  drm_scheme: string;
  drm_license_uri: string;
  drm_license_header?: [string, string][];
};

export function drmContentFields(drm?: ChannelDrm, secureBuffers = false): DrmContentFields {
  // Secure Buffers nur zusammen mit DRM: ohne Lizenzschlüssel gibt es nichts,
  // was in den geschützten Pfad müsste, und der Wrapper verlangt dann auch die
  // HW-Robustness (L1) ohne Nutzen.
  const secure = Boolean(drm && secureBuffers);
  if (!drm) return { secure: "false", drm_scheme: "", drm_license_uri: "" };
  const fields: DrmContentFields = {
    secure: secure ? "true" : "false",
    drm_scheme: drm.scheme,
    drm_license_uri: drm.licenseUrl,
  };
  if (drm.headers && drm.headers.length > 0) fields.drm_license_header = drm.headers;
  return fields;
}
