export function isMissingGroupError(error: unknown, groupId: string) {
  return (
    error instanceof Error && error.message.trim() === `Group ${groupId} not found`
  );
}
