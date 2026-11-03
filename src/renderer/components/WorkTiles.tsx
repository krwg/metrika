export type WorkTile = {
  id: string;
  label: string;
  hint: string;
  tone?: 'primary' | 'danger' | 'neutral' | 'accent';
  disabled?: boolean;
  onClick: () => void;
};

export default function WorkTiles({ tiles, compact = false }: { tiles: WorkTile[]; compact?: boolean }) {
  return (
    <div className={`work-tiles ${compact ? 'work-tiles-compact' : ''}`}>
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className={`work-tile tone-${tile.tone || 'neutral'} ${tile.disabled ? 'disabled' : ''}`}
          disabled={tile.disabled}
          onClick={tile.onClick}
        >
          <span className="work-tile-label">{tile.label}</span>
          <span className="work-tile-hint">{tile.hint}</span>
        </button>
      ))}
    </div>
  );
}
