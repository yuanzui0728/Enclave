export function downloadJsonFile(filename: string, value: unknown) {
  return downloadTextFile(
    filename,
    JSON.stringify(value, null, 2),
    "application/json;charset=utf-8",
  );
}

export function downloadTextFile(
  filename: string,
  value: string,
  mimeType = "text/plain;charset=utf-8",
) {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return false;
  }

  const blob = new Blob([value], {
    type: mimeType,
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}
