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
export function drmContentFields(drm?: ChannelDrm): {
  drm_scheme: string;
  drm_license_uri: string;
  drm_license_header?: [string, string][];
} {
  if (!drm) return { drm_scheme: "", drm_license_uri: "" };
  const fields: {
    drm_scheme: string;
    drm_license_uri: string;
    drm_license_header?: [string, string][];
  } = { drm_scheme: drm.scheme, drm_license_uri: drm.licenseUrl };
  if (drm.headers && drm.headers.length > 0) fields.drm_license_header = drm.headers;
  return fields;
}
