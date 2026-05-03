import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";

export function HomePage() {
  const charactersQ = useQuery({
    queryKey: ["wiki", "characters"],
    queryFn: () => wikiApi.listCharacters(),
  });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-2">隐界角色百科</h1>
        <p className="text-[var(--text-muted)] leading-relaxed">
          仿维基百科的角色档案协作平台。任何登录用户都可以提交对角色档案的修改，由
          <strong className="mx-1">巡查员</strong>
          审核后生效。运行参数（模型路由、活跃度等）继续由管理后台控制，本平台仅治理对外可见的内容字段。
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">所有角色词条</h2>
        {charactersQ.isLoading && <LoadingBlock />}
        {charactersQ.isError && (
          <ErrorBlock message={(charactersQ.error as Error).message} />
        )}
        {charactersQ.data && (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {charactersQ.data.map((c) => (
              <li
                key={c.id}
                className="border border-[var(--border-subtle)] rounded p-3 hover:bg-[var(--bg-canvas)]"
              >
                <Link
                  to="/character/$characterId"
                  params={{ characterId: c.id }}
                  className="font-medium hover:underline"
                >
                  {c.name}
                </Link>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {c.relationship} · {c.relationshipType}
                </div>
                <div className="text-sm mt-2 line-clamp-2">{c.bio}</div>
              </li>
            ))}
            {charactersQ.data.length === 0 && (
              <li className="text-sm text-[var(--text-muted)]">
                还没有任何角色词条。
              </li>
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
