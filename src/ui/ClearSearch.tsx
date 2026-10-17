import { Button } from './Button';

/** The way out of a search that found nothing (design spec d-v2-21); the search empties its box and focuses it. */
export function ClearSearch({ onClear }: { onClear: () => void }) {
  return (
    // Enter must not reach cmdk's list, which cancels it; stopping the bubble keeps the button's own activation.
    <Button variant="ghost" size="sm" onClick={onClear} onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}>
      Clear the search
    </Button>
  );
}
