interface TagListProps {
  tags: string[];
}

export function TagList({ tags }: TagListProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="tag-list" aria-label="标签">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          #{tag}
        </span>
      ))}
    </div>
  );
}
