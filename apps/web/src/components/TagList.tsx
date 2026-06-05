export function TagList({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div className="tag-block">
      <h3>{title}</h3>
      {tags.length > 0 ? (
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : (
        <div className="empty-line">无</div>
      )}
    </div>
  );
}
