/** Serialises structured data while neutralising `</script>` injection. */
export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
