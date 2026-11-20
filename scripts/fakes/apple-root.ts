/**
 * Testwurzel für die App-Store-Notifications. Die Produktionsroute prüft gegen
 * Apples Root CA G3; hier wird sie auf die eigens erzeugte Testkette aus
 * `src/lib/__fixtures__/apple/` umgebogen, damit echte signierte Payloads durch
 * Ketten- und Signaturprüfung laufen.
 */
import { rootPem } from "@/lib/__fixtures__/apple/jws.ts";

export const APPLE_ROOT_CA_G3 = rootPem;
