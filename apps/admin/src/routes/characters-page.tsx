import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { deleteCharacter, listCharacters, type Character } from "@yinjie/contracts";
import { AppHeader, Button, Card, ErrorBlock, InlineNotice, LoadingBlock, SectionHeading, StatusPill } from "@yinjie/ui";

function relationshipTone(type: Character["relationshipType"]) {
  switch (type) {
    case "family":
      return "healthy";
    case "expert":
      return "warning";
    default:
      return "muted";
  }
}

export function CharactersPage() {
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
  const queryClient = useQueryClient();

  const charactersQuery = useQuery({
    queryKey: ["admin-characters-crud", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCharacter(id, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
      ]);
    },
  });

  const deletingCharacterId = deleteMutation.isPending ? deleteMutation.variables : null;

  useEffect(() => {
    deleteMutation.reset();
  }, [baseUrl]);

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="Registry"
        title="Character Registry"
        description="Edit the social cast that drives direct chats, group consultations, moments, feed reactions, and scene triggers."
        actions={
          <Link to="/characters/$characterId" params={{ characterId: "new" }}>
            <Button variant="primary" size="lg">New Character</Button>
          </Link>
        }
      />

      <InlineNotice tone="muted">
        先补齐角色身份、关系和 expert domains，再进入 Character Editor 细化 prompt、memory 和 reasoning。
      </InlineNotice>

      {charactersQuery.isLoading ? <LoadingBlock label="Loading character registry..." /> : null}

      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}

      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}

      {!charactersQuery.isLoading && !charactersQuery.isError && (charactersQuery.data?.length ?? 0) === 0 ? (
        <InlineNotice tone="warning">No characters yet. Create the first persona to unlock direct chat, moments, and scene triggers.</InlineNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(charactersQuery.data ?? []).map((character) => (
          <Card key={character.id} className="bg-[color:var(--surface-console)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <CharacterAvatar name={character.name} src={character.avatar} />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio || "No bio yet."}</p>
              </div>
              <StatusPill tone={relationshipTone(character.relationshipType)}>{character.relationshipType}</StatusPill>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(character.expertDomains.length ? character.expertDomains : ["general"]).map((domain) => (
                <span
                  key={domain}
                  className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                >
                  {domain}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
              <div>online: {character.isOnline ? "yes" : "no"}</div>
              <div>activity: {character.currentActivity ?? "unset"}</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/characters/$characterId"
                params={{ characterId: character.id }}
                className="inline-flex"
              >
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
              <Button
                onClick={() => deleteMutation.mutate(character.id)}
                disabled={deleteMutation.isPending}
                variant="danger"
                size="sm"
              >
                {deletingCharacterId === character.id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CharacterAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src?.trim()) {
    return <img src={src} alt={name} className="h-12 w-12 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-xl text-[color:var(--text-primary)]">
      {name.slice(0, 1)}
    </div>
  );
}
