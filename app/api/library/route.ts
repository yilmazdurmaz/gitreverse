import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 24;

type SortOption = "trending" | "newest" | "oldest";

/** Whitespace-split tokens: AND across tokens; each token may match owner, repo, or prompt. */
function searchWords(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/u)
    .map((w) => w.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as SortOption;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? String(LIMIT), 10)));

  const from = page * limit;
  const to = from + limit - 1;

  const words = searchWords(search);

  const runQuery = (orFallback: boolean) => {
    let query = supabase
      .from("prompt_cache")
      .select("id, owner, repo, prompt, cached_at, views", { count: "exact" });

    if (words.length > 0) {
      if (orFallback) {
        const clauses = words.flatMap((w) => [
          `owner.ilike.%${w}%`,
          `repo.ilike.%${w}%`,
          `prompt.ilike.%${w}%`,
        ]);
        query = query.or(clauses.join(","));
      } else {
        for (const word of words) {
          query = query.or(
            `owner.ilike.%${word}%,repo.ilike.%${word}%,prompt.ilike.%${word}%`
          );
        }
      }
    }

    switch (sort) {
      case "oldest":
        query = query.order("cached_at", { ascending: true });
        break;
      case "newest":
        query = query.order("cached_at", { ascending: false });
        break;
      case "trending":
      default:
        query = query
          .order("views", { ascending: false })
          .order("cached_at", { ascending: false });
        break;
    }

    return query.range(from, to);
  };

  const strict = await runQuery(false);
  if (strict.error) {
    return NextResponse.json({ error: strict.error.message }, { status: 500 });
  }

  let data = strict.data;
  let count = strict.count;
  const totalStrict = count ?? 0;

  if (totalStrict === 0 && words.length > 1) {
    const relaxed = await runQuery(true);
    if (relaxed.error) {
      return NextResponse.json({ error: relaxed.error.message }, { status: 500 });
    }
    data = relaxed.data;
    count = relaxed.count;
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
