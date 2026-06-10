import { Star } from "lucide-react";

export function StarRating({
  average,
  count,
  showCount = true,
  showEmpty = true,
}: {
  average: number | null;
  count: number;
  showCount?: boolean;
  showEmpty?: boolean;
}) {
  const hasRatings = count > 0;

  if (!hasRatings && !showEmpty) return null;

  const filled = hasRatings ? Math.round(average ?? 0) : 0;
  const rounded = hasRatings ? Math.round((average ?? 0) * 10) / 10 : 0;

  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-3.5 ${
            n <= filled
              ? "fill-yellow-400 text-yellow-400"
              : "fill-none text-muted-foreground"
          }`}
        />
      ))}
      {showCount && (
        <span className="ml-0.5 text-xs text-muted-foreground">
          {hasRatings ? `${rounded} (${count})` : "Not rated yet"}
        </span>
      )}
    </span>
  );
}
